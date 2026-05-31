package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

type FamilyHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
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
	USTARanking  *string   `json:"usta_ranking,omitempty"`
	LinkedUserID *string   `json:"linked_user_id,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

func setFamilyBirthday(m *FamilyMember, bday *time.Time) {
	if bday != nil {
		s := bday.Format("2006-01-02")
		m.Birthday = &s
	}
}

func (h *FamilyHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, first_name, last_name, relationship, phone, email, notes,
		        birthday, usta_ranking, linked_user_id::text, created_at
		 FROM family_members WHERE user_id = $1 ORDER BY created_at`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var bday *time.Time
		if err := rows.Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship,
			&m.Phone, &m.Email, &m.Notes, &bday, &m.USTARanking, &m.LinkedUserID, &m.CreatedAt); err != nil {
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
		USTARanking  string `json:"usta_ranking"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name and last name required")
	}
	if req.Relationship == "child" && req.Birthday == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "birthday is required for children")
	}
	if req.Relationship == "" {
		req.Relationship = "other"
	}
	var m FamilyMember
	var bday *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO family_members (user_id, first_name, last_name, relationship, phone, email, notes, birthday, usta_ranking)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,'')::date, NULLIF($9,''))
		 RETURNING id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, usta_ranking, created_at`,
		userID, req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday, req.USTARanking,
	).Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.USTARanking, &m.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add family member")
	}
	setFamilyBirthday(&m, bday)

	rel := req.Relationship
	if h.Mailer != nil && req.Email != "" && (rel == "spouse" || rel == "child") {
		var ownerFirst, ownerLast string
		h.DB.QueryRow(c.Request().Context(),
			`SELECT first_name, last_name FROM users WHERE id = $1`, userID,
		).Scan(&ownerFirst, &ownerLast)
		go h.sendFamilyInvite(c.Request().Context(), m.ID, req.FirstName, req.Email, ownerFirst+" "+ownerLast)
	}

	return c.JSON(http.StatusCreated, m)
}

// sendFamilyInvite creates a login account (if needed) for a family member and
// emails them a password-setup link using the existing reset-password page.
func (h *FamilyHandler) sendFamilyInvite(ctx context.Context, familyMemberID, firstName, email, addedByName string) {
	var existingUserID string
	h.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingUserID)

	var userID string
	if existingUserID != "" {
		userID = existingUserID
		h.DB.Exec(ctx,
			`UPDATE family_members SET linked_user_id = $1 WHERE id = $2 AND linked_user_id IS NULL`,
			userID, familyMemberID)
	} else {
		randomBytes := make([]byte, 32)
		rand.Read(randomBytes)
		lockedHash, _ := bcrypt.GenerateFromPassword(randomBytes, bcrypt.DefaultCost)

		err := h.DB.QueryRow(ctx, `
			INSERT INTO users (first_name, last_name, email, password_hash, role, status)
			VALUES ($1, $1, $2, $3, 'member', 'active')
			RETURNING id`,
			firstName, email, string(lockedHash),
		).Scan(&userID)
		if err != nil {
			return
		}
		h.DB.Exec(ctx,
			`UPDATE family_members SET linked_user_id = $1 WHERE id = $2`, userID, familyMemberID)
	}

	tokenBytes := make([]byte, 24)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	_, err := h.DB.Exec(ctx,
		`INSERT INTO password_resets (token, user_id) VALUES ($1, $2)`, token, userID)
	if err != nil {
		return
	}

	setupURL := fmt.Sprintf("%s/reset-password?token=%s", h.SiteURL, token)
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Welcome to Live Oaks Tennis Club!</h2>
  <p>Hi %s,</p>
  <p><strong>%s</strong> has added you as a family member on their Live Oaks Tennis Club account.</p>
  <p>Click the button below to create your password and access the member portal:</p>
  <p style="margin:28px 0">
    <a href="%s" style="background:#15803d;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
      Set Up My Password →
    </a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link expires in 24 hours. If you didn't expect this email, you can ignore it.</p>
  <p style="color:#9ca3af;font-size:12px">Or copy this link: %s</p>
