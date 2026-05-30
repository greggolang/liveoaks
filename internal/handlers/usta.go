package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type USTAHandler struct {
	DB *pgxpool.Pool
}

type USTATeam struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Level       string    `json:"level"`
	Gender      string    `json:"gender"`
	CaptainID   *string   `json:"captain_id,omitempty"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	Members     []string  `json:"members,omitempty"`
}

func (h *USTAHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT t.id, t.name, t.level, t.gender, t.captain_id, t.description, t.created_at,
		        COALESCE(array_agg(u.first_name || ' ' || u.last_name) FILTER (WHERE u.id IS NOT NULL), '{}')
		 FROM usta_teams t
		 LEFT JOIN usta_team_members tm ON tm.team_id = t.id
		 LEFT JOIN users u ON u.id = tm.user_id
		 GROUP BY t.id ORDER BY t.gender, t.level`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch teams")
	}
	defer rows.Close()

	teams := []USTATeam{}
	for rows.Next() {
		var t USTATeam
		if err := rows.Scan(&t.ID, &t.Name, &t.Level, &t.Gender, &t.CaptainID, &t.Description, &t.CreatedAt, &t.Members); err != nil {
			continue
		}
		teams = append(teams, t)
	}
	return c.JSON(http.StatusOK, teams)
}

func (h *USTAHandler) Create(c echo.Context) error {
	var req struct {
		Name        string `json:"name"`
		Level       string `json:"level"`
		Gender      string `json:"gender"`
		Description string `json:"description"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	captainID := c.Get("user_id").(string)
	var t USTATeam
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO usta_teams (name, level, gender, captain_id, description)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''))
		 RETURNING id, name, level, gender, captain_id, description, created_at`,
		req.Name, req.Level, req.Gender, captainID, req.Description,
	).Scan(&t.ID, &t.Name, &t.Level, &t.Gender, &t.CaptainID, &t.Description, &t.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create team")
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *USTAHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM usta_teams WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
}
