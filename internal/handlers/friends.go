package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FriendsHandler struct {
	DB *pgxpool.Pool
}

type Friend struct {
	ID           string    `json:"id"`
	MemberID     string    `json:"member_id"`
	FriendUserID *string   `json:"friend_user_id,omitempty"`
	FriendName   string    `json:"friend_name"`
	FriendEmail  *string   `json:"friend_email,omitempty"`
	IsGuest      bool      `json:"is_guest"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *FriendsHandler) List(c echo.Context) error {
	memberID := c.Get("user_id").(string)

	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT f.id, f.member_id, f.friend_user_id,
		       COALESCE(u.first_name || ' ' || u.last_name, f.friend_name) as name,
		       COALESCE(u.email, f.friend_email) as email,
		       f.friend_user_id IS NULL as is_guest,
		       f.created_at
		FROM friends f
		LEFT JOIN users u ON u.id = f.friend_user_id
		WHERE f.member_id = $1
		ORDER BY name`, memberID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch friends")
	}
	defer rows.Close()

	friends := []Friend{}
	for rows.Next() {
		var f Friend
		if err := rows.Scan(&f.ID, &f.MemberID, &f.FriendUserID, &f.FriendName, &f.FriendEmail, &f.IsGuest, &f.CreatedAt); err != nil {
			continue
		}
		friends = append(friends, f)
	}
	return c.JSON(http.StatusOK, friends)
}

func (h *FriendsHandler) AddMember(c echo.Context) error {
	memberID := c.Get("user_id").(string)
	var req struct {
		FriendUserID string `json:"friend_user_id"`
	}
	if err := c.Bind(&req); err != nil || req.FriendUserID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "friend_user_id required")
	}
	if req.FriendUserID == memberID {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot add yourself")
	}

	var f Friend
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO friends (member_id, friend_user_id)
		VALUES ($1, $2)
		ON CONFLICT (member_id, friend_user_id) DO NOTHING
		RETURNING id, member_id, friend_user_id, created_at`,
		memberID, req.FriendUserID,
	).Scan(&f.ID, &f.MemberID, &f.FriendUserID, &f.CreatedAt)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]string{"message": "already in friends list"})
	}
	return c.JSON(http.StatusCreated, f)
}

func (h *FriendsHandler) AddGuest(c echo.Context) error {
	memberID := c.Get("user_id").(string)
	var req struct {
		Name  string `json:"friend_name"`
		Email string `json:"friend_email"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and email required")
	}

	var f Friend
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO friends (member_id, friend_name, friend_email)
		VALUES ($1, $2, $3)
		RETURNING id, member_id, friend_user_id, friend_name, friend_email, created_at`,
		memberID, req.Name, req.Email,
	).Scan(&f.ID, &f.MemberID, &f.FriendUserID, &f.FriendName, &f.FriendEmail, &f.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add guest")
	}
	f.IsGuest = true
	return c.JSON(http.StatusCreated, f)
}

func (h *FriendsHandler) Remove(c echo.Context) error {
	memberID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM friends WHERE id = $1 AND member_id = $2`,
		c.Param("id"), memberID)
	return c.NoContent(http.StatusNoContent)
}

func (h *FriendsHandler) SearchMembers(c echo.Context) error {
	q := "%" + c.QueryParam("q") + "%"
	memberID := c.Get("user_id").(string)

	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, first_name, last_name, email
		FROM users
		WHERE status = 'active'
		  AND id != $1
		  AND (first_name || ' ' || last_name ILIKE $2 OR email ILIKE $2)
		ORDER BY last_name, first_name
		LIMIT 10`, memberID, q)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "search failed")
	}
	defer rows.Close()

	type Result struct {
		ID        string `json:"id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Email     string `json:"email"`
	}
	results := []Result{}
	for rows.Next() {
		var r Result
		if err := rows.Scan(&r.ID, &r.FirstName, &r.LastName, &r.Email); err != nil {
			continue
		}
		results = append(results, r)
	}
	return c.JSON(http.StatusOK, results)
}
