package middleware

import (
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

type Claims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func JWTAuth(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie("token")
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
			}
			claims := &Claims{}
			token, err := jwt.ParseWithClaims(cookie.Value, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set("user_id", claims.UserID)
			c.Set("role", claims.Role)
			return next(c)
		}
	}
}

func RequireRole(roles ...string) echo.MiddlewareFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, ok := c.Get("role").(string)
			if !ok || !allowed[role] {
				return echo.NewHTTPError(http.StatusForbidden, "insufficient permissions")
			}
			return next(c)
		}
	}
}
