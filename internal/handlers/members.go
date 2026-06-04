package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type MembersHandler struct {
	DB *pgxpool.Pool
}

type MemberContact struct {
	ID             string    `json:"id"`
	FirstName      string    `json:"first_name"`
	LastName       string    `json:"last_name"`
	Email          string    `json:"email"`
	Phone          *string   `json:"phone,omitempty"`
	Address        *string   `json:"address,omitempty"`
	Family         *string   `json:"family,omitempty"`
	USTARanking    *string   `json:"usta_ranking,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	PhotoURL       *string   `json:"photo_url,omitempty"`
	Household      []string  `json:"household,omitempty"`
	IsFamilyMember bool      `json:"is_family_member"`
}

func (h *MembersHandler) Directory(c echo.Context) error {
	role, _ := c.Get("role").(string)
	boardRoles := map[string]bool{
		"admin": true, "president": true, "vice_president": true,
		"secretary": true, "treasurer": true, "entertainment": true, "house_grounds": true,
	}
	isBoard := boardRoles[role]

	var query string
	if isBoard {
		query = `SELECT id, first_name, last_name, email, phone, address, family, usta_ranking, created_at, photo_filename,
		                EXISTS(SELECT 1 FROM family_members WHERE linked_user_id = users.id) AS is_family_member
		         FROM users WHERE status = 'active' ORDER BY last_name, first_name`
	} else {
		query = `SELECT id, first_name, last_name, email, NULL, NULL, family, usta_ranking, created_at, photo_filename,
		                EXISTS(SELECT 1 FROM family_members WHERE linked_user_id = users.id) AS is_family_member
		         FROM users WHERE status = 'active' ORDER BY last_name, first_name`
	}

	ctx := c.Request().Context()
	rows, err := h.DB.Query(ctx, query)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch members")
	}
	defer rows.Close()

	members := []MemberContact{}
	for rows.Next() {
		var m MemberContact
		var photo *string
		if err := rows.Scan(&m.ID, &m.FirstName, &m.LastName, &m.Email, &m.Phone, &m.Address, &m.Family, &m.USTARanking, &m.CreatedAt, &photo, &m.IsFamilyMember); err != nil {
			continue
		}
		if photo != nil && *photo != "" {
			url := "/uploads/avatars/" + *photo
			m.PhotoURL = &url
		}
		members = append(members, m)
	}
	rows.Close()

	// Attach each member's household (their registered family members' first names).
	household := map[string][]string{}
	if frows, err := h.DB.Query(ctx,
		`SELECT user_id::text, first_name FROM family_members ORDER BY first_name`); err == nil {
		for frows.Next() {
			var uid, fn string
			if frows.Scan(&uid, &fn) == nil {
				household[uid] = append(household[uid], fn)
			}
		}
		frows.Close()
	}
	for i := range members {
		if names, ok := household[members[i].ID]; ok {
			members[i].Household = names
		}
	}

	return c.JSON(http.StatusOK, members)
}
