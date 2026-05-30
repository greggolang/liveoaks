package handlers

import (
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/greggolang/liveoaks/internal/middleware"
	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string
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
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

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
