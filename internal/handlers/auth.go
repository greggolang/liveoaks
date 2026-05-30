package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/greggolang/liveoaks/internal/middleware"
	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

type Mailer interface {
	SendPasswordReset(to, firstName, resetURL string) error
}

type AuthHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string
	SiteURL   string
	Mailer    Mailer
	Logger    interface {
		Log(ctx context.Context, event, details, userID, ip string)
	}
}

type registerRequest struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Phone     string `json:"phone"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req registerRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Email == "" || req.Password == "" || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "all fields required")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not hash password")
	}

	var user models.User
	err = h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO users (first_name, last_name, email, password_hash, phone)
		 VALUES ($1, $2, $3, $4, NULLIF($5, ''))
		 RETURNING id, first_name, last_name, email, role, status, created_at`,
		req.FirstName, req.LastName, req.Email, string(hash), req.Phone,
	).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.Role, &user.Status, &user.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "email already registered")
	}

	return c.JSON(http.StatusCreated, user)
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	var user models.User
	var role, status string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, first_name, last_name, email, password_hash, role::text, status::text FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.PasswordHash, &role, &status)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}
	user.Role = models.Role(role)
	user.Status = models.Status(status)

	if user.Status == models.StatusPending {
		return echo.NewHTTPError(http.StatusForbidden, "account pending approval")
	}
	if user.Status == models.StatusInactive {
		return echo.NewHTTPError(http.StatusForbidden, "account inactive")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		h.Logger.Log(c.Request().Context(), "login_failed", req.Email, "", c.RealIP())
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	h.Logger.Log(c.Request().Context(), "login", user.FirstName+" "+user.LastName, user.ID, c.RealIP())

	claims := &middleware.Claims{
		UserID: user.ID,
		Role:   string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.JWTSecret))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not sign token")
	}

	c.SetCookie(&http.Cookie{
		Name:     "token",
		Value:    signed,
		HttpOnly: true,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		SameSite: http.SameSiteStrictMode,
	})

	user.PasswordHash = ""
	return c.JSON(http.StatusOK, user)
}

func (h *AuthHandler) Logout(c echo.Context) error {
	c.SetCookie(&http.Cookie{
		Name:     "token",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		Expires:  time.Unix(0, 0),
	})
	return c.JSON(http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *AuthHandler) Me(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var user models.User
	var role, status string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, first_name, last_name, email, role::text, status::text, phone, created_at FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &role, &status, &user.Phone, &user.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}
	user.Role = models.Role(role)
	user.Status = models.Status(status)
	return c.JSON(http.StatusOK, user)
}

func (h *AuthHandler) ForgotPassword(c echo.Context) error {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.Bind(&req); err != nil || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email required")
	}

	var userID, firstName string
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, first_name FROM users WHERE email = $1 AND status = 'active'`, req.Email,
	).Scan(&userID, &firstName)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]string{"message": "If that email is registered, you'll receive a reset link shortly."})
	}

	b := make([]byte, 24)
	rand.Read(b)
	token := hex.EncodeToString(b)

	_, err = h.DB.Exec(c.Request().Context(),
		`INSERT INTO password_resets (token, user_id) VALUES ($1, $2)`, token, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create reset token")
	}

	resetURL := h.SiteURL + "/reset-password?token=" + token
	go h.Mailer.SendPasswordReset(req.Email, firstName, resetURL)
	h.Logger.Log(c.Request().Context(), "password_reset_requested", req.Email, userID, c.RealIP())

	return c.JSON(http.StatusOK, map[string]string{"message": "If that email is registered, you'll receive a reset link shortly."})
}

func (h *AuthHandler) ResetPassword(c echo.Context) error {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil || req.Token == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "token and password required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	var userID string
	err := h.DB.QueryRow(c.Request().Context(),
		`DELETE FROM password_resets WHERE token = $1 AND expires_at > NOW() RETURNING user_id`, req.Token,
	).Scan(&userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid or expired reset link")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not hash password")
	}

	h.DB.Exec(c.Request().Context(),
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, string(hash), userID)
	h.Logger.Log(c.Request().Context(), "password_reset_completed", "", userID, c.RealIP())

	return c.JSON(http.StatusOK, map[string]string{"message": "Password updated. You can now log in."})
}
