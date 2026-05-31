package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type LadderHandler struct {
	DB      *pgxpool.Pool
	Mailer  interface{ Send(to, subject, body string) error }
	SiteURL string
}

const (
	pointsLadderWin  = 100
	pointsLadderLoss = 25
	pointsVolunteer  = 25
	pointsBonus      = 50
)

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────

type ladderRow struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Type                string `json:"type"`
	SeasonYear          int    `json:"season_year"`
	Status              string `json:"status"`
	ChallengeRange      int    `json:"challenge_range"`
	ChallengeExpiryDays int    `json:"challenge_expiry_days"`
	ResponseWindowHours int    `json:"response_window_hours"`
	PlayWindowDays      int    `json:"play_window_days"`
	Description         string `json:"description"`
}

type entryRow struct {
	ID           string `json:"id"`
	LadderID     string `json:"ladder_id"`
	UserID       string `json:"user_id"`
	Name         string `json:"name"`
	Rank         int    `json:"rank"`
	Wins         int    `json:"wins"`
	Losses       int    `json:"losses"`
	SeasonPoints int    `json:"season_points"`
}

type challengeRow struct {
	ID              string  `json:"id"`
	LadderID        string  `json:"ladder_id"`
	ChallengerID    string  `json:"challenger_id"`
	ChallengerName  string  `json:"challenger_name"`
	ChallengerRank  int     `json:"challenger_rank"`
	ChallengedID    string  `json:"challenged_id"`
	ChallengedName  string  `json:"challenged_name"`
	ChallengedRank  int     `json:"challenged_rank"`
	Status          string  `json:"status"`
	WinnerID        *string `json:"winner_id"`
	Score           string  `json:"score"`
	Message         string  `json:"message"`
	CreatedAt       string  `json:"created_at"`
	ExpiresAt       string  `json:"expires_at"`
	RespondBy       string  `json:"respond_by"`
	PlayBy          *string `json:"play_by"`
	CompletedAt     *string `json:"completed_at"`
}

type registrationRow struct {
	ID          string   `json:"id"`
	LadderID    string   `json:"ladder_id"`
	UserID      string   `json:"user_id"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	USTARating  string   `json:"usta_rating"`
	SelfRating  *float64 `json:"self_rating"`
	Preference  string   `json:"preference"`
	Availability string  `json:"availability"`
	Notes       string   `json:"notes"`
	Status      string   `json:"status"`
	CreatedAt   string   `json:"created_at"`
}

// ─────────────────────────────────────────────
// Member endpoints
// ─────────────────────────────────────────────

func (h *LadderHandler) GetLadders(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, type, season_year, status,
		       challenge_range, challenge_expiry_days, response_window_hours, play_window_days, description
		FROM tennis_ladders WHERE status != 'draft' ORDER BY season_year DESC, name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch ladders")
	}
	defer rows.Close()
	out := []ladderRow{}
	for rows.Next() {
		var r ladderRow
		rows.Scan(&r.ID, &r.Name, &r.Type, &r.SeasonYear, &r.Status,
			&r.ChallengeRange, &r.ChallengeExpiryDays, &r.ResponseWindowHours, &r.PlayWindowDays, &r.Description)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *LadderHandler) GetLadder(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	var ladder ladderRow
	err := h.DB.QueryRow(ctx, `
		SELECT id, name, type, season_year, status,
		       challenge_range, challenge_expiry_days, response_window_hours, play_window_days, description
		FROM tennis_ladders WHERE id = $1`, id,
	).Scan(&ladder.ID, &ladder.Name, &ladder.Type, &ladder.SeasonYear, &ladder.Status,
		&ladder.ChallengeRange, &ladder.ChallengeExpiryDays, &ladder.ResponseWindowHours,
		&ladder.PlayWindowDays, &ladder.Description)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "ladder not found")
	}

	// Auto-expire stale challenges
	h.DB.Exec(ctx, `
		UPDATE tennis_challenges SET status='expired'
		WHERE ladder_id=$1 AND status='pending' AND expires_at < NOW()`, id)

	// Entries
	eRows, _ := h.DB.Query(ctx, `
		SELECT le.id, le.ladder_id, le.user_id, u.first_name||' '||u.last_name,
		       le.rank, le.wins, le.losses, le.season_points
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id = $1 ORDER BY le.rank`, id)
	defer eRows.Close()
	entries := []entryRow{}
	for eRows.Next() {
		var e entryRow
		eRows.Scan(&e.ID, &e.LadderID, &e.UserID, &e.Name, &e.Rank, &e.Wins, &e.Losses, &e.SeasonPoints)
		entries = append(entries, e)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"ladder":  ladder,
		"entries": entries,
	})
}

func (h *LadderHandler) Register(c echo.Context) error {
	ladderID := c.Param("id")
	userID := c.Get("user_id").(string)
	var req struct {
		USTARating   string   `json:"usta_rating"`
		SelfRating   *float64 `json:"self_rating"`
		Preference   string   `json:"preference"`
		Availability string   `json:"availability"`
		Notes        string   `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Preference == "" {
		req.Preference = "singles"
	}
	_, err := h.DB.Exec(c.Request().Context(), `
		INSERT INTO tennis_registrations
		  (ladder_id, user_id, usta_rating, self_rating, preference, availability, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (ladder_id, user_id) DO UPDATE
		  SET usta_rating=$3, self_rating=$4, preference=$5, availability=$6, notes=$7`,
		ladderID, userID, req.USTARating, req.SelfRating, req.Preference, req.Availability, req.Notes)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not register")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "registered"})
}