</div>`, firstName, addedByName, setupURL, setupURL)

	h.Mailer.Send(email, "Set up your Live Oaks Tennis Club login", body)
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
		USTARanking  string `json:"usta_ranking"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name and last name required")
	}
	if req.Relationship == "child" && req.Birthday == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "birthday is required for children")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE family_members SET first_name=$1, last_name=$2, relationship=$3,
		 phone=NULLIF($4,''), email=NULLIF($5,''), notes=NULLIF($6,''),
		 birthday=NULLIF($7,'')::date, usta_ranking=NULLIF($8,'')
		 WHERE id=$9 AND user_id=$10`,
		req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes,
		req.Birthday, req.USTARanking, id, userID)
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

// AdminListAll returns every family member across all users (board+).
func (h *FamilyHandler) AdminListAll(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT fm.id, fm.user_id,
		       u.first_name || ' ' || u.last_name AS primary_member_name,
		       u.email AS primary_member_email,
		       fm.first_name, fm.last_name, fm.relationship,
		       fm.email, fm.phone, fm.birthday, fm.usta_ranking,
		       fm.linked_user_id IS NOT NULL AS has_login,
		       fm.created_at
		FROM family_members fm
		JOIN users u ON u.id = fm.user_id
		ORDER BY u.last_name, u.first_name, fm.last_name, fm.first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	type Row struct {
		ID                 string    `json:"id"`
		UserID             string    `json:"user_id"`
		PrimaryMemberName  string    `json:"primary_member_name"`
		PrimaryMemberEmail string    `json:"primary_member_email"`
		FirstName          string    `json:"first_name"`
		LastName           string    `json:"last_name"`
		Relationship       string    `json:"relationship"`
		Email              *string   `json:"email,omitempty"`
		Phone              *string   `json:"phone,omitempty"`
		Birthday           *string   `json:"birthday,omitempty"`
		USTARanking        *string   `json:"usta_ranking,omitempty"`
		HasLogin           bool      `json:"has_login"`
		CreatedAt          time.Time `json:"created_at"`
	}

	result := []Row{}
	for rows.Next() {
		var r Row
		var bday *time.Time
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.PrimaryMemberName, &r.PrimaryMemberEmail,
			&r.FirstName, &r.LastName, &r.Relationship,
			&r.Email, &r.Phone, &bday, &r.USTARanking, &r.HasLogin, &r.CreatedAt,
		); err != nil {
			continue
		}
		if bday != nil {
			s := bday.Format("2006-01-02")
			r.Birthday = &s
		}
		result = append(result, r)
	}
	return c.JSON(http.StatusOK, result)
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
		USTARanking  string `json:"usta_ranking"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name and last name required")
	}
	if req.Relationship == "child" && req.Birthday == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "birthday is required for children")
	}
	if req.Relationship == "" {
		req.Relationship = "other"
	}
	var m FamilyMember
	var bday *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO family_members (user_id, first_name, last_name, relationship, phone, email, notes, birthday, usta_ranking)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,'')::date, NULLIF($9,''))
		 RETURNING id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, usta_ranking, created_at`,
		targetUserID, req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday, req.USTARanking,
	).Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.USTARanking, &m.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add family member")
	}
	setFamilyBirthday(&m, bday)
	return c.JSON(http.StatusCreated, m)
}

// AdminUpdate edits a family member for any user (board+)
func (h *FamilyHandler) AdminUpdate(c echo.Context) error {
	memberID := c.Param("id")
	targetUserID := c.Param("userId")
	var req struct {
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Relationship string `json:"relationship"`
		Phone        string `json:"phone"`
		Email        string `json:"email"`
		Notes        string `json:"notes"`
		Birthday     string `json:"birthday"`
		USTARanking  string `json:"usta_ranking"`
	}
	if err := c.Bind(&req); err != nil || req.FirstName == "" || req.LastName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "first name and last name required")
	}
	if req.Relationship == "child" && req.Birthday == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "birthday is required for children")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE family_members SET first_name=$1, last_name=$2, relationship=$3,
		 phone=NULLIF($4,''), email=NULLIF($5,''), notes=NULLIF($6,''),
		 birthday=NULLIF($7,'')::date, usta_ranking=NULLIF($8,'')
		 WHERE id=$9 AND user_id=$10`,
		req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes,
		req.Birthday, req.USTARanking, memberID, targetUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update family member")
	}
	return c.JSON(http.StatusOK, map[string]string{"id": memberID})
}

