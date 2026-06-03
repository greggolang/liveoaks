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

// MyPages returns the distinct pages the current user can access based on their role(s).
// Admin access is handled client-side (admins always have everything).
// The 'pro' role implicitly has teaching_pro_booking even without a DB row.
func (h *PermissionsHandler) MyPages(c echo.Context) error {
	userID, _ := c.Get("user_id").(string)
	role, _ := c.Get("role").(string)
	roles := []string{role}
	if extra, ok := c.Get("extra_roles").([]string); ok {
		roles = append(roles, extra...)
	}
	ctx := c.Request().Context()

	rows, err := h.DB.Query(ctx,
		`SELECT DISTINCT page FROM page_permissions WHERE role = ANY($1)`, roles)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch permissions")
	}
	defer rows.Close()
	pageSet := map[string]struct{}{}
	for rows.Next() {
		var page string
		if err := rows.Scan(&page); err == nil {
			pageSet[page] = struct{}{}
		}
	}
	// 'pro' role always has teaching_pro_booking
	for _, r := range roles {
		if r == "pro" {
			pageSet["teaching_pro_booking"] = struct{}{}
			break
		}
	}
	// Apply per-member overrides: allow adds a page, deny removes one.
	if userID != "" {
		orows, oerr := h.DB.Query(ctx, `SELECT page, allow FROM user_page_permissions WHERE user_id=$1`, userID)
		if oerr == nil {
			for orows.Next() {
				var page string
				var allow bool
				if orows.Scan(&page, &allow) == nil {
					if allow {
						pageSet[page] = struct{}{}
					} else {
						delete(pageSet, page)
					}
				}
			}
			orows.Close()
		}
	}

	pages := make([]string, 0, len(pageSet))
	for p := range pageSet {
		pages = append(pages, p)
	}
	return c.JSON(http.StatusOK, pages)
}

// GetUserPerms returns, for one member, the pages granted by their role(s) and
// any explicit per-member overrides, so the admin UI can show inherit/on/off.
func (h *PermissionsHandler) GetUserPerms(c echo.Context) error {
	userID := c.Param("userId")
	ctx := c.Request().Context()

	var role string
	var extra []string
	if err := h.DB.QueryRow(ctx,
		`SELECT role::text, COALESCE(extra_roles, '{}') FROM users WHERE id=$1`, userID).Scan(&role, &extra); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "member not found")
	}
	roles := append([]string{role}, extra...)

	rolePages := []string{}
	if rows, err := h.DB.Query(ctx, `SELECT DISTINCT page FROM page_permissions WHERE role = ANY($1)`, roles); err == nil {
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil {
				rolePages = append(rolePages, p)
			}
		}
		rows.Close()
	}

	overrides := map[string]bool{}
	if rows, err := h.DB.Query(ctx, `SELECT page, allow FROM user_page_permissions WHERE user_id=$1`, userID); err == nil {
		for rows.Next() {
			var p string
			var a bool
			if rows.Scan(&p, &a) == nil {
				overrides[p] = a
			}
		}
		rows.Close()
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"role":       role,
		"roles":      roles,
		"role_pages": rolePages,
		"overrides":  overrides,
	})
}

// SetUserPerm sets a per-member override for one page: "on" (always allow),
// "off" (always deny), or "inherit" (clear the override, fall back to role).
func (h *PermissionsHandler) SetUserPerm(c echo.Context) error {
	userID := c.Param("userId")
	page := c.Param("page")
	var body struct {
		State string `json:"state"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	ctx := c.Request().Context()
	switch body.State {
	case "inherit":
		h.DB.Exec(ctx, `DELETE FROM user_page_permissions WHERE user_id=$1 AND page=$2`, userID, page)
	case "on":
		h.DB.Exec(ctx, `INSERT INTO user_page_permissions (user_id, page, allow) VALUES ($1,$2,true)
			ON CONFLICT (user_id, page) DO UPDATE SET allow=true`, userID, page)
	case "off":
		h.DB.Exec(ctx, `INSERT INTO user_page_permissions (user_id, page, allow) VALUES ($1,$2,false)
			ON CONFLICT (user_id, page) DO UPDATE SET allow=false`, userID, page)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "state must be on, off or inherit")
	}
	return c.JSON(http.StatusOK, map[string]string{"page": page, "state": body.State})
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
