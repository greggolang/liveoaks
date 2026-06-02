package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type PasswordsHandler struct {
	DB     *pgxpool.Pool
	Secret string
}

func (h *PasswordsHandler) encryptionKey() []byte {
	hash := sha256.Sum256([]byte("passwords:" + h.Secret))
	return hash[:]
}

func (h *PasswordsHandler) encrypt(plaintext string) (string, error) {
	key := h.encryptionKey()
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (h *PasswordsHandler) decrypt(encoded string) string {
	if encoded == "" {
		return ""
	}
	key := h.encryptionKey()
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return ""
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return ""
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ""
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return ""
	}
	plaintext, err := gcm.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return ""
	}
	return string(plaintext)
}

type adminPasswordEntry struct {
	ID            string  `json:"id"`
	Label         string  `json:"label"`
	Username      string  `json:"username"`
	Password      string  `json:"password"`
	URL           string  `json:"url"`
	Category      string  `json:"category"`
	Notes         string  `json:"notes"`
	CreatedBy     *string `json:"created_by"`
	CreatedByName string  `json:"created_by_name"`
	UpdatedBy     *string `json:"updated_by"`
	UpdatedByName string  `json:"updated_by_name"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

func (h *PasswordsHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT p.id, p.label, p.username, p.password_enc, p.url, p.category, p.notes,
		       p.created_by,
		       COALESCE(cu.first_name || ' ' || cu.last_name, 'Unknown') AS created_by_name,
		       p.updated_by,
		       COALESCE(uu.first_name || ' ' || uu.last_name, '') AS updated_by_name,
		       to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM admin_passwords p
		LEFT JOIN users cu ON cu.id = p.created_by
		LEFT JOIN users uu ON uu.id = p.updated_by
		ORDER BY p.category ASC, p.label ASC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch passwords")
	}
	defer rows.Close()

	result := []adminPasswordEntry{}
	for rows.Next() {
		var p adminPasswordEntry
		var enc string
		if err := rows.Scan(
			&p.ID, &p.Label, &p.Username, &enc, &p.URL, &p.Category, &p.Notes,
			&p.CreatedBy, &p.CreatedByName,
			&p.UpdatedBy, &p.UpdatedByName,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			continue
		}
		p.Password = h.decrypt(enc)
		result = append(result, p)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *PasswordsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Label    string `json:"label"`
		Username string `json:"username"`
		Password string `json:"password"`
		URL      string `json:"url"`
		Category string `json:"category"`
		Notes    string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Label) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "label is required")
	}

	enc, err := h.encrypt(req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not encrypt password")
	}

	var p adminPasswordEntry
	var encOut string
	err = h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO admin_passwords (label, username, password_enc, url, category, notes, created_by, updated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		RETURNING id, label, username, password_enc, url, category, notes,
		          created_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $7),
		          updated_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $7),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Label, req.Username, enc, req.URL, req.Category, req.Notes, userID,
	).Scan(
		&p.ID, &p.Label, &p.Username, &encOut, &p.URL, &p.Category, &p.Notes,
		&p.CreatedBy, &p.CreatedByName,
		&p.UpdatedBy, &p.UpdatedByName,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create entry")
	}
	p.Password = req.Password
	return c.JSON(http.StatusCreated, p)
}

func (h *PasswordsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Label    string `json:"label"`
		Username string `json:"username"`
		Password string `json:"password"`
		URL      string `json:"url"`
		Category string `json:"category"`
		Notes    string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Label) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "label is required")
	}

	enc, err := h.encrypt(req.Password)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not encrypt password")
	}

	var p adminPasswordEntry
	var encOut string
	err = h.DB.QueryRow(c.Request().Context(), `
		UPDATE admin_passwords
		SET label = $1, username = $2, password_enc = $3, url = $4, category = $5, notes = $6,
		    updated_by = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING id, label, username, password_enc, url, category, notes,
		          created_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = created_by),
		          updated_by,
		          (SELECT first_name || ' ' || last_name FROM users WHERE id = $7),
		          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Label, req.Username, enc, req.URL, req.Category, req.Notes, userID, id,
	).Scan(
		&p.ID, &p.Label, &p.Username, &encOut, &p.URL, &p.Category, &p.Notes,
		&p.CreatedBy, &p.CreatedByName,
		&p.UpdatedBy, &p.UpdatedByName,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "entry not found")
	}
	p.Password = req.Password
	return c.JSON(http.StatusOK, p)
}

func (h *PasswordsHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM admin_passwords WHERE id = $1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete entry")
	}
	return c.NoContent(http.StatusNoContent)
}
