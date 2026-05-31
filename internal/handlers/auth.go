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
		`SELECT id, first_name, last_name, email, password_hash, role::text, status::text,
		        COALESCE(extra_roles, ARRAY[]::text[])
		 FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &user.PasswordHash, &role, &status, &user.ExtraRoles)
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
		UserID:     user.ID,
		Role:       string(user.Role),
		ExtraRoles: user.ExtraRoles,
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
	var isFamilyMember bool
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT id, first_name, last_name, email, role::text, status::text, phone, address, family, usta_ranking, created_at,
		        COALESCE(extra_roles, ARRAY[]::text[]),
		        EXISTS(SELECT 1 FROM family_members WHERE linked_user_id = $1) AS is_family_member
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email, &role, &status, &user.Phone, &user.Address, &user.Family, &user.USTARanking, &user.CreatedAt, &user.ExtraRoles, &isFamilyMember)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}
	user.Role = models.Role(role)
	user.Status = models.Status(status)
	// Return as a map so we can include the virtual is_family_member field
	return c.JSON(http.StatusOK, map[string]interface{}{
		"id": user.ID, "first_name": user.FirstName, "last_name": user.LastName,
		"email": user.Email, "role": user.Role, "status": user.Status,
		"phone": user.Phone, "address": user.Address, "family": user.Family,
		"usta_ranking": user.USTARanking, "created_at": user.CreatedAt,
		"extra_roles": user.ExtraRoles, "is_family_member": isFamilyMember,
	})
}

func (h *AuthHandler) UpdateProfile(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		FirstName   string `json:"first_name"`
		LastName    string `json:"last_name"`
		Phone       string `json:"phone"`
		Address     string `json:"address"`
		Family      string `json:"family"`
		USTARanking string `json:"usta_ranking"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE users SET first_name=$1, last_name=$2, phone=NULLIF($3,''),
		 address=NULLIF($4,''), family=NULLIF($5,''), usta_ranking=NULLIF($6,''), updated_at=NOW() WHERE id=$7`,
		req.FirstName, req.LastName, req.Phone, req.Address, req.Family, req.USTARanking, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update profile")
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "profile updated"})
}

func (h *AuthHandler) ChangePassword(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := c.Bind(&req); err != nil || req.Current == "" || req.New == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "current and new password required")
	}
	if len(req.New) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}
	var hash string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Current)); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.New), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not hash password")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, string(newHash), userID)
	return c.JSON(http.StatusOK, map[string]string{"message": "password changed"})
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
	ip := c.RealIP()
	bgCtx := context.Background()
	go func() {
		if err := h.Mailer.SendPasswordReset(req.Email, firstName, resetURL); err != nil {
			println("EMAIL ERROR:", err.Error())
			h.Logger.Log(bgCtx, "email_error", "password reset to "+req.Email+": "+err.Error(), userID, ip)
		} else {
			println("EMAIL SENT to", req.Email)
			h.Logger.Log(bgCtx, "email_sent", "password reset to "+req.Email, userID, ip)
		}
	}()
	h.Logger.Log(bgCtx, "password_reset_requested", req.Email, userID, ip)

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
