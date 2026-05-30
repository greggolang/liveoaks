package middleware

import (
	"context"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

type ActivityLogger interface {
	Log(ctx context.Context, event, details, userID, ip string)
}

func ErrorLogger(log ActivityLogger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := next(c)
			if err == nil {
				return nil
			}

			// Only log actual errors, not normal redirects
			code := http.StatusInternalServerError
			msg := err.Error()
			if he, ok := err.(*echo.HTTPError); ok {
				code = he.Code
				msg = fmt.Sprintf("%v", he.Message)
			}

			// Skip 401 (unauthenticated page loads) and 404 (static asset misses)
			if code == http.StatusUnauthorized || code == http.StatusNotFound {
				return err
			}

			userID, _ := c.Get("user_id").(string)
			details := fmt.Sprintf("%s %s → %d: %s", c.Request().Method, c.Path(), code, msg)
			log.Log(c.Request().Context(), "app_error", details, userID, c.RealIP())

			return err
		}
	}
}
