package handlers

import (
	"crypto/rand"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

type MailHandler struct {
	DB *pgxpool.Pool
}

type mailAccount struct {
	ID             string    `json:"id"`
	Address        string    `json:"address"`
	RoleLabel      string    `json:"role_label"`
	DisplayName    string    `json:"display_name"`
	AssignedUserID *string   `json:"assigned_user_id"`
	AssignedName   *string   `json:"assigned_name"`
	HasPassword    bool      `json:"has_password"`
	QuotaMB        int       `json:"quota_mb"`
	Active         bool      `json:"active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (h *MailHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT m.id, m.address, m.role_label, m.display_name,
		       m.assigned_user_id,
		       CASE WHEN u.id IS NOT NULL THEN u.first_name || ' ' || u.last_name END,
		       (m.password_hash != '') AS has_password,
		       m.quota_mb, m.active, m.created_at, m.updated_at
		FROM mail_accounts m
		LEFT JOIN users u ON u.id = m.assigned_user_id
		ORDER BY m.role_label
	`)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	defer rows.Close()

	accounts := []mailAccount{}
	for rows.Next() {
		var a mailAccount
		if err := rows.Scan(
			&a.ID, &a.Address, &a.RoleLabel, &a.DisplayName,
			&a.AssignedUserID, &a.AssignedName,
			&a.HasPassword, &a.QuotaMB, &a.Active,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
		}
		accounts = append(accounts, a)
	}
	return c.JSON(http.StatusOK, accounts)
}

func (h *MailHandler) Create(c echo.Context) error {
	var req struct {
		Address     string `json:"address"`
		RoleLabel   string `json:"role_label"`
		DisplayName string `json:"display_name"`
		QuotaMB     int    `json:"quota_mb"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "invalid request"})
	}
	if req.Address == "" || req.RoleLabel == "" || req.DisplayName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "address, role_label, and display_name are required"})
	}
	if req.QuotaMB <= 0 {
		req.QuotaMB = 1000
	}

	var id string
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO mail_accounts (address, role_label, display_name, quota_mb)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, req.Address, req.RoleLabel, req.DisplayName, req.QuotaMB).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

func (h *MailHandler) Update(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		RoleLabel   string `json:"role_label"`
		DisplayName string `json:"display_name"`
		QuotaMB     int    `json:"quota_mb"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "invalid request"})
	}
	if req.QuotaMB <= 0 {
		req.QuotaMB = 1000
	}
	_, err := h.DB.Exec(c.Request().Context(), `
		UPDATE mail_accounts
		SET role_label=$1, display_name=$2, quota_mb=$3, updated_at=NOW()
		WHERE id=$4
	`, req.RoleLabel, req.DisplayName, req.QuotaMB, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *MailHandler) ResetPassword(c echo.Context) error {
	id := c.Param("id")
	plain, hashed, err := generateMailPassword()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": "could not generate password"})
	}
	_, err = h.DB.Exec(c.Request().Context(), `
		UPDATE mail_accounts SET password_hash=$1, imap_password=$2, updated_at=NOW() WHERE id=$3
	`, hashed, plain, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]string{"password": plain})
}

func (h *MailHandler) Assign(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		UserID *string `json:"user_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "invalid request"})
	}
	_, err := h.DB.Exec(c.Request().Context(), `
		UPDATE mail_accounts SET assigned_user_id=$1, updated_at=NOW() WHERE id=$2
	`, req.UserID, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *MailHandler) MyAccount(c echo.Context) error {
	userID := c.Get("user_id").(string)

	var webmailURL string
	h.DB.QueryRow(c.Request().Context(),
		"SELECT value FROM settings WHERE key = 'webmail_url'").Scan(&webmailURL)
	if webmailURL == "" {
		webmailURL = "https://mail.dropshot.company"
	}

	var address, roleLabel, displayName string
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT address, role_label, display_name
		FROM mail_accounts
		WHERE assigned_user_id = $1 AND active = true
		ORDER BY created_at
		LIMIT 1
	`, userID).Scan(&address, &roleLabel, &displayName)
	if err != nil {
		return c.JSON(http.StatusOK, nil)
	}
	return c.JSON(http.StatusOK, map[string]string{
		"address":      address,
		"role_label":   roleLabel,
		"display_name": displayName,
		"webmail_url":  webmailURL,
	})
}

func (h *MailHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM mail_accounts WHERE id=$1`, id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.NoContent(http.StatusNoContent)
}

// generateMailPassword returns a random 16-char password and its bcrypt hash.
// Uses a charset that avoids visually ambiguous characters (0/O, 1/l/I).
func generateMailPassword() (plain, hashed string, err error) {
	const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 16)
	if _, err = rand.Read(b); err != nil {
		return
	}
	cs := []byte(charset)
	out := make([]byte, 16)
	for i, v := range b {
		out[i] = cs[int(v)%len(cs)]
	}
	plain = string(out)
	h, e := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if e != nil {
		err = e
		return
	}
	hashed = string(h)
	return
}
