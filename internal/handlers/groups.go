package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type GroupsHandler struct {
	DB *pgxpool.Pool
}

type GroupMember struct {
	FriendID    string  `json:"friend_id"`
	FriendName  string  `json:"friend_name"`
	FriendEmail *string `json:"friend_email,omitempty"`
	IsGuest     bool    `json:"is_guest"`
}

type FriendGroup struct {
	ID      string        `json:"id"`
	Name    string        `json:"name"`
	Members []GroupMember `json:"members"`
}

func (h *GroupsHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)

	// Load all groups for the user
	groupRows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, name FROM friend_groups WHERE user_id = $1 ORDER BY name`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch groups")
	}
	defer groupRows.Close()

	groups := []FriendGroup{}
	for groupRows.Next() {
		var g FriendGroup
		if err := groupRows.Scan(&g.ID, &g.Name); err != nil {
			continue
		}
		g.Members = []GroupMember{}
		groups = append(groups, g)
	}
	groupRows.Close()

	// Load members for all groups
	memberRows, err := h.DB.Query(c.Request().Context(), `
		SELECT gm.group_id, f.id,
		       COALESCE(u.first_name || ' ' || u.last_name, f.friend_name) as name,
		       COALESCE(u.email, f.friend_email) as email,
		       f.friend_user_id IS NULL as is_guest
		FROM friend_group_members gm
		JOIN friends f ON f.id = gm.friend_id
		LEFT JOIN users u ON u.id = f.friend_user_id
		WHERE f.member_id = $1`, userID)
	if err != nil {
		return c.JSON(http.StatusOK, groups)
	}
	defer memberRows.Close()

	memberMap := map[string][]GroupMember{}
	for memberRows.Next() {
		var groupID string
		var m GroupMember
		if err := memberRows.Scan(&groupID, &m.FriendID, &m.FriendName, &m.FriendEmail, &m.IsGuest); err != nil {
			continue
		}
		memberMap[groupID] = append(memberMap[groupID], m)
	}

	for i, g := range groups {
		if ms, ok := memberMap[g.ID]; ok {
			groups[i].Members = ms
		}
	}

	return c.JSON(http.StatusOK, groups)
}

func (h *GroupsHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	var g FriendGroup
	g.Members = []GroupMember{}
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO friend_groups (user_id, name) VALUES ($1, $2) RETURNING id, name`,
		userID, req.Name).Scan(&g.ID, &g.Name)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create group")
	}
	return c.JSON(http.StatusCreated, g)
}

func (h *GroupsHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		Name string `json:"name"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	h.DB.Exec(c.Request().Context(),
		`UPDATE friend_groups SET name = $1 WHERE id = $2 AND user_id = $3`,
		req.Name, id, userID)
	return c.JSON(http.StatusOK, map[string]string{"id": id, "name": req.Name})
}

func (h *GroupsHandler) Delete(c echo.Context) error {
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM friend_groups WHERE id = $1 AND user_id = $2`,
		c.Param("id"), userID)
	return c.NoContent(http.StatusNoContent)
}

func (h *GroupsHandler) AddMember(c echo.Context) error {
	groupID := c.Param("id")
	var req struct {
		FriendID string `json:"friend_id"`
	}
	if err := c.Bind(&req); err != nil || req.FriendID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "friend_id required")
	}
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO friend_group_members (group_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		groupID, req.FriendID)
	return c.JSON(http.StatusOK, map[string]string{"group_id": groupID, "friend_id": req.FriendID})
}

func (h *GroupsHandler) RemoveMember(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM friend_group_members WHERE group_id = $1 AND friend_id = $2`,
		c.Param("id"), c.Param("friendId"))
	return c.NoContent(http.StatusNoContent)
}
