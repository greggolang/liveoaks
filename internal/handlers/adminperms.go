package handlers

import (
	"net/http"

	"github.com/greggolang/liveoaks/internal/adminperm"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// AdminPermsHandler manages per-role access to admin-panel sections.
type AdminPermsHandler struct {
	DB *pgxpool.Pool
}

// Sections returns the catalog of grantable admin sections (admin only).
func (h *AdminPermsHandler) Sections(c echo.Context) error {
	return c.JSON(http.StatusOK, adminperm.Catalog)
}

// GetAll returns the full grant map: { section: [role, role, ...] } (admin only).
func (h *AdminPermsHandler) GetAll(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT section, role FROM admin_section_permissions ORDER BY section, role`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch permissions")
	}
	defer rows.Close()

	perms := map[string][]string{}
	for rows.Next() {
		var section, role string
		if err := rows.Scan(&section, &role); err != nil {
			continue
		}
		perms[section] = append(perms[section], role)
	}
	return c.JSON(http.StatusOK, perms)
}

// Toggle grants or revokes a role's access to an admin section (admin only).
func (h *AdminPermsHandler) Toggle(c echo.Context) error {
	section := c.Param("section")
	role := c.Param("role")

	if role == "admin" {
		return echo.NewHTTPError(http.StatusBadRequest, "admin access cannot be restricted")
	}
	if !adminperm.IsValidSection(section) {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown section")
	}

	var body struct {
		Allowed bool `json:"allowed"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	if body.Allowed {
		h.DB.Exec(c.Request().Context(),
			`INSERT INTO admin_section_permissions (section, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			section, role)
	} else {
		h.DB.Exec(c.Request().Context(),
			`DELETE FROM admin_section_permissions WHERE section = $1 AND role = $2`,
			section, role)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"section": section, "role": role, "allowed": body.Allowed})
}

// Mine returns the admin section keys the current user can open. Admins get the
// full catalog; everyone else gets the sections granted to their role(s). Used
// by the frontend to decide which admin nav links to show.
func (h *AdminPermsHandler) Mine(c echo.Context) error {
	role, _ := c.Get("role").(string)
	roles := []string{role}
	if extra, ok := c.Get("extra_roles").([]string); ok {
		roles = append(roles, extra...)
	}
	for _, r := range roles {
		if r == "admin" {
			keys := make([]string, 0, len(adminperm.Catalog))
			for _, s := range adminperm.Catalog {
				keys = append(keys, s.Key)
			}
			return c.JSON(http.StatusOK, keys)
		}
	}

	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT DISTINCT section FROM admin_section_permissions WHERE role = ANY($1)`, roles)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch permissions")
	}
	defer rows.Close()
	sections := []string{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err == nil {
			sections = append(sections, s)
		}
	}
	return c.JSON(http.StatusOK, sections)
}
