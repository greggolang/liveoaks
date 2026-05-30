package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type SignupsHandler struct {
	DB *pgxpool.Pool
}

type EventSignup struct {
	ID             string     `json:"id"`
	EventID        string     `json:"event_id"`
	UserID         *string    `json:"user_id,omitempty"`
	FullName       string     `json:"full_name"`
	Email          string     `json:"email"`
	Phone          *string    `json:"phone,omitempty"`
	MemberStatus   string     `json:"member_status"`
	PlayingTennis  bool       `json:"playing_tennis"`
	SkillLevel     *string    `json:"skill_level,omitempty"`
	Formats        []string   `json:"formats,omitempty"`
	PreferredPartner *string  `json:"preferred_partner,omitempty"`
	WillingSubstitute *bool   `json:"willing_substitute,omitempty"`
	AttendingLunch bool       `json:"attending_lunch"`
	LunchCount     *int       `json:"lunch_count,omitempty"`
	LunchGuestNames *string   `json:"lunch_guest_names,omitempty"`
	FoodContributions []string `json:"food_contributions,omitempty"`
	FoodItem       *string    `json:"food_item,omitempty"`
	FoodServings   *string    `json:"food_servings,omitempty"`
	FoodAllergies  *string    `json:"food_allergies,omitempty"`
	VolunteerRoles []string   `json:"volunteer_roles,omitempty"`
	VolunteerTime  *string    `json:"volunteer_time,omitempty"`
	EmergencyName  *string    `json:"emergency_name,omitempty"`
	EmergencyPhone *string    `json:"emergency_phone,omitempty"`
	Comments       *string    `json:"comments,omitempty"`
	SubmittedAt    time.Time  `json:"submitted_at"`
}

// Submit handles public form submission
func (h *SignupsHandler) Submit(c echo.Context) error {
	eventID := c.Param("id")

	// Verify event exists and signup is enabled
	var signupEnabled bool
	var deadline *time.Time
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT signup_enabled, signup_deadline FROM events WHERE id = $1`, eventID,
	).Scan(&signupEnabled, &deadline)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "event not found")
	}
	if !signupEnabled {
		return echo.NewHTTPError(http.StatusForbidden, "sign-up is not enabled for this event")
	}
	if deadline != nil && time.Now().After(*deadline) {
		return echo.NewHTTPError(http.StatusForbidden, "sign-up deadline has passed")
	}

	var req EventSignup
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid form data")
	}
	if req.FullName == "" || req.Email == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and email required")
	}

	// Attach user if logged in
	userID, _ := c.Get("user_id").(string)
	var uid *string
	if userID != "" {
		uid = &userID
	}

	var s EventSignup
	err = h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO event_signups (
			event_id, user_id, full_name, email, phone, member_status,
			playing_tennis, skill_level, formats, preferred_partner, willing_substitute,
			attending_lunch, lunch_count, lunch_guest_names,
			food_contributions, food_item, food_servings, food_allergies,
			volunteer_roles, volunteer_time,
			emergency_name, emergency_phone, comments
		) VALUES (
			$1,$2,$3,$4,NULLIF($5,''),$6,
			$7,NULLIF($8,''),$9,NULLIF($10,''),$11,
			$12,$13,NULLIF($14,''),
			$15,NULLIF($16,''),NULLIF($17,''),NULLIF($18,''),
			$19,NULLIF($20,''),
			NULLIF($21,''),NULLIF($22,''),NULLIF($23,'')
		) RETURNING id, submitted_at`,
		eventID, uid, req.FullName, req.Email, req.Phone, req.MemberStatus,
		req.PlayingTennis, req.SkillLevel, req.Formats, req.PreferredPartner, req.WillingSubstitute,
		req.AttendingLunch, req.LunchCount, req.LunchGuestNames,
		req.FoodContributions, req.FoodItem, req.FoodServings, req.FoodAllergies,
		req.VolunteerRoles, req.VolunteerTime,
		req.EmergencyName, req.EmergencyPhone, req.Comments,
	).Scan(&s.ID, &s.SubmittedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save signup")
	}

	return c.JSON(http.StatusCreated, map[string]string{
		"id":      s.ID,
		"message": "Thank you! Your sign-up has been received.",
	})
}

