package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

type UserMailer interface {
	SendWelcome(to, firstName, siteURL string) error
	SendPasswordReset(to, firstName, resetURL string) error
}

// protectedAdminEmail is permanently locked — its role, status, and email
// cannot be modified through any admin UI action.
const protectedAdminEmail = "greg@howardsmail.com"

func isProtectedUser(ctx context.Context, db *pgxpool.Pool, userID string) bool {
	var email string
	db.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	return email == protectedAdminEmail
}

type UsersHandler struct {
	DB      *pgxpool.Pool
	SiteURL string
	Mailer  UserMailer
	Logger  interface {
		Log(ctx context.Context, event, details, userID, ip string)
	}
}

func (h *UsersHandler) Create(c echo.Context) error {
	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
		Phone     string `json:"phone"`
		Password  string `json:"password"`
		Role      string `json:"role"`
		Status    string `json:"status"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name, last name, email, and password are required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}
	if req.Role == "" {
		req.Role = "member"
	}
	if req.Status == "" {
		req.Status = "active"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not hash password")
	}
	var u models.User
	var role, status string
	err = h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO users (first_name, last_name, email, password_hash, phone, role, status)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), $6, $7)
		 RETURNING id, first_name, last_name, email, role::text, status::text, created_at`,
		req.FirstName, req.LastName, req.Email, string(hash), req.Phone, req.Role, req.Status,
	).Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &role, &status, &u.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return echo.NewHTTPError(http.StatusConflict, "email already registered")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create user: "+err.Error())
	}
	u.Role = models.Role(role)
	u.Status = models.Status(status)
	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "user_created", u.FirstName+" "+u.LastName+" ("+u.Email+")", adminID, c.RealIP())
	return c.JSON(http.StatusCreated, u)
}

func (h *UsersHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT u.id, u.member_number, u.first_name, u.last_name, u.email, u.role::text, u.status::text,
		        u.phone, u.address, u.family, u.usta_ranking, to_char(u.birthday,'YYYY-MM-DD'), u.created_at,
		        EXISTS(SELECT 1 FROM family_members fm WHERE fm.user_id = u.id) AS has_family,
		        u.last_login_at, u.login_count
		 FROM users u ORDER BY u.last_name, u.first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch users")
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		var role, status string
		if err := rows.Scan(&u.ID, &u.MemberNumber, &u.FirstName, &u.LastName, &u.Email, &role, &status, &u.Phone, &u.Address, &u.Family, &u.USTARanking, &u.Birthday, &u.CreatedAt, &u.HasFamily, &u.LastLoginAt, &u.LoginCount); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "could not scan user")
		}
		u.Role = models.Role(role)
		u.Status = models.Status(status)
		users = append(users, u)
	}
	return c.JSON(http.StatusOK, users)
}

func (h *UsersHandler) UpdateProfile(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		FirstName   string `json:"first_name"`
		LastName    string `json:"last_name"`
		Email       string `json:"email"`
		Phone       string `json:"phone"`
		Address     string `json:"address"`
		Family      string `json:"family"`
		USTARanking string `json:"usta_ranking"`
		Birthday    string `json:"birthday"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	// Prevent the protected account's email from being changed (would bypass all other guards).
	if req.Email != protectedAdminEmail {
		var currentEmail string
		h.DB.QueryRow(c.Request().Context(), `SELECT email FROM users WHERE id = $1`, id).Scan(&currentEmail)
		if currentEmail == protectedAdminEmail {
			return echo.NewHTTPError(http.StatusForbidden, "this account is protected and cannot be modified")
		}
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET first_name=$1, last_name=$2, email=$3, phone=NULLIF($4,''),
		 address=NULLIF($5,''), family=NULLIF($6,''), usta_ranking=NULLIF($7,''),
		 birthday=NULLIF($8,'')::date, updated_at=NOW() WHERE id=$9`,
		req.FirstName, req.LastName, req.Email, req.Phone, req.Address, req.Family, req.USTARanking, req.Birthday, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update profile")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "profile updated"})
}

