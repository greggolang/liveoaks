package middleware

import (
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/greggolang/liveoaks/internal/adminperm"
	"github.com/jackc/pgx/v5/pgxpool"
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
			var raw string
			// Accept a Bearer token (used by impersonation tabs) or the HttpOnly cookie
			if auth := c.Request().Header.Get("Authorization"); len(auth) > 7 && auth[:7] == "Bearer " {
				raw = auth[7:]
			} else {
				cookie, err := c.Cookie("token")
				if err != nil {
					return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
				}
				raw = cookie.Value
			}
			claims := &Claims{}
			token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
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
		"admin", "developer", "president", "vice_president", "secretary", "treasurer",
		"billing", "membership", "usta", "entertainment", "house_grounds",
		"games", "pro",
	}
}

// rolesFromContext returns the user's primary role plus any extra roles.
func rolesFromContext(c echo.Context) []string {
	roles := []string{}
	if r, ok := c.Get("role").(string); ok && r != "" {
		roles = append(roles, r)
	}
	if extra, ok := c.Get("extra_roles").([]string); ok {
		roles = append(roles, extra...)
	}
	return roles
}

// RequireAdminSection authorizes admin-panel routes by section grant.
//
//   - Admins always pass.
//   - If the route maps to a known grantable section (see adminperm), access
//     requires a row in admin_section_permissions for one of the user's roles.
//   - If the route maps to no section, fallbackRoles are accepted instead. This
//     preserves each route group's prior RequireRole behavior for any route that
//     is intentionally not section-controlled (e.g. Mail/Passwords stay admin
//     only with an empty fallback; board-shared utility routes pass with the
//     board-role fallback).
func RequireAdminSection(pool *pgxpool.Pool, fallbackRoles ...string) echo.MiddlewareFunc {
	fb := make(map[string]bool, len(fallbackRoles))
	for _, r := range fallbackRoles {
		fb[r] = true
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			roles := rolesFromContext(c)
			for _, r := range roles {
				if r == "admin" || r == "developer" {
					return next(c)
				}
			}
			if section, known := adminperm.Resolve(c.Path()); known {
				var ok bool
				err := pool.QueryRow(c.Request().Context(),
					`SELECT EXISTS(SELECT 1 FROM admin_section_permissions WHERE section=$1 AND role = ANY($2))`,
					section, roles).Scan(&ok)
				if err == nil && ok {
					return next(c)
				}
				return echo.NewHTTPError(http.StatusForbidden, "insufficient permissions")
			}
			for _, r := range roles {
				if fb[r] {
					return next(c)
				}
			}
			return echo.NewHTTPError(http.StatusForbidden, "insufficient permissions")
		}
	}
}