func (h *LadderHandler) GetMyStatus(c echo.Context) error {
	ladderID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	// Registration status
	var regStatus string
	h.DB.QueryRow(ctx,
		`SELECT status FROM tennis_registrations WHERE ladder_id=$1 AND user_id=$2`, ladderID, userID,
	).Scan(&regStatus)

	// Entry / rank
	var entry entryRow
	h.DB.QueryRow(ctx, `
		SELECT le.id, le.ladder_id, le.user_id, u.first_name||' '||u.last_name,
		       le.rank, le.wins, le.losses, le.season_points
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id=$1 AND le.user_id=$2`, ladderID, userID,
	).Scan(&entry.ID, &entry.LadderID, &entry.UserID, &entry.Name,
		&entry.Rank, &entry.Wins, &entry.Losses, &entry.SeasonPoints)

	// Active challenges (sent or received)
	cRows, _ := h.DB.Query(ctx, `
		SELECT ch.id, ch.ladder_id,
		       ch.challenger_id, cu.first_name||' '||cu.last_name,
		       ch.challenger_rank,
		       ch.challenged_id, du.first_name||' '||du.last_name,
		       ch.challenged_rank,
		       ch.status, ch.winner_id, ch.score, ch.message,
		       to_char(ch.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.respond_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.play_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.completed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_challenges ch
		JOIN users cu ON cu.id = ch.challenger_id
		JOIN users du ON du.id = ch.challenged_id
		WHERE ch.ladder_id=$1 AND (ch.challenger_id=$2 OR ch.challenged_id=$2)
		  AND ch.status IN ('pending','accepted')
		ORDER BY ch.created_at DESC`, ladderID, userID)
	defer cRows.Close()
	challenges := scanChallenges(cRows)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"registered":         regStatus != "",
		"registration_status": regStatus,
		"entry":              entry,
		"challenges":         challenges,
	})
}