// AdminDelete removes a family member for any user (board+)
func (h *FamilyHandler) AdminDelete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM family_members WHERE id=$1 AND user_id=$2`,
		c.Param("id"), c.Param("userId"))
	return c.NoContent(http.StatusNoContent)
}

// AllMembers returns every family member (across all users) that has an email address.
func (h *FamilyHandler) AllMembers(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, first_name, last_name, relationship, email, birthday
		 FROM family_members
		 WHERE email IS NOT NULL
		 ORDER BY last_name, first_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	type PublicFamilyMember struct {
		ID           string  `json:"id"`
		FirstName    string  `json:"first_name"`
		LastName     string  `json:"last_name"`
		Relationship string  `json:"relationship"`
		Email        *string `json:"email,omitempty"`
		Birthday     *string `json:"birthday,omitempty"`
	}

	members := []PublicFamilyMember{}
	for rows.Next() {
		var m PublicFamilyMember
		var bday *time.Time
		if err := rows.Scan(&m.ID, &m.FirstName, &m.LastName, &m.Relationship, &m.Email, &bday); err != nil {
			continue
		}
		if bday != nil {
			s := bday.Format("2006-01-02")
			m.Birthday = &s
		}
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}

// SetPassword creates (or resets) a login account for a family member.
func (h *FamilyHandler) SetPassword(c echo.Context) error {
	id := c.Param("id")
	ownerID := c.Get("user_id").(string)

	var req struct {
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "password required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	var firstName, lastName string
	var email, linkedUserID *string
	err := h.DB.QueryRow(c.Request().Context(), `
		SELECT first_name, last_name, email, linked_user_id::text
		FROM family_members WHERE id = $1 AND user_id = $2`,
		id, ownerID,
	).Scan(&firstName, &lastName, &email, &linkedUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "family member not found")
	}
	if email == nil || *email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "family member must have an email address to enable login")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not hash password")
	}

	if linkedUserID != nil && *linkedUserID != "" {
		h.DB.Exec(c.Request().Context(),
			`UPDATE users SET password_hash = $1 WHERE id = $2`,
			string(hash), *linkedUserID)
		return c.JSON(http.StatusOK, map[string]string{"message": "password updated"})
	}

	var newUserID string
	err = h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO users (first_name, last_name, email, password_hash, role, status)
		VALUES ($1, $2, $3, $4, 'member', 'active')
		RETURNING id`,
		firstName, lastName, *email, string(hash),
	).Scan(&newUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusConflict, "an account with this email already exists")
	}

	h.DB.Exec(c.Request().Context(),
		`UPDATE family_members SET linked_user_id = $1 WHERE id = $2`, newUserID, id)

	return c.JSON(http.StatusCreated, map[string]string{"message": "login account created", "linked_user_id": newUserID})
}

// AdminList returns all family members for a given user (board+)
func (h *FamilyHandler) AdminList(c echo.Context) error {
	targetUserID := c.Param("userId")
	rows, err := h.DB.Query(c.Request().Context(),
		`SELECT id, user_id, first_name, last_name, relationship, phone, email, notes,
		        birthday, usta_ranking, created_at
		 FROM family_members WHERE user_id = $1 ORDER BY created_at`, targetUserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch family members")
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var bday *time.Time
		if err := rows.Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship,
			&m.Phone, &m.Email, &m.Notes, &bday, &m.USTARanking, &m.CreatedAt); err != nil {
			continue
		}
		setFamilyBirthday(&m, bday)
		members = append(members, m)
	}
	return c.JSON(http.StatusOK, members)
}