func (h *UsersHandler) UpdateRole(c echo.Context) error {
	id := c.Param("id")
	if isProtectedUser(c.Request().Context(), h.DB, id) {
		return echo.NewHTTPError(http.StatusForbidden, "this account is protected and cannot be modified")
	}
	var body struct {
		Role models.Role `json:"role"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	validRoles := map[models.Role]bool{
		models.RoleAdmin: true, models.RolePresident: true, models.RoleVicePresident: true,
		models.RoleSecretary: true, models.RoleTreasurer: true, models.RoleEntertainment: true,
		models.RoleHouseGrounds: true, models.RoleBilling: true, models.RoleMembership: true,
		models.RoleUSTA: true, models.RoleGames: true, models.RolePro: true, models.RoleMember: true,
	}
	if !validRoles[body.Role] {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid role")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, body.Role, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update role")
	}
	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "user_role_changed",
		id+" → "+string(body.Role), adminID, c.RealIP())
	return c.JSON(http.StatusOK, map[string]string{"message": "role updated"})
}

func (h *UsersHandler) UpdateStatus(c echo.Context) error {
	id := c.Param("id")
	if isProtectedUser(c.Request().Context(), h.DB, id) {
		return echo.NewHTTPError(http.StatusForbidden, "this account is protected and cannot be modified")
	}
	var body struct {
		Status models.Status `json:"status"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if body.Status != models.StatusActive && body.Status != models.StatusInactive && body.Status != models.StatusPending {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}

	var email, firstName, prevStatus string
	h.DB.QueryRow(c.Request().Context(),
		`SELECT email, first_name, status::text FROM users WHERE id = $1`, id,
	).Scan(&email, &firstName, &prevStatus)

	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, body.Status, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update status")
	}

	if body.Status == models.StatusActive && prevStatus != "active" && email != "" {
		bgCtx := context.Background()
		adminIP := c.RealIP()
		go func() {
			if err := h.Mailer.SendWelcome(email, firstName, h.SiteURL); err != nil {
				println("EMAIL ERROR:", err.Error())
				h.Logger.Log(bgCtx, "email_error", "welcome to "+email+": "+err.Error(), id, adminIP)
			} else {
				println("EMAIL SENT to", email)
				h.Logger.Log(bgCtx, "email_sent", "welcome to "+email, id, adminIP)
			}
		}()
	}

	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "user_status_changed",
		firstName+" "+email+" → "+string(body.Status), adminID, c.RealIP())

	return c.JSON(http.StatusOK, map[string]string{"message": "status updated"})
}

func (h *UsersHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	if isProtectedUser(c.Request().Context(), h.DB, id) {
		return echo.NewHTTPError(http.StatusForbidden, "this account is protected and cannot be modified")
	}
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete user")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *UsersHandler) ForcePasswordReset(c echo.Context) error {
	userID := c.Param("id")

	var firstName, email string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT first_name, email FROM users WHERE id = $1 AND status = 'active'`, userID,
	).Scan(&firstName, &email)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found or not active")
	}

	h.DB.Exec(c.Request().Context(), `DELETE FROM password_resets WHERE user_id = $1`, userID)

	b := make([]byte, 24)
	rand.Read(b)
	token := hex.EncodeToString(b)

	if _, err = h.DB.Exec(c.Request().Context(),
		`INSERT INTO password_resets (token, user_id) VALUES ($1, $2)`, token, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create reset token")
	}

	resetURL := h.SiteURL + "/reset-password?token=" + token
	adminID := c.Get("user_id").(string)
	h.Logger.Log(c.Request().Context(), "force_password_reset", email, adminID, c.RealIP())

	emailSent := true
	emailError := ""
	if err := h.Mailer.SendPasswordReset(email, firstName, resetURL); err != nil {
		emailSent = false
		emailError = err.Error()
		h.Logger.Log(c.Request().Context(), "email_error", "force reset to "+email+": "+err.Error(), adminID, c.RealIP())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"reset_url":   resetURL,
		"email_sent":  emailSent,
		"email_error": emailError,
	})
}