func (h *LadderHandler) CreateChallenge(c echo.Context) error {
	ladderID := c.Param("id")
	challengerID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		ChallengedID string `json:"challenged_id"`
		Message      string `json:"message"`
	}
	if err := c.Bind(&req); err != nil || req.ChallengedID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "challenged_id required")
	}

	// Get ladder settings
	var ladder ladderRow
	if err := h.DB.QueryRow(ctx, `
		SELECT id, challenge_range, challenge_expiry_days, response_window_hours, play_window_days, status
		FROM tennis_ladders WHERE id=$1`, ladderID,
	).Scan(&ladder.ID, &ladder.ChallengeRange, &ladder.ChallengeExpiryDays,
		&ladder.ResponseWindowHours, &ladder.PlayWindowDays, &ladder.Status); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "ladder not found")
	}
	if ladder.Status != "active" {
		return echo.NewHTTPError(http.StatusForbidden, "ladder is not active")
	}

	// Get challenger's rank
	var challengerRank int
	if err := h.DB.QueryRow(ctx,
		`SELECT rank FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, challengerID,
	).Scan(&challengerRank); err != nil {
		return echo.NewHTTPError(http.StatusForbidden, "you are not on this ladder")
	}

	// Get challenged's rank
	var challengedRank int
	if err := h.DB.QueryRow(ctx,
		`SELECT rank FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, req.ChallengedID,
	).Scan(&challengedRank); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "opponent not found on ladder")
	}

	// Validate challenge range
	if challengedRank >= challengerRank {
		return echo.NewHTTPError(http.StatusBadRequest, "you can only challenge players ranked above you")
	}
	if challengerRank-challengedRank > ladder.ChallengeRange {
		return echo.NewHTTPError(http.StatusBadRequest,
			fmt.Sprintf("you can only challenge up to %d spots above you", ladder.ChallengeRange))
	}

	// Check no existing active challenge sent by this challenger
	var existing int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM tennis_challenges WHERE ladder_id=$1 AND challenger_id=$2 AND status IN ('pending','accepted')`,
		ladderID, challengerID,
	).Scan(&existing)
	if existing > 0 {
		return echo.NewHTTPError(http.StatusConflict, "you already have an active challenge")
	}

	now := time.Now()
	expiresAt := now.Add(time.Duration(ladder.ChallengeExpiryDays) * 24 * time.Hour)
	respondBy := now.Add(time.Duration(ladder.ResponseWindowHours) * time.Hour)

	var ch challengeRow
	err := h.DB.QueryRow(ctx, `
		INSERT INTO tennis_challenges
		  (ladder_id, challenger_id, challenged_id, challenger_rank, challenged_rank,
		   message, expires_at, respond_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, ladder_id, challenger_id, '', $4, challenged_id, '', $5,
		          status, winner_id, score, message,
		          to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(respond_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(play_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(completed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		ladderID, challengerID, req.ChallengedID, challengerRank, challengedRank,
		req.Message, expiresAt, respondBy,
	).Scan(&ch.ID, &ch.LadderID, &ch.ChallengerID, &ch.ChallengerName, &ch.ChallengerRank,
		&ch.ChallengedID, &ch.ChallengedName, &ch.ChallengedRank,
		&ch.Status, &ch.WinnerID, &ch.Score, &ch.Message,
		&ch.CreatedAt, &ch.ExpiresAt, &ch.RespondBy, &ch.PlayBy, &ch.CompletedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create challenge")
	}

	// Notify challenged player
	go h.notifyChallengeReceived(ctx, req.ChallengedID, challengerID, ch.ID, ladderID)

	return c.JSON(http.StatusCreated, ch)
}

func (h *LadderHandler) RespondChallenge(c echo.Context) error {
	challengeID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		Action string `json:"action"` // accept | decline
	}
	if err := c.Bind(&req); err != nil || (req.Action != "accept" && req.Action != "decline") {
		return echo.NewHTTPError(http.StatusBadRequest, "action must be accept or decline")
	}

	// Verify this user is the challenged player
	var challengedID string
	var ladderID string
	var expiresAt time.Time
	var status string
	var challengerID string
	var playWindowDays int
	err := h.DB.QueryRow(ctx, `
		SELECT ch.challenged_id, ch.ladder_id, ch.expires_at, ch.status, ch.challenger_id,
		       tl.play_window_days
		FROM tennis_challenges ch
		JOIN tennis_ladders tl ON tl.id = ch.ladder_id
		WHERE ch.id=$1`, challengeID,
	).Scan(&challengedID, &ladderID, &expiresAt, &status, &challengerID, &playWindowDays)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if challengedID != userID {
		return echo.NewHTTPError(http.StatusForbidden, "not your challenge to respond to")
	}
	if status != "pending" {
		return echo.NewHTTPError(http.StatusConflict, "challenge already "+status)
	}
	if time.Now().After(expiresAt) {
		h.DB.Exec(ctx, `UPDATE tennis_challenges SET status='expired' WHERE id=$1`, challengeID)
		return echo.NewHTTPError(http.StatusGone, "challenge has expired")
	}

	newStatus := "declined"
	if req.Action == "accept" {
		newStatus = "accepted"
		playBy := time.Now().Add(time.Duration(playWindowDays) * 24 * time.Hour)
		h.DB.Exec(ctx, `
			UPDATE tennis_challenges
			SET status='accepted', play_by=$1, responded_at=NOW()
			WHERE id=$2`, playBy, challengeID)
	} else {
		h.DB.Exec(ctx, `
			UPDATE tennis_challenges SET status='declined', responded_at=NOW() WHERE id=$1`, challengeID)
	}

	// Notify challenger
	go h.notifyChallengeResponse(ctx, challengerID, userID, newStatus, challengeID)

	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

func (h *LadderHandler) GetSeasonLeaderboard(c echo.Context) error {
	ladderID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT le.user_id, u.first_name||' '||u.last_name, le.rank, le.wins, le.losses, le.season_points
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id=$1
		ORDER BY le.season_points DESC, le.rank ASC`, ladderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch leaderboard")
	}
	defer rows.Close()
	type row struct {
		UserID       string `json:"user_id"`
		Name         string `json:"name"`
		Rank         int    `json:"rank"`
		Wins         int    `json:"wins"`
		Losses       int    `json:"losses"`
		SeasonPoints int    `json:"season_points"`
		PointsRank   int    `json:"points_rank"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		rows.Scan(&r.UserID, &r.Name, &r.Rank, &r.Wins, &r.Losses, &r.SeasonPoints)
		out = append(out, r)
	}
	for i := range out {
		out[i].PointsRank = i + 1
	}
	return c.JSON(http.StatusOK, out)
}

// ─────────────────────────────────────────────
// Admin endpoints
// ─────────────────────────────────────────────

func (h *LadderHandler) AdminGetLadders(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, type, season_year, status,
		       challenge_range, challenge_expiry_days, response_window_hours, play_window_days, description
		FROM tennis_ladders ORDER BY season_year DESC, name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch ladders")
	}
	defer rows.Close()
	out := []ladderRow{}
	for rows.Next() {
		var r ladderRow
		rows.Scan(&r.ID, &r.Name, &r.Type, &r.SeasonYear, &r.Status,
			&r.ChallengeRange, &r.ChallengeExpiryDays, &r.ResponseWindowHours, &r.PlayWindowDays, &r.Description)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *LadderHandler) AdminCreateLadder(c echo.Context) error {
	var req struct {
		Name                string `json:"name"`
		Type                string `json:"type"`
		SeasonYear          int    `json:"season_year"`
		Status              string `json:"status"`
		ChallengeRange      int    `json:"challenge_range"`
		ChallengeExpiryDays int    `json:"challenge_expiry_days"`
		ResponseWindowHours int    `json:"response_window_hours"`
		PlayWindowDays      int    `json:"play_window_days"`
		Description         string `json:"description"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name required")
	}
	if req.Type == "" { req.Type = "singles" }
	if req.Status == "" { req.Status = "draft" }
	if req.ChallengeRange == 0 { req.ChallengeRange = 3 }
	if req.ChallengeExpiryDays == 0 { req.ChallengeExpiryDays = 7 }
	if req.ResponseWindowHours == 0 { req.ResponseWindowHours = 72 }
	if req.PlayWindowDays == 0 { req.PlayWindowDays = 14 }
	if req.SeasonYear == 0 { req.SeasonYear = time.Now().Year() }

	var r ladderRow
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO tennis_ladders
		  (name, type, season_year, status, challenge_range, challenge_expiry_days,
		   response_window_hours, play_window_days, description)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, name, type, season_year, status,
		          challenge_range, challenge_expiry_days, response_window_hours, play_window_days, description`,
		req.Name, req.Type, req.SeasonYear, req.Status, req.ChallengeRange,
		req.ChallengeExpiryDays, req.ResponseWindowHours, req.PlayWindowDays, req.Description,
	).Scan(&r.ID, &r.Name, &r.Type, &r.SeasonYear, &r.Status,
		&r.ChallengeRange, &r.ChallengeExpiryDays, &r.ResponseWindowHours, &r.PlayWindowDays, &r.Description)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create ladder")
	}
	return c.JSON(http.StatusCreated, r)
}

