package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FamilyHandler struct {
	DB *pgxpool.Pool
}

type FamilyMember struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Relationship string    `json:"relationship"`
	Phone        *string   `json:"phone,omitempty"`
	Email        *string   `json:"email,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
	Birthday     *string   `json:"birthday,omitempty"` // "YYYY-MM-DD"
	CreatedAt    time.Time `json:"created_at"`
}

// scanBirthday formats a *time.Time DB value into "YYYY-MM-DD" for the struct.
func setFamilyBirthday(m *FamilyMember, bday *time.Time) {
	if bday != nil {
		s := bday.Format("2006-01-02")
		m.Birthday = &s
	}
}

func (h *FamilyHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, created_at
		 FROM family_members WHERE user_id = $1 ORDER BY created_at`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var bday *time.Time
		if err := rows.Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.CreatedAt); err != nil {
			continue
		}
		setFamilyBirthday(&m, bday)
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}

func (h *FamilyHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Relationship string `json:"relationship"`
		Phone        string `json:"phone"`
		Email        string `json:"email"`
		Notes        string `json:"notes"`
		Birthday     string `json:"birthday"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	if req.Relationship == "" {
		req.Relationship = "other"
	}
	var m FamilyMember
	var bday *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO family_members (user_id, first_name, last_name, relationship, phone, email, notes, birthday)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,'')::date)
		 RETURNING id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, created_at`,
		userID, req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday,
	).Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add family member")
	}
	setFamilyBirthday(&m, bday)
	return c.JSON(http.StatusCreated, m)
}

func (h *FamilyHandler) Update(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Relationship string `json:"relationship"`
		Phone        string `json:"phone"`
		Email        string `json:"email"`
		Notes        string `json:"notes"`
		Birthday     string `json:"birthday"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE family_members SET first_name=$1, last_name=$2, relationship=$3,
		 phone=NULLIF($4,''), email=NULLIF($5,''), notes=NULLIF($6,''),
		 birthday=NULLIF($7,'')::date
		 WHERE id=$8 AND user_id=$9`,
		req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday, id, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update family member")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

func (h *FamilyHandler) Delete(c echo.Context) error {
	id := c.Param("id")
	userID := c.Get("user_id").(string)
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM family_members WHERE id=$1 AND user_id=$2`, id, userID)
	return c.NoContent(http.StatusNoContent)
}

// AdminCreate adds a family member on behalf of any user (board+)
func (h *FamilyHandler) AdminCreate(c echo.Context) error {
	targetUserID := c.Param("userId")
	var req struct {
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Relationship string `json:"relationship"`
		Phone        string `json:"phone"`
		Email        string `json:"email"`
		Notes        string `json:"notes"`
		Birthday     string `json:"birthday"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first and last name required")
	}
	if req.Relationship == "" {
		req.Relationship = "other"
	}
	var m FamilyMember
	var bday *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO family_members (user_id, first_name, last_name, relationship, phone, email, notes, birthday)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,'')::date)
		 RETURNING id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, created_at`,
		targetUserID, req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday,
	).Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add family member")
	}
	setFamilyBirthday(&m, bday)
	return c.JSON(http.StatusCreated, m)
}

// AdminDelete removes a family member for any user (board+)
func (h *FamilyHandler) AdminDelete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM family_members WHERE id=$1 AND user_id=$2`,
		c.Param("id"), c.Param("userId"))
	return c.NoContent(http.StatusNoContent)
}

// AdminList returns all family members for a given user (board+)
func (h *FamilyHandler) AdminList(c echo.Context) error {
	targetUserID := c.Param("userId")
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, created_at
		 FROM family_members WHERE user_id = $1 ORDER BY created_at`, targetUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var bday *time.Time
		if err := rows.Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.CreatedAt); err != nil {
			continue
		}
		setFamilyBirthday(&m, bday)
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}