// List returns all signups for an event (admin)
func (h *SignupsHandler) List(c echo.Context) error {
	eventID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, event_id, user_id, full_name, email, phone, member_status,
		       playing_tennis, skill_level, formats, preferred_partner, willing_substitute,
		       attending_lunch, lunch_count, lunch_guest_names,
		       food_contributions, food_item, food_servings, food_allergies,
		       volunteer_roles, volunteer_time,
		       emergency_name, emergency_phone, comments, submitted_at
		FROM event_signups WHERE event_id = $1 ORDER BY submitted_at`, eventID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch signups")
	}
	defer rows.Close()

	signups := []EventSignup{}
	for rows.Next() {
		var s EventSignup
		if err := rows.Scan(
			&s.ID, &s.EventID, &s.UserID, &s.FullName, &s.Email, &s.Phone, &s.MemberStatus,
			&s.PlayingTennis, &s.SkillLevel, &s.Formats, &s.PreferredPartner, &s.WillingSubstitute,
			&s.AttendingLunch, &s.LunchCount, &s.LunchGuestNames,
			&s.FoodContributions, &s.FoodItem, &s.FoodServings, &s.FoodAllergies,
			&s.VolunteerRoles, &s.VolunteerTime,
			&s.EmergencyName, &s.EmergencyPhone, &s.Comments, &s.SubmittedAt,
		); err != nil {
			continue
		}
		signups = append(signups, s)
	}
	return c.JSON(http.StatusOK, signups)
}

// Summary returns aggregated planning data for an event
func (h *SignupsHandler) Summary(c echo.Context) error {
	eventID := c.Param("id")

	var total, players, lunch, subs int
	h.DB.QueryRow(c.Request().Context(), `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE playing_tennis),
		       SUM(COALESCE(lunch_count, CASE WHEN attending_lunch THEN 1 ELSE 0 END)),
		       COUNT(*) FILTER (WHERE willing_substitute)
		FROM event_signups WHERE event_id = $1`, eventID,
	).Scan(&total, &players, &lunch, &subs)

	// Skill levels
	skillRows, _ := h.DB.Query(c.Request().Context(), `
		SELECT skill_level, COUNT(*) FROM event_signups
		WHERE event_id = $1 AND playing_tennis AND skill_level IS NOT NULL
		GROUP BY skill_level ORDER BY skill_level`, eventID)
	skills := map[string]int{}
	if skillRows != nil {
		defer skillRows.Close()
		for skillRows.Next() {
			var level string
			var count int
			skillRows.Scan(&level, &count)
			skills[level] = count
		}
	}

	// Food contributions
	foodRows, _ := h.DB.Query(c.Request().Context(), `
		SELECT unnest(food_contributions), COUNT(*) FROM event_signups
		WHERE event_id = $1 AND food_contributions IS NOT NULL AND array_length(food_contributions,1) > 0
		GROUP BY 1 ORDER BY 2 DESC`, eventID)
	food := map[string]int{}
	if foodRows != nil {
		defer foodRows.Close()
		for foodRows.Next() {
			var item string
			var count int
			foodRows.Scan(&item, &count)
			food[item] = count
		}
	}

	// Volunteers
	volRows, _ := h.DB.Query(c.Request().Context(), `
		SELECT unnest(volunteer_roles), COUNT(*) FROM event_signups
		WHERE event_id = $1 AND volunteer_roles IS NOT NULL AND array_length(volunteer_roles,1) > 0
		GROUP BY 1 ORDER BY 2 DESC`, eventID)
	volunteers := map[string]int{}
	if volRows != nil {
		defer volRows.Close()
		for volRows.Next() {
			var role string
			var count int
			volRows.Scan(&role, &count)
			volunteers[role] = count
		}
	}

	// Food allergies list
	allergyRows, _ := h.DB.Query(c.Request().Context(), `
		SELECT full_name, food_allergies FROM event_signups
		WHERE event_id = $1 AND food_allergies IS NOT NULL AND food_allergies != ''`, eventID)
	type Allergy struct {
		Name     string `json:"name"`
		Allergies string `json:"allergies"`
	}
	allergies := []Allergy{}
	if allergyRows != nil {
		defer allergyRows.Close()
		for allergyRows.Next() {
			var a Allergy
			allergyRows.Scan(&a.Name, &a.Allergies)
			allergies = append(allergies, a)
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"total_signups":   total,
		"total_players":   players,
		"total_lunch":     lunch,
		"substitute_pool": subs,
		"skill_levels":    skills,
		"food_items":      food,
		"volunteers":      volunteers,
		"food_allergies":  allergies,
	})
}

// Delete removes a signup (admin)
func (h *SignupsHandler) Delete(c echo.Context) error {
	h.DB.Exec(c.Request().Context(),
		`DELETE FROM event_signups WHERE id = $1`, c.Param("signupId"))
	return c.NoContent(http.StatusNoContent)
}

// ToggleSignup enables/disables signup for an event
func (h *SignupsHandler) ToggleSignup(c echo.Context) error {
	eventID := c.Param("id")
	var body struct {
		SignupEnabled bool    `json:"signup_enabled"`
		Deadline      *string `json:"signup_deadline"`
		MaxPlayers    *int    `json:"max_players"`
	}
	if err := c.Bind(&body); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE events SET signup_enabled=$1, signup_deadline=$2, max_players=$3 WHERE id=$4`,
		body.SignupEnabled, body.Deadline, body.MaxPlayers, eventID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update event")
	}
	return c.JSON(http.StatusOK, map[string]bool{"signup_enabled": body.SignupEnabled})
}
