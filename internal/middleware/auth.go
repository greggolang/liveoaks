package middleware

import (
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

type Claims struct {
	UserID     string   `json:"user_id"`
	Role       string   `json:"role"`
	ExtraRoles []string `json:"extra_roles,omitempty"`
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
			c.Set("extra_roles", claims.ExtraRoles)
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
			role, _ := c.Get("role").(string)
			if allowed[role] {
				return next(c)
			}
			if extra, ok := c.Get("extra_roles").([]string); ok {
				for _, er := range extra {
					if allowed[er] {
						return next(c)
					}
				}
			}
			return echo.NewHTTPError(http.StatusForbidden, "insufficient permissions")
		}
	}
}

// BoardRoleList returns roles with board-level access (billing, membership, usta now included).
func BoardRoleList() []string {
	return []string{
		"admin", "president", "vice_president", "secretary", "treasurer",
		"billing", "membership", "usta", "entertainment", "house_grounds",
		"games", "pro",
	}
}
