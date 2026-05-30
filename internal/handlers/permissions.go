package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type PermissionsHandler struct {
	DB *pgxpool.Pool
}

// GetAll returns the full permissions map: { page: [role, role, ...] }
func (h *PermissionsHandler) GetAll(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT page, role FROM page_permissions ORDER BY page, role`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch permissions")
	}
	defer rows.Close()

	perms := map[string][]string{}
	for rows.Next() {
		var page, role string
		if err := rows.Scan(&page, &role); err != nil {
			continue
		}
		perms[page] = append(perms[page], role)
	}
	return c.JSON(http.StatusOK, perms)
}

// GetForRole returns pages this role can access
func (h *PermissionsHandler) GetForRole(c echo.Context) error {
	role := c.QueryParam("role")
	if role == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "role required")
	}
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT page FROM page_permissions WHERE role = $1`, role)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch permissions")
	}
	defer rows.Close()

	pages := []string{}
	for rows.Next() {
		var page string
		if err := rows.Scan(&page); err != nil {
			continue
		}
		pages = append(pages, page)
	}
	return c.JSON(http.StatusOK, pages)
}

// Toggle grants or revokes a role's access to a page
func (h *PermissionsHandler) Toggle(c echo.Context) error {
	page := c.Param("page")
	role := c.Param("role")

	// Admin always has access — can't be removed
	if role == "admin" {
		return echo.NewHTTPError(http.StatusBadRequest, "admin access cannot be restricted")
	}

	var body struct {
		Allowed bool `json:"allowed"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	if body.Allowed {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO page_permissions (page, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			page, role)
	} else {
		h.DB.Exec(c.Request().Context(),
			`DELETE FROM page_permissions WHERE page = $1 AND role = $2`,
			page, role)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"page": page, "role": role, "allowed": body.Allowed})
}
