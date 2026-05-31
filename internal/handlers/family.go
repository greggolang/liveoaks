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
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	FirstName      string    `json:"first_name"`
	LastName       string    `json:"last_name"`
	Relationship   string    `json:"relationship"`
	Phone          *string   `json:"phone,omitempty"`
	Email          *string   `json:"email,omitempty"`
	Notes          *string   `json:"notes,omitempty"`
	Birthday       *string   `json:"birthday,omitempty"` // "YYYY-MM-DD"
	LinkedUserID   *string   `json:"linked_user_id,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
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
		`SELECT id, user_id, first_name, last_name, relationship, phone, email, notes, birthday,
		        linked_user_id::text, created_at
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
			&m.Phone, &m.Email, &m.Notes, &bday, &m.LinkedUserID, &m.CreatedAt); err != nil {
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
		`INSERT INTO family_members (user_id, first_name, last_name, relationship, phone, email, notes, birthday)
		 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,'')::date)
		 RETURNING id, user_id, first_name, last_name, relationship, phone, email, notes, birthday, created_at`,
		userID, req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday,
	).Scan(&m.ID, &m.UserID, &m.FirstName, &m.LastName, &m.Relationship, &m.Phone, &m.Email, &m.Notes, &bday, &m.CreatedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not add family member")
	}
	setFamilyBirthday(&m, bday)

	// Send password-setup invite to spouse / child who has an email
	rel := req.Relationship
	if h.Mailer != nil && req.Email != "" && (rel == "spouse" || rel == "child") {
		// Fetch the primary member's name for the email
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
	// Check whether a users account already exists for this email
	var existingUserID string
	h.DB.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingUserID)

	var userID string
	if existingUserID != "" {
		userID = existingUserID
		// Link the existing account if not already linked
		h.DB.Exec(ctx,
			`UPDATE family_members SET linked_user_id = $1 WHERE id = $2 AND linked_user_id IS NULL`,
			userID, familyMemberID)
	} else {
		// Create a locked users account — random password nobody knows
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
			return // email already registered — do not double-create
		}
		h.DB.Exec(ctx,
			`UPDATE family_members SET linked_user_id = $1 WHERE id = $2`, userID, familyMemberID)
	}

	// Generate a password-reset token (reuses the existing reset-password page)
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
		 birthday=NULLIF($7,'')::date
		 WHERE id=$8 AND user_id=$9`,
		req.FirstName, req.LastName, req.Relationship, req.Phone, req.Email, req.Notes, req.Birthday, memberID, targetUserID)
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
// Used by the booking invite search so members can find and invite each other's family members.
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
// The family member must have an email address. A users row is created on
// first call and linked via family_members.linked_user_id; subsequent calls
// just update the password on the existing account.
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
		// Account already exists — just update the password
		h.DB.Exec(c.Request().Context(),
			`UPDATE users SET password_hash = $1 WHERE id = $2`,
			string(hash), *linkedUserID)
		return c.JSON(http.StatusOK, map[string]string{"message": "password updated"})
	}

	// Create a new users account for the family member
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