func (h *LadderHandler) AdminUpdateLadder(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name                string `json:"name"`
		Type                string `json:"type"`
		SeasonYear          int    `json:"season_year"`
		Status              string `json:"status"`
		ChallengeRange      int    `json:"challenge_range"`
		ChallengeExpiryDays int    `json:"challenge_expiry_days"`
		ResponseWindowHours int    `json:"response_window_hours"`
		PlayWindowDays      int    `json:"play_window_days"`
		Description         string `json:"description"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	var r ladderRow
	err := h.DB.QueryRow(c.Request().Context(), `
		UPDATE tennis_ladders
		SET name=$1, type=$2, season_year=$3, status=$4, challenge_range=$5,
		    challenge_expiry_days=$6, response_window_hours=$7, play_window_days=$8, description=$9
		WHERE id=$10
		RETURNING id, name, type, season_year, status,
		          challenge_range, challenge_expiry_days, response_window_hours, play_window_days, description`,
		req.Name, req.Type, req.SeasonYear, req.Status, req.ChallengeRange,
		req.ChallengeExpiryDays, req.ResponseWindowHours, req.PlayWindowDays, req.Description, id,
	).Scan(&r.ID, &r.Name, &r.Type, &r.SeasonYear, &r.Status,
		&r.ChallengeRange, &r.ChallengeExpiryDays, &r.ResponseWindowHours, &r.PlayWindowDays, &r.Description)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "ladder not found")
	}
	return c.JSON(http.StatusOK, r)
}

func (h *LadderHandler) AdminGetRegistrations(c echo.Context) error {
	ladderID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT r.id, r.ladder_id, r.user_id, u.first_name||' '||u.last_name, u.email,
		       r.usta_rating, r.self_rating, r.preference, r.availability, r.notes, r.status,
		       to_char(r.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_registrations r
		JOIN users u ON u.id = r.user_id
		WHERE r.ladder_id = $1
		ORDER BY r.created_at`, ladderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch registrations")
	}
	defer rows.Close()
	out := []registrationRow{}
	for rows.Next() {
		var r registrationRow
		rows.Scan(&r.ID, &r.LadderID, &r.UserID, &r.Name, &r.Email,
			&r.USTARating, &r.SelfRating, &r.Preference, &r.Availability, &r.Notes, &r.Status, &r.CreatedAt)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *LadderHandler) AdminApproveRegistration(c echo.Context) error {
	ladderID := c.Param("id")
	userID := c.Param("userId")
	var req struct{ Status string `json:"status"` }
	c.Bind(&req)
	if req.Status == "" { req.Status = "approved" }
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE tennis_registrations SET status=$1 WHERE ladder_id=$2 AND user_id=$3`,
		req.Status, ladderID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update registration")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": req.Status})
}

// AdminSetRank places (or re-places) a player at a specific rank, shifting others.
func (h *LadderHandler) AdminSetRank(c echo.Context) error {
	ladderID := c.Param("id")
	ctx := c.Request().Context()
	var req struct {
		UserID string `json:"user_id"`
		Rank   int    `json:"rank"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Rank < 1 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and rank required")
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "db error")
	}
	defer tx.Rollback(ctx)

	// Check if entry already exists for this user
	var existingRank int
	tx.QueryRow(ctx,
		`SELECT rank FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, req.UserID).Scan(&existingRank)

	if existingRank == 0 {
		// New entry: shift everyone at >= req.Rank down
		tx.Exec(ctx,
			`UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2`,
			ladderID, req.Rank)
		tx.Exec(ctx,
			`INSERT INTO tennis_ladder_entries (ladder_id, user_id, rank) VALUES ($1,$2,$3)`,
			ladderID, req.UserID, req.Rank)
	} else {
		// Move existing: temp move out, shift others, place
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ladderID, req.UserID)
		if req.Rank < existingRank {
			tx.Exec(ctx,
				`UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2 AND rank<$3`,
				ladderID, req.Rank, existingRank)
		} else {
			tx.Exec(ctx,
				`UPDATE tennis_ladder_entries SET rank=rank-1 WHERE ladder_id=$1 AND rank>$2 AND rank<=$3`,
				ladderID, existingRank, req.Rank)
		}
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, req.Rank, ladderID, req.UserID)
	}

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not set rank")
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"user_id": req.UserID, "rank": req.Rank})
}

func (h *LadderHandler) AdminGetChallenges(c echo.Context) error {
	ladderID := c.Param("id")
	ctx := c.Request().Context()

	// Auto-expire stale
	h.DB.Exec(ctx, `UPDATE tennis_challenges SET status='expired' WHERE ladder_id=$1 AND status='pending' AND expires_at < NOW()`, ladderID)

	statusFilter := c.QueryParam("status")
	query := `
		SELECT ch.id, ch.ladder_id,
		       ch.challenger_id, cu.first_name||' '||cu.last_name, ch.challenger_rank,
		       ch.challenged_id, du.first_name||' '||du.last_name, ch.challenged_rank,
		       ch.status, ch.winner_id, ch.score, ch.message,
		       to_char(ch.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.respond_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.play_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.completed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_challenges ch
		JOIN users cu ON cu.id = ch.challenger_id
		JOIN users du ON du.id = ch.challenged_id
		WHERE ch.ladder_id=$1`

	var rows interface {
		Next() bool; Close(); Scan(...interface{}) error
	}
	var err error
	if statusFilter != "" {
		rows, err = h.DB.Query(ctx, query+` AND ch.status=$2 ORDER BY ch.created_at DESC`, ladderID, statusFilter)
	} else {
		rows, err = h.DB.Query(ctx, query+` ORDER BY ch.created_at DESC`, ladderID)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch challenges")
	}
	defer rows.Close()
	return c.JSON(http.StatusOK, scanChallenges(rows))
}

// AdminEnterResult records match result, updates ranks and season points.
func (h *LadderHandler) AdminEnterResult(c echo.Context) error {
	challengeID := c.Param("id")
	ctx := c.Request().Context()

	var req struct {
		WinnerID string `json:"winner_id"`
		Score    string `json:"score"`
	}
	if err := c.Bind(&req); err != nil || req.WinnerID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "winner_id required")
	}

	// Load challenge
	var ch struct {
		LadderID        string
		ChallengerID    string
		ChallengedID    string
		ChallengerRank  int
		ChallengedRank  int
		Status          string
	}
	err := h.DB.QueryRow(ctx, `
		SELECT ladder_id, challenger_id, challenged_id, challenger_rank, challenged_rank, status
		FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&ch.LadderID, &ch.ChallengerID, &ch.ChallengedID, &ch.ChallengerRank, &ch.ChallengedRank, &ch.Status)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if ch.Status == "completed" {
		return echo.NewHTTPError(http.StatusConflict, "result already entered")
	}

	loserID := ch.ChallengedID
	if req.WinnerID == ch.ChallengedID {
		loserID = ch.ChallengerID
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "db error")
	}
	defer tx.Rollback(ctx)

	// Mark challenge complete
	tx.Exec(ctx, `
		UPDATE tennis_challenges
		SET status='completed', winner_id=$1, score=$2, completed_at=NOW()
		WHERE id=$3`, req.WinnerID, req.Score, challengeID)

	// Rank update: only if challenger wins
	if req.WinnerID == ch.ChallengerID {
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, ch.ChallengerID)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2 AND rank<$3`, ch.LadderID, ch.ChallengedRank, ch.ChallengerRank)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, ch.ChallengedRank, ch.LadderID, ch.ChallengerID)
	}

	// Win/loss counts
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET wins=wins+1, updated_at=NOW() WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, req.WinnerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET losses=losses+1, updated_at=NOW() WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, loserID)

	// Season points
	tx.Exec(ctx, `INSERT INTO tennis_season_points (ladder_id,user_id,points,source_type,source_id) VALUES ($1,$2,$3,'ladder_win',$4)`, ch.LadderID, req.WinnerID, pointsLadderWin, challengeID)
	tx.Exec(ctx, `INSERT INTO tennis_season_points (ladder_id,user_id,points,source_type,source_id) VALUES ($1,$2,$3,'ladder_loss',$4)`, ch.LadderID, loserID, pointsLadderLoss, challengeID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=season_points+$1 WHERE ladder_id=$2 AND user_id=$3`, pointsLadderWin, ch.LadderID, req.WinnerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=season_points+$1 WHERE ladder_id=$2 AND user_id=$3`, pointsLadderLoss, ch.LadderID, loserID)

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save result")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "completed", "winner_id": req.WinnerID})
}

// AdminForfeit forfeits a challenge in favour of the challenger.
func (h *LadderHandler) AdminForfeit(c echo.Context) error {
	challengeID := c.Param("id")
	ctx := c.Request().Context()

	var ch struct {
		LadderID       string
		ChallengerID   string
		ChallengedID   string
		ChallengerRank int
		ChallengedRank int
		Status         string
	}
	err := h.DB.QueryRow(ctx, `
		SELECT ladder_id, challenger_id, challenged_id, challenger_rank, challenged_rank, status
		FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&ch.LadderID, &ch.ChallengerID, &ch.ChallengedID, &ch.ChallengerRank, &ch.ChallengedRank, &ch.Status)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if ch.Status == "completed" || ch.Status == "forfeited" {
		return echo.NewHTTPError(http.StatusConflict, "challenge already resolved")
	}

	// Re-use the result logic but award challenger the win
	tx, _ := h.DB.Begin(ctx)
	defer tx.Rollback(ctx)

	tx.Exec(ctx, `UPDATE tennis_challenges SET status='forfeited', winner_id=$1, completed_at=NOW() WHERE id=$2`, ch.ChallengerID, challengeID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, ch.ChallengerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2 AND rank<$3`, ch.LadderID, ch.ChallengedRank, ch.ChallengerRank)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, ch.ChallengedRank, ch.LadderID, ch.ChallengerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET wins=wins+1, updated_at=NOW() WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, ch.ChallengerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET losses=losses+1, updated_at=NOW() WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, ch.ChallengedID)

	tx.Commit(ctx)
	return c.JSON(http.StatusOK, map[string]string{"status": "forfeited"})
}

// AdminAwardPoints grants manual points (volunteer, bonus, etc.)
func (h *LadderHandler) AdminAwardPoints(c echo.Context) error {
	ladderID := c.Param("id")
	var req struct {
		UserID     string `json:"user_id"`
		Points     int    `json:"points"`
		SourceType string `json:"source_type"` // volunteer | bonus
		Note       string `json:"note"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Points == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and points required")
	}
	if req.SourceType == "" { req.SourceType = "bonus" }
	ctx := c.Request().Context()
	h.DB.Exec(ctx, `INSERT INTO tennis_season_points (ladder_id,user_id,points,source_type,note) VALUES ($1,$2,$3,$4,$5)`,
		ladderID, req.UserID, req.Points, req.SourceType, req.Note)
	h.DB.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=season_points+$1 WHERE ladder_id=$2 AND user_id=$3`,
		req.Points, ladderID, req.UserID)
	return c.JSON(http.StatusOK, map[string]interface{}{"user_id": req.UserID, "points_awarded": req.Points})
}

func (h *LadderHandler) AdminDeleteLadder(c echo.Context) error {
	id := c.Param("id")
	if !confirm(c) {
		return echo.NewHTTPError(http.StatusBadRequest, "confirm=true required")
	}
	h.DB.Exec(c.Request().Context(), `DELETE FROM tennis_ladders WHERE id=$1`, id)
	return c.NoContent(http.StatusNoContent)
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

func confirm(c echo.Context) bool {
	return c.QueryParam("confirm") == "true"
}

func scanChallenges(rows interface {
	Next() bool
	Close()
	Scan(...interface{}) error
}) []challengeRow {
	out := []challengeRow{}
	for rows.Next() {
		var ch challengeRow
		rows.Scan(
			&ch.ID, &ch.LadderID,
			&ch.ChallengerID, &ch.ChallengerName, &ch.ChallengerRank,
			&ch.ChallengedID, &ch.ChallengedName, &ch.ChallengedRank,
			&ch.Status, &ch.WinnerID, &ch.Score, &ch.Message,
			&ch.CreatedAt, &ch.ExpiresAt, &ch.RespondBy, &ch.PlayBy, &ch.CompletedAt,
		)
		out = append(out, ch)
	}
	return out
}

func (h *LadderHandler) notifyChallengeReceived(ctx context.Context, challengedID, challengerID, challengeID, ladderID string) {
	if h.Mailer == nil {
		return
	}
	var email, challengerName string
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, challengedID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, challengerID).Scan(&challengerName)
	if email == "" {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 You've Been Challenged!</h2>
  <p><strong>%s</strong> has challenged you on the Live Oaks Tennis Ladder.</p>
  <p>Log in to accept or decline. You have <strong>72 hours</strong> to respond.</p>
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Challenge →</a>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you do not respond in 72 hours, the challenge will be auto-forfeited.</p>
</div>`, challengerName, h.SiteURL)
	h.Mailer.Send(email, challengerName+" challenged you on the ladder!", body)
}

func (h *LadderHandler) notifyChallengeResponse(ctx context.Context, challengerID, responderID, action, challengeID string) {
	if h.Mailer == nil {
		return
	}
	var email, responderName string
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, challengerID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, responderID).Scan(&responderName)
	if email == "" {
		return
	}
	var subject, msg string
	if action == "accepted" {
		subject = responderName + " accepted your ladder challenge"
		msg = fmt.Sprintf(`<p><strong>%s</strong> accepted your challenge. You have <strong>14 days</strong> to play the match. Good luck!</p>`, responderName)
	} else {
		subject = responderName + " declined your ladder challenge"
		msg = fmt.Sprintf(`<p><strong>%s</strong> declined your challenge.</p>`, responderName)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">🎾 Challenge Update</h2>
  %s
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Ladder →</a>
</div>`, msg, h.SiteURL)
	h.Mailer.Send(email, subject, body)
}
