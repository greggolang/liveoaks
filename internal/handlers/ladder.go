package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/greggolang/liveoaks/internal/notifprefs"
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
	ID            string  `json:"id"`
	LadderID      string  `json:"ladder_id"`
	UserID        string  `json:"user_id"`
	Name          string  `json:"name"`
	Rank          int     `json:"rank"`
	Wins          int     `json:"wins"`
	Losses        int     `json:"losses"`
	SeasonPoints  int     `json:"season_points"`
	PlayerStatus  string  `json:"player_status"`
	CurrentStreak int     `json:"current_streak"`
	LongestStreak int     `json:"longest_streak"`
	LastMatchDate *string `json:"last_match_date"`
	DateJoined    string  `json:"date_joined"`
}

type challengeRow struct {
	ID                 string  `json:"id"`
	LadderID           string  `json:"ladder_id"`
	ChallengerID       string  `json:"challenger_id"`
	ChallengerName     string  `json:"challenger_name"`
	ChallengerRank     int     `json:"challenger_rank"`
	ChallengedID       string  `json:"challenged_id"`
	ChallengedName     string  `json:"challenged_name"`
	ChallengedRank     int     `json:"challenged_rank"`
	Status             string  `json:"status"`
	WinnerID           *string `json:"winner_id"`
	Score              string  `json:"score"`
	ScoreStatus        string  `json:"score_status"`
	ScoreSubmittedBy   *string `json:"score_submitted_by"`
	Message            string  `json:"message"`
	MatchFormat        string  `json:"match_format"`
	MatchDate          *string `json:"match_date"`
	MatchTime          string  `json:"match_time"`
	CreatedAt          string  `json:"created_at"`
	ExpiresAt          string  `json:"expires_at"`
	RespondBy          string  `json:"respond_by"`
	PlayBy             *string `json:"play_by"`
	CompletedAt        *string `json:"completed_at"`
}

type registrationRow struct {
	ID           string   `json:"id"`
	LadderID     string   `json:"ladder_id"`
	UserID       string   `json:"user_id"`
	Name         string   `json:"name"`
	Email        string   `json:"email"`
	USTARating   string   `json:"usta_rating"`
	SelfRating   *float64 `json:"self_rating"`
	Preference   string   `json:"preference"`
	Availability string   `json:"availability"`
	Notes        string   `json:"notes"`
	Status       string   `json:"status"`
	CreatedAt    string   `json:"created_at"`
}

type auditRow struct {
	ID           string  `json:"id"`
	LadderID     *string `json:"ladder_id"`
	AdminID      string  `json:"admin_id"`
	AdminName    string  `json:"admin_name"`
	Action       string  `json:"action"`
	TargetUserID *string `json:"target_user_id"`
	TargetName   string  `json:"target_name"`
	Note         string  `json:"note"`
	CreatedAt    string  `json:"created_at"`
}

type conductRow struct {
	ID           string  `json:"id"`
	LadderID     string  `json:"ladder_id"`
	UserID       string  `json:"user_id"`
	UserName     string  `json:"user_name"`
	Type         string  `json:"type"`
	Reason       string  `json:"reason"`
	IssuedBy     string  `json:"issued_by"`
	IssuedByName string  `json:"issued_by_name"`
	ExpiresAt    *string `json:"expires_at"`
	CreatedAt    string  `json:"created_at"`
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

	// Auto-expire pending challenges past respond_by (no response = forfeit challenger wins)
	h.autoForfeitExpired(ctx, id)

	// Entries
	eRows, _ := h.DB.Query(ctx, `
		SELECT le.id, le.ladder_id, le.user_id, u.first_name||' '||u.last_name,
		       le.rank, le.wins, le.losses, le.season_points,
		       le.player_status, le.current_streak, le.longest_streak,
		       to_char(le.last_match_date,'YYYY-MM-DD'), to_char(le.date_joined,'YYYY-MM-DD')
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id = $1 ORDER BY le.rank`, id)
	defer eRows.Close()
	entries := []entryRow{}
	for eRows.Next() {
		var e entryRow
		eRows.Scan(&e.ID, &e.LadderID, &e.UserID, &e.Name, &e.Rank, &e.Wins, &e.Losses, &e.SeasonPoints,
			&e.PlayerStatus, &e.CurrentStreak, &e.LongestStreak, &e.LastMatchDate, &e.DateJoined)
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

	var regStatus string
	h.DB.QueryRow(ctx,
		`SELECT status FROM tennis_registrations WHERE ladder_id=$1 AND user_id=$2`, ladderID, userID,
	).Scan(&regStatus)

	var entry entryRow
	h.DB.QueryRow(ctx, `
		SELECT le.id, le.ladder_id, le.user_id, u.first_name||' '||u.last_name,
		       le.rank, le.wins, le.losses, le.season_points,
		       le.player_status, le.current_streak, le.longest_streak,
		       to_char(le.last_match_date,'YYYY-MM-DD'), to_char(le.date_joined,'YYYY-MM-DD')
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id=$1 AND le.user_id=$2`, ladderID, userID,
	).Scan(&entry.ID, &entry.LadderID, &entry.UserID, &entry.Name,
		&entry.Rank, &entry.Wins, &entry.Losses, &entry.SeasonPoints,
		&entry.PlayerStatus, &entry.CurrentStreak, &entry.LongestStreak,
		&entry.LastMatchDate, &entry.DateJoined)

	cRows, _ := h.DB.Query(ctx, `
		SELECT ch.id, ch.ladder_id,
		       ch.challenger_id, cu.first_name||' '||cu.last_name,
		       ch.challenger_rank,
		       ch.challenged_id, du.first_name||' '||du.last_name,
		       ch.challenged_rank,
		       ch.status, ch.winner_id, ch.score, ch.score_status, ch.score_submitted_by,
		       ch.message, ch.match_format,
		       to_char(ch.match_date,'YYYY-MM-DD'), ch.match_time,
		       to_char(ch.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.respond_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.play_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(ch.completed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_challenges ch
		JOIN users cu ON cu.id = ch.challenger_id
		JOIN users du ON du.id = ch.challenged_id
		WHERE ch.ladder_id=$1 AND (ch.challenger_id=$2 OR ch.challenged_id=$2)
		  AND ch.status IN ('pending','accepted','completed')
		ORDER BY ch.created_at DESC LIMIT 20`, ladderID, userID)
	defer cRows.Close()
	challenges := scanChallenges(cRows)

	// Active conduct records
	var suspended bool
	var conductNote string
	h.DB.QueryRow(ctx, `
		SELECT reason FROM tennis_player_conduct
		WHERE ladder_id=$1 AND user_id=$2 AND type='suspension'
		  AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY created_at DESC LIMIT 1`, ladderID, userID,
	).Scan(&conductNote)
	if conductNote != "" {
		suspended = true
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"registered":          regStatus != "",
		"registration_status": regStatus,
		"entry":               entry,
		"challenges":          challenges,
		"suspended":           suspended,
		"suspend_reason":      conductNote,
	})
}

func (h *LadderHandler) CreateChallenge(c echo.Context) error {
	ladderID := c.Param("id")
	challengerID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		ChallengedID string `json:"challenged_id"`
		Message      string `json:"message"`
		MatchFormat  string `json:"match_format"`
	}
	if err := c.Bind(&req); err != nil || req.ChallengedID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "challenged_id required")
	}
	if req.MatchFormat == "" {
		req.MatchFormat = "best_of_3"
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

	// Check challenger is suspended
	var suspendReason string
	h.DB.QueryRow(ctx, `
		SELECT reason FROM tennis_player_conduct
		WHERE ladder_id=$1 AND user_id=$2 AND type='suspension'
		  AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`, ladderID, challengerID,
	).Scan(&suspendReason)
	if suspendReason != "" {
		return echo.NewHTTPError(http.StatusForbidden, "your account is suspended: "+suspendReason)
	}

	// Get challenger's rank and status
	var challengerRank int
	var challengerStatus string
	if err := h.DB.QueryRow(ctx,
		`SELECT rank, player_status FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, challengerID,
	).Scan(&challengerRank, &challengerStatus); err != nil {
		return echo.NewHTTPError(http.StatusForbidden, "you are not on this ladder")
	}
	if challengerStatus == "inactive" {
		return echo.NewHTTPError(http.StatusForbidden, "your status is inactive — contact an admin")
	}
	if challengerStatus == "injury_reserve" {
		return echo.NewHTTPError(http.StatusForbidden, "you are on injury reserve and cannot challenge")
	}
	if challengerStatus == "vacation_hold" {
		return echo.NewHTTPError(http.StatusForbidden, "you are on vacation hold and cannot challenge")
	}
	if challengerStatus == "suspended" {
		return echo.NewHTTPError(http.StatusForbidden, "your account is suspended")
	}

	// Get challenged's rank and status
	var challengedRank int
	var challengedStatus string
	if err := h.DB.QueryRow(ctx,
		`SELECT rank, player_status FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, req.ChallengedID,
	).Scan(&challengedRank, &challengedStatus); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "opponent not found on ladder")
	}
	if challengedStatus == "inactive" {
		return echo.NewHTTPError(http.StatusBadRequest, "that player is inactive and cannot be challenged")
	}
	if challengedStatus == "injury_reserve" {
		return echo.NewHTTPError(http.StatusBadRequest, "that player is on injury reserve and cannot be challenged")
	}
	if challengedStatus == "vacation_hold" {
		return echo.NewHTTPError(http.StatusBadRequest, "that player is on vacation hold and cannot be challenged")
	}
	if challengedStatus == "suspended" {
		return echo.NewHTTPError(http.StatusBadRequest, "that player is suspended")
	}

	// Validate challenge range
	if challengedRank >= challengerRank {
		return echo.NewHTTPError(http.StatusBadRequest, "you can only challenge players ranked above you")
	}
	if challengerRank-challengedRank > ladder.ChallengeRange {
		return echo.NewHTTPError(http.StatusBadRequest,
			fmt.Sprintf("you can only challenge up to %d spots above you", ladder.ChallengeRange))
	}

	// Prevent outgoing challenge if already has one
	var existing int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM tennis_challenges WHERE ladder_id=$1 AND challenger_id=$2 AND status IN ('pending','accepted')`,
		ladderID, challengerID,
	).Scan(&existing)
	if existing > 0 {
		return echo.NewHTTPError(http.StatusConflict, "you already have an active outgoing challenge")
	}

	// Prevent if challenged already has an incoming pending/accepted challenge
	var incomingCount int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM tennis_challenges WHERE ladder_id=$1 AND challenged_id=$2 AND status IN ('pending','accepted')`,
		ladderID, req.ChallengedID,
	).Scan(&incomingCount)
	if incomingCount > 0 {
		return echo.NewHTTPError(http.StatusConflict, "that player already has a pending challenge")
	}

	// Prevent circular challenges (B challenges A while A has pending against B)
	var circular int
	h.DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM tennis_challenges
		 WHERE ladder_id=$1 AND challenger_id=$2 AND challenged_id=$3 AND status IN ('pending','accepted')`,
		ladderID, req.ChallengedID, challengerID,
	).Scan(&circular)
	if circular > 0 {
		return echo.NewHTTPError(http.StatusConflict, "that player has already challenged you")
	}

	now := time.Now()
	expiresAt := now.Add(time.Duration(ladder.ChallengeExpiryDays) * 24 * time.Hour)
	respondBy := now.Add(time.Duration(ladder.ResponseWindowHours) * time.Hour)

	var ch challengeRow
	err := h.DB.QueryRow(ctx, `
		INSERT INTO tennis_challenges
		  (ladder_id, challenger_id, challenged_id, challenger_rank, challenged_rank,
		   message, match_format, expires_at, respond_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, ladder_id, challenger_id, '', $4, challenged_id, '', $5,
		          status, winner_id, score, score_status, score_submitted_by,
		          message, match_format,
		          to_char(match_date,'YYYY-MM-DD'), match_time,
		          to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(respond_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(play_by,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		          to_char(completed_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		ladderID, challengerID, req.ChallengedID, challengerRank, challengedRank,
		req.Message, req.MatchFormat, expiresAt, respondBy,
	).Scan(&ch.ID, &ch.LadderID, &ch.ChallengerID, &ch.ChallengerName, &ch.ChallengerRank,
		&ch.ChallengedID, &ch.ChallengedName, &ch.ChallengedRank,
		&ch.Status, &ch.WinnerID, &ch.Score, &ch.ScoreStatus, &ch.ScoreSubmittedBy,
		&ch.Message, &ch.MatchFormat, &ch.MatchDate, &ch.MatchTime,
		&ch.CreatedAt, &ch.ExpiresAt, &ch.RespondBy, &ch.PlayBy, &ch.CompletedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create challenge")
	}

	go h.notifyChallengeReceived(ctx, req.ChallengedID, challengerID, ch.ID, ladderID, ladder.ResponseWindowHours)

	return c.JSON(http.StatusCreated, ch)
}

func (h *LadderHandler) RespondChallenge(c echo.Context) error {
	challengeID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		Action    string `json:"action"` // accept | decline
		MatchDate string `json:"match_date"`
		MatchTime string `json:"match_time"`
	}
	if err := c.Bind(&req); err != nil || (req.Action != "accept" && req.Action != "decline") {
		return echo.NewHTTPError(http.StatusBadRequest, "action must be accept or decline")
	}

	var challengedID, ladderID, challengerID string
	var expiresAt time.Time
	var status string
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
		if req.MatchDate != "" {
			h.DB.Exec(ctx, `
				UPDATE tennis_challenges
				SET status='accepted', play_by=$1, match_date=$2, match_time=$3
				WHERE id=$4`, playBy, req.MatchDate, req.MatchTime, challengeID)
		} else {
			h.DB.Exec(ctx, `
				UPDATE tennis_challenges SET status='accepted', play_by=$1 WHERE id=$2`,
				playBy, challengeID)
		}
	} else {
		h.DB.Exec(ctx, `UPDATE tennis_challenges SET status='declined' WHERE id=$1`, challengeID)
	}

	go h.notifyChallengeResponse(ctx, challengerID, userID, newStatus, challengeID)

	return c.JSON(http.StatusOK, map[string]string{"status": newStatus})
}

// ScheduleMatch lets the challenger or challenged set/update the match date after acceptance.
func (h *LadderHandler) ScheduleMatch(c echo.Context) error {
	challengeID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		MatchDate string `json:"match_date"`
		MatchTime string `json:"match_time"`
	}
	if err := c.Bind(&req); err != nil || req.MatchDate == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "match_date required")
	}

	var challengerID, challengedID, status string
	if err := h.DB.QueryRow(ctx,
		`SELECT challenger_id, challenged_id, status FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&challengerID, &challengedID, &status); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if userID != challengerID && userID != challengedID {
		return echo.NewHTTPError(http.StatusForbidden, "not your challenge")
	}
	if status != "accepted" {
		return echo.NewHTTPError(http.StatusConflict, "challenge must be accepted before scheduling")
	}

	h.DB.Exec(ctx, `UPDATE tennis_challenges SET match_date=$1, match_time=$2 WHERE id=$3`,
		req.MatchDate, req.MatchTime, challengeID)

	return c.JSON(http.StatusOK, map[string]string{"match_date": req.MatchDate, "match_time": req.MatchTime})
}

// SubmitScore lets the winner submit the match score for opponent approval.
func (h *LadderHandler) SubmitScore(c echo.Context) error {
	challengeID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		Score string `json:"score"`
	}
	if err := c.Bind(&req); err != nil || req.Score == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "score required")
	}

	var challengerID, challengedID, status string
	if err := h.DB.QueryRow(ctx,
		`SELECT challenger_id, challenged_id, status FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&challengerID, &challengedID, &status); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if userID != challengerID && userID != challengedID {
		return echo.NewHTTPError(http.StatusForbidden, "not your challenge")
	}
	if status != "accepted" {
		return echo.NewHTTPError(http.StatusConflict, "challenge must be accepted to submit a score")
	}

	// Submitter is claiming they won
	h.DB.Exec(ctx, `
		UPDATE tennis_challenges
		SET score=$1, winner_id=$2, score_status='pending_approval', score_submitted_by=$2
		WHERE id=$3`, req.Score, userID, challengeID)

	// Notify the other player
	opponentID := challengedID
	if userID == challengedID {
		opponentID = challengerID
	}
	go h.notifyScoreSubmitted(ctx, opponentID, userID, challengeID)

	return c.JSON(http.StatusOK, map[string]string{"score_status": "pending_approval"})
}

// ApproveScore lets the opponent approve or dispute a submitted score.
func (h *LadderHandler) ApproveScore(c echo.Context) error {
	challengeID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		Action string `json:"action"` // approve | dispute
	}
	if err := c.Bind(&req); err != nil || (req.Action != "approve" && req.Action != "dispute") {
		return echo.NewHTTPError(http.StatusBadRequest, "action must be approve or dispute")
	}

	var challengerID, challengedID, status, scoreStatus string
	var winnerID *string
	var ladderID string
	if err := h.DB.QueryRow(ctx, `
		SELECT challenger_id, challenged_id, status, score_status, winner_id, ladder_id
		FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&challengerID, &challengedID, &status, &scoreStatus, &winnerID, &ladderID); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if userID != challengerID && userID != challengedID {
		return echo.NewHTTPError(http.StatusForbidden, "not your challenge")
	}
	if scoreStatus != "pending_approval" {
		return echo.NewHTTPError(http.StatusConflict, "no pending score to review")
	}
	// The submitter cannot approve their own score
	var submittedBy string
	h.DB.QueryRow(ctx, `SELECT score_submitted_by FROM tennis_challenges WHERE id=$1`, challengeID).Scan(&submittedBy)
	if userID == submittedBy {
		return echo.NewHTTPError(http.StatusForbidden, "you cannot approve your own score submission")
	}

	if req.Action == "dispute" {
		h.DB.Exec(ctx, `UPDATE tennis_challenges SET score_status='disputed' WHERE id=$1`, challengeID)
		go h.notifyScoreDisputed(ctx, submittedBy, userID, challengeID)
		return c.JSON(http.StatusOK, map[string]string{"score_status": "disputed"})
	}

	// Approve: finalize the result
	if winnerID == nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "winner not set on challenge")
	}

	var score string
	var challengerRank, challengedRank int
	h.DB.QueryRow(ctx, `SELECT score, challenger_rank, challenged_rank FROM tennis_challenges WHERE id=$1`, challengeID).
		Scan(&score, &challengerRank, &challengedRank)

	if err := h.applyResult(ctx, challengeID, ladderID, challengerID, challengedID, *winnerID, score, challengerRank, challengedRank); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not finalize result")
	}

	go h.notifyScoreApproved(ctx, submittedBy, userID, challengeID)
	go h.notifyRankChange(ctx, ladderID, *winnerID)

	return c.JSON(http.StatusOK, map[string]string{"score_status": "approved", "status": "completed"})
}

// SetMyStatus lets a player set their own status (injury_reserve or vacation_hold).
func (h *LadderHandler) SetMyStatus(c echo.Context) error {
	ladderID := c.Param("id")
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		Status string `json:"status"` // active | injury_reserve | vacation_hold
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	allowed := map[string]bool{"active": true, "injury_reserve": true, "vacation_hold": true}
	if !allowed[req.Status] {
		return echo.NewHTTPError(http.StatusBadRequest, "status must be active, injury_reserve, or vacation_hold")
	}

	var exists int
	h.DB.QueryRow(ctx, `SELECT 1 FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`, ladderID, userID).Scan(&exists)
	if exists == 0 {
		return echo.NewHTTPError(http.StatusForbidden, "you are not on this ladder")
	}

	h.DB.Exec(ctx, `UPDATE tennis_ladder_entries SET player_status=$1 WHERE ladder_id=$2 AND user_id=$3`,
		req.Status, ladderID, userID)

	return c.JSON(http.StatusOK, map[string]string{"player_status": req.Status})
}

func (h *LadderHandler) GetSeasonLeaderboard(c echo.Context) error {
	ladderID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT le.user_id, u.first_name||' '||u.last_name, le.rank, le.wins, le.losses,
		       le.season_points, le.current_streak
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id=$1
		ORDER BY le.season_points DESC, le.rank ASC`, ladderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch leaderboard")
	}
	defer rows.Close()
	type row struct {
		UserID        string `json:"user_id"`
		Name          string `json:"name"`
		Rank          int    `json:"rank"`
		Wins          int    `json:"wins"`
		Losses        int    `json:"losses"`
		SeasonPoints  int    `json:"season_points"`
		CurrentStreak int    `json:"current_streak"`
		PointsRank    int    `json:"points_rank"`
	}
	out := []row{}
	for rows.Next() {
		var r row
		rows.Scan(&r.UserID, &r.Name, &r.Rank, &r.Wins, &r.Losses, &r.SeasonPoints, &r.CurrentStreak)
		out = append(out, r)
	}
	for i := range out {
		out[i].PointsRank = i + 1
	}
	return c.JSON(http.StatusOK, out)
}

// GetStats returns aggregate statistics for the ladder dashboard.
func (h *LadderHandler) GetStats(c echo.Context) error {
	ladderID := c.Param("id")
	ctx := c.Request().Context()

	type stats struct {
		TotalPlayers           int     `json:"total_players"`
		ActivePlayers          int     `json:"active_players"`
		TotalMatches           int     `json:"total_matches"`
		MostActivePlayer       string  `json:"most_active_player"`
		MostActiveCount        int     `json:"most_active_count"`
		LongestStreak          int     `json:"longest_streak"`
		LongestStreakPlayer    string  `json:"longest_streak_player"`
		HighestClimber         string  `json:"highest_climber"`
		HighestClimberRankGain int     `json:"highest_climber_rank_gain"`
		MostChallengesIssued   string  `json:"most_challenges_issued"`
		MostChallengesCount    int     `json:"most_challenges_count"`
		AvgMatchDays           float64 `json:"avg_match_days"`
	}
	var s stats

	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM tennis_ladder_entries WHERE ladder_id=$1`, ladderID).Scan(&s.TotalPlayers)
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM tennis_ladder_entries WHERE ladder_id=$1 AND player_status='active'`, ladderID).Scan(&s.ActivePlayers)
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM tennis_challenges WHERE ladder_id=$1 AND status IN ('completed','forfeited')`, ladderID).Scan(&s.TotalMatches)

	// Most active player (most completed matches)
	h.DB.QueryRow(ctx, `
		SELECT u.first_name||' '||u.last_name, COUNT(*) as cnt
		FROM tennis_challenges ch
		JOIN users u ON u.id = ch.winner_id
		WHERE ch.ladder_id=$1 AND ch.status IN ('completed','forfeited')
		GROUP BY u.id, u.first_name, u.last_name
		ORDER BY cnt DESC LIMIT 1`, ladderID,
	).Scan(&s.MostActivePlayer, &s.MostActiveCount)

	// Longest current streak
	h.DB.QueryRow(ctx, `
		SELECT u.first_name||' '||u.last_name, le.longest_streak
		FROM tennis_ladder_entries le
		JOIN users u ON u.id = le.user_id
		WHERE le.ladder_id=$1
		ORDER BY le.longest_streak DESC LIMIT 1`, ladderID,
	).Scan(&s.LongestStreakPlayer, &s.LongestStreak)

	// Highest climber (challenger who improved rank the most: largest positive change)
	h.DB.QueryRow(ctx, `
		SELECT u.first_name||' '||u.last_name, MAX(ch.challenger_rank - le.rank) as gain
		FROM tennis_challenges ch
		JOIN tennis_ladder_entries le ON le.ladder_id=ch.ladder_id AND le.user_id=ch.challenger_id
		JOIN users u ON u.id = ch.challenger_id
		WHERE ch.ladder_id=$1 AND ch.status IN ('completed','forfeited') AND ch.winner_id=ch.challenger_id
		GROUP BY u.id, u.first_name, u.last_name
		ORDER BY gain DESC LIMIT 1`, ladderID,
	).Scan(&s.HighestClimber, &s.HighestClimberRankGain)

	// Most challenges issued
	h.DB.QueryRow(ctx, `
		SELECT u.first_name||' '||u.last_name, COUNT(*) as cnt
		FROM tennis_challenges ch
		JOIN users u ON u.id = ch.challenger_id
		WHERE ch.ladder_id=$1
		GROUP BY u.id, u.first_name, u.last_name
		ORDER BY cnt DESC LIMIT 1`, ladderID,
	).Scan(&s.MostChallengesIssued, &s.MostChallengesCount)

	// Average days from accepted to completed
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - play_by + (play_by - play_by + interval '1 day' * 0))) / 86400), 0)
		FROM tennis_challenges
		WHERE ladder_id=$1 AND status='completed' AND completed_at IS NOT NULL AND play_by IS NOT NULL`,
		ladderID,
	).Scan(&s.AvgMatchDays)

	return c.JSON(http.StatusOK, s)
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
	if req.ResponseWindowHours == 0 { req.ResponseWindowHours = 48 }
	if req.PlayWindowDays == 0 { req.PlayWindowDays = 10 }
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

	adminID := c.Get("user_id").(string)
	h.writeAudit(c.Request().Context(), &r.ID, adminID, "create_ladder", nil, "Created ladder: "+r.Name)

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

	adminID := c.Get("user_id").(string)
	h.writeAudit(c.Request().Context(), &id, adminID, "update_ladder", nil, "Updated ladder: "+r.Name)

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
	adminID := c.Get("user_id").(string)
	var req struct{ Status string `json:"status"` }
	c.Bind(&req)
	if req.Status == "" { req.Status = "approved" }
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE tennis_registrations SET status=$1 WHERE ladder_id=$2 AND user_id=$3`,
		req.Status, ladderID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update registration")
	}
	h.writeAudit(c.Request().Context(), &ladderID, adminID, "registration_"+req.Status, &userID, "")
	return c.JSON(http.StatusOK, map[string]string{"status": req.Status})
}

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

	var existingRank int
	tx.QueryRow(ctx,
		`SELECT rank FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`,
		ladderID, req.UserID).Scan(&existingRank)

	if existingRank == 0 {
		tx.Exec(ctx,
			`UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2`,
			ladderID, req.Rank)
		tx.Exec(ctx,
			`INSERT INTO tennis_ladder_entries (ladder_id, user_id, rank, date_joined) VALUES ($1,$2,$3,CURRENT_DATE)`,
			ladderID, req.UserID, req.Rank)
	} else {
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

	adminID := c.Get("user_id").(string)
	h.writeAudit(ctx, &ladderID, adminID, "set_rank", &req.UserID, fmt.Sprintf("Set rank to #%d", req.Rank))

	return c.JSON(http.StatusOK, map[string]interface{}{"user_id": req.UserID, "rank": req.Rank})
}

// AdminSetPlayerStatus lets an admin change a player's status (active/injury_reserve/vacation_hold/inactive/suspended).
func (h *LadderHandler) AdminSetPlayerStatus(c echo.Context) error {
	ladderID := c.Param("id")
	adminID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		UserID string `json:"user_id"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Status == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and status required")
	}
	allowed := map[string]bool{"active": true, "injury_reserve": true, "vacation_hold": true, "inactive": true, "suspended": true}
	if !allowed[req.Status] {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}

	h.DB.Exec(ctx, `UPDATE tennis_ladder_entries SET player_status=$1 WHERE ladder_id=$2 AND user_id=$3`,
		req.Status, ladderID, req.UserID)

	h.writeAudit(ctx, &ladderID, adminID, "set_player_status", &req.UserID,
		fmt.Sprintf("Status → %s. %s", req.Status, req.Note))

	return c.JSON(http.StatusOK, map[string]string{"player_status": req.Status})
}

func (h *LadderHandler) AdminGetChallenges(c echo.Context) error {
	ladderID := c.Param("id")
	ctx := c.Request().Context()

	h.autoForfeitExpired(ctx, ladderID)

	statusFilter := c.QueryParam("status")
	query := `
		SELECT ch.id, ch.ladder_id,
		       ch.challenger_id, cu.first_name||' '||cu.last_name, ch.challenger_rank,
		       ch.challenged_id, du.first_name||' '||du.last_name, ch.challenged_rank,
		       ch.status, ch.winner_id, ch.score, ch.score_status, ch.score_submitted_by,
		       ch.message, ch.match_format,
		       to_char(ch.match_date,'YYYY-MM-DD'), ch.match_time,
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
		Next() bool
		Close()
		Scan(...interface{}) error
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

func (h *LadderHandler) AdminEnterResult(c echo.Context) error {
	challengeID := c.Param("id")
	ctx := c.Request().Context()
	adminID := c.Get("user_id").(string)

	var req struct {
		WinnerID string `json:"winner_id"`
		Score    string `json:"score"`
	}
	if err := c.Bind(&req); err != nil || req.WinnerID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "winner_id required")
	}

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
	if ch.Status == "completed" {
		return echo.NewHTTPError(http.StatusConflict, "result already entered")
	}

	if err := h.applyResult(ctx, challengeID, ch.LadderID, ch.ChallengerID, ch.ChallengedID,
		req.WinnerID, req.Score, ch.ChallengerRank, ch.ChallengedRank); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save result")
	}

	h.writeAudit(ctx, &ch.LadderID, adminID, "enter_result", &req.WinnerID,
		fmt.Sprintf("Result entered. Score: %s", req.Score))

	go h.notifyRankChange(ctx, ch.LadderID, req.WinnerID)

	return c.JSON(http.StatusOK, map[string]string{"status": "completed", "winner_id": req.WinnerID})
}

func (h *LadderHandler) AdminForfeit(c echo.Context) error {
	challengeID := c.Param("id")
	ctx := c.Request().Context()
	adminID := c.Get("user_id").(string)

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

	h.applyForfeit(ctx, challengeID, ch.LadderID, ch.ChallengerID, ch.ChallengedID, ch.ChallengerRank, ch.ChallengedRank)

	h.writeAudit(ctx, &ch.LadderID, adminID, "forfeit", &ch.ChallengedID, "Admin forfeited challenge to challenger")

	return c.JSON(http.StatusOK, map[string]string{"status": "forfeited"})
}

func (h *LadderHandler) AdminAwardPoints(c echo.Context) error {
	ladderID := c.Param("id")
	adminID := c.Get("user_id").(string)
	var req struct {
		UserID     string `json:"user_id"`
		Points     int    `json:"points"`
		SourceType string `json:"source_type"`
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
	h.writeAudit(ctx, &ladderID, adminID, "award_points", &req.UserID,
		fmt.Sprintf("%d pts (%s): %s", req.Points, req.SourceType, req.Note))
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

// AdminGetAuditLog returns recent admin actions for a ladder.
func (h *LadderHandler) AdminGetAuditLog(c echo.Context) error {
	ladderID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT al.id, al.ladder_id, al.admin_id, al.admin_name, al.action,
		       al.target_user_id, al.target_name, al.note,
		       to_char(al.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_audit_log al
		WHERE al.ladder_id=$1
		ORDER BY al.created_at DESC LIMIT 200`, ladderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch audit log")
	}
	defer rows.Close()
	out := []auditRow{}
	for rows.Next() {
		var r auditRow
		rows.Scan(&r.ID, &r.LadderID, &r.AdminID, &r.AdminName, &r.Action,
			&r.TargetUserID, &r.TargetName, &r.Note, &r.CreatedAt)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// AdminIssueConductAction records a warning or suspension against a player.
func (h *LadderHandler) AdminIssueConductAction(c echo.Context) error {
	ladderID := c.Param("id")
	adminID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		UserID    string `json:"user_id"`
		Type      string `json:"type"` // warning | suspension
		Reason    string `json:"reason"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := c.Bind(&req); err != nil || req.UserID == "" || req.Reason == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and reason required")
	}
	if req.Type != "warning" && req.Type != "suspension" {
		req.Type = "warning"
	}

	var adminName, targetName string
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, adminID).Scan(&adminName)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, req.UserID).Scan(&targetName)

	var expiresAt interface{}
	if req.ExpiresAt != "" {
		expiresAt = req.ExpiresAt
	}

	h.DB.Exec(ctx, `
		INSERT INTO tennis_player_conduct (ladder_id, user_id, type, reason, issued_by, issued_by_name, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		ladderID, req.UserID, req.Type, req.Reason, adminID, adminName, expiresAt)

	// If suspension, also set player_status to suspended
	if req.Type == "suspension" {
		h.DB.Exec(ctx, `UPDATE tennis_ladder_entries SET player_status='suspended' WHERE ladder_id=$1 AND user_id=$2`,
			ladderID, req.UserID)
	}

	h.writeAudit(ctx, &ladderID, adminID, "conduct_"+req.Type, &req.UserID,
		fmt.Sprintf("%s issued against %s: %s", req.Type, targetName, req.Reason))

	go h.notifyConductAction(ctx, req.UserID, req.Type, req.Reason)

	return c.JSON(http.StatusOK, map[string]string{"status": "issued", "type": req.Type})
}

// AdminGetConduct returns all conduct records for a ladder.
func (h *LadderHandler) AdminGetConduct(c echo.Context) error {
	ladderID := c.Param("id")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT pc.id, pc.ladder_id, pc.user_id, u.first_name||' '||u.last_name,
		       pc.type, pc.reason, pc.issued_by, pc.issued_by_name,
		       to_char(pc.expires_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       to_char(pc.created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM tennis_player_conduct pc
		JOIN users u ON u.id = pc.user_id
		WHERE pc.ladder_id=$1
		ORDER BY pc.created_at DESC`, ladderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch conduct records")
	}
	defer rows.Close()
	out := []conductRow{}
	for rows.Next() {
		var r conductRow
		rows.Scan(&r.ID, &r.LadderID, &r.UserID, &r.UserName,
			&r.Type, &r.Reason, &r.IssuedBy, &r.IssuedByName,
			&r.ExpiresAt, &r.CreatedAt)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// AdminReverseResult reverses a completed match result.
func (h *LadderHandler) AdminReverseResult(c echo.Context) error {
	challengeID := c.Param("id")
	ctx := c.Request().Context()
	adminID := c.Get("user_id").(string)

	var req struct {
		Note string `json:"note"`
	}
	c.Bind(&req)

	var ch struct {
		LadderID       string
		ChallengerID   string
		ChallengedID   string
		ChallengerRank int
		ChallengedRank int
		WinnerID       *string
		Status         string
	}
	err := h.DB.QueryRow(ctx, `
		SELECT ladder_id, challenger_id, challenged_id, challenger_rank, challenged_rank, winner_id, status
		FROM tennis_challenges WHERE id=$1`, challengeID,
	).Scan(&ch.LadderID, &ch.ChallengerID, &ch.ChallengedID, &ch.ChallengerRank, &ch.ChallengedRank, &ch.WinnerID, &ch.Status)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "challenge not found")
	}
	if ch.Status != "completed" && ch.Status != "forfeited" {
		return echo.NewHTTPError(http.StatusConflict, "challenge is not resolved")
	}
	if ch.WinnerID == nil {
		return echo.NewHTTPError(http.StatusConflict, "no winner recorded")
	}

	loserID := ch.ChallengedID
	if *ch.WinnerID == ch.ChallengedID {
		loserID = ch.ChallengerID
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "db error")
	}
	defer tx.Rollback(ctx)

	// Reset challenge status to accepted for re-entry
	tx.Exec(ctx, `UPDATE tennis_challenges SET status='accepted', winner_id=NULL, score='', score_status='', completed_at=NULL WHERE id=$1`, challengeID)

	// Reverse rank movement if challenger had won
	if *ch.WinnerID == ch.ChallengerID {
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, ch.ChallengerID)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=rank-1 WHERE ladder_id=$1 AND rank>$2 AND rank<=$3`, ch.LadderID, ch.ChallengedRank, ch.ChallengerRank)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, ch.ChallengerRank, ch.LadderID, ch.ChallengerID)
	}

	// Reverse win/loss counts
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET wins=GREATEST(0,wins-1) WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, *ch.WinnerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET losses=GREATEST(0,losses-1) WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, loserID)

	// Remove season points from this challenge
	tx.Exec(ctx, `DELETE FROM tennis_season_points WHERE source_id=$1`, challengeID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=GREATEST(0,(SELECT COALESCE(SUM(points),0) FROM tennis_season_points WHERE ladder_id=$1 AND user_id=tennis_ladder_entries.user_id)) WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, *ch.WinnerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=GREATEST(0,(SELECT COALESCE(SUM(points),0) FROM tennis_season_points WHERE ladder_id=$1 AND user_id=tennis_ladder_entries.user_id)) WHERE ladder_id=$1 AND user_id=$2`, ch.LadderID, loserID)

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not reverse result")
	}

	h.writeAudit(ctx, &ch.LadderID, adminID, "reverse_result", ch.WinnerID,
		fmt.Sprintf("Reversed result for challenge. Note: %s", req.Note))

	return c.JSON(http.StatusOK, map[string]string{"status": "reversed"})
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

func confirm(c echo.Context) bool {
	return c.QueryParam("confirm") == "true"
}

// applyResult finalizes a match result: marks challenge complete, updates ranks, streaks, season points.
func (h *LadderHandler) applyResult(ctx context.Context, challengeID, ladderID, challengerID, challengedID, winnerID, score string, challengerRank, challengedRank int) error {
	loserID := challengedID
	if winnerID == challengedID {
		loserID = challengerID
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tx.Exec(ctx, `
		UPDATE tennis_challenges
		SET status='completed', winner_id=$1, score=$2, score_status='approved', completed_at=NOW()
		WHERE id=$3`, winnerID, score, challengeID)

	// Rank update: only if challenger wins
	if winnerID == challengerID {
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ladderID, challengerID)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2 AND rank<$3`, ladderID, challengedRank, challengerRank)
		tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, challengedRank, ladderID, challengerID)
	}

	today := time.Now().Format("2006-01-02")

	// Winner: increment wins, update streak, last match date
	tx.Exec(ctx, `
		UPDATE tennis_ladder_entries
		SET wins = wins+1,
		    current_streak = current_streak+1,
		    longest_streak = GREATEST(longest_streak, current_streak+1),
		    last_match_date = $1,
		    player_status = CASE WHEN player_status='inactive' THEN 'active' ELSE player_status END,
		    updated_at = NOW()
		WHERE ladder_id=$2 AND user_id=$3`, today, ladderID, winnerID)

	// Loser: increment losses, reset streak, last match date
	tx.Exec(ctx, `
		UPDATE tennis_ladder_entries
		SET losses = losses+1,
		    current_streak = 0,
		    last_match_date = $1,
		    player_status = CASE WHEN player_status='inactive' THEN 'active' ELSE player_status END,
		    updated_at = NOW()
		WHERE ladder_id=$2 AND user_id=$3`, today, ladderID, loserID)

	// Season points
	tx.Exec(ctx, `INSERT INTO tennis_season_points (ladder_id,user_id,points,source_type,source_id) VALUES ($1,$2,$3,'ladder_win',$4)`, ladderID, winnerID, pointsLadderWin, challengeID)
	tx.Exec(ctx, `INSERT INTO tennis_season_points (ladder_id,user_id,points,source_type,source_id) VALUES ($1,$2,$3,'ladder_loss',$4)`, ladderID, loserID, pointsLadderLoss, challengeID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=season_points+$1 WHERE ladder_id=$2 AND user_id=$3`, pointsLadderWin, ladderID, winnerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET season_points=season_points+$1 WHERE ladder_id=$2 AND user_id=$3`, pointsLadderLoss, ladderID, loserID)

	return tx.Commit(ctx)
}

// applyForfeit awards the challenger a forfeit win.
func (h *LadderHandler) applyForfeit(ctx context.Context, challengeID, ladderID, challengerID, challengedID string, challengerRank, challengedRank int) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	tx.Exec(ctx, `UPDATE tennis_challenges SET status='forfeited', winner_id=$1, completed_at=NOW() WHERE id=$2`, challengerID, challengeID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=99999 WHERE ladder_id=$1 AND user_id=$2`, ladderID, challengerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=rank+1 WHERE ladder_id=$1 AND rank>=$2 AND rank<$3`, ladderID, challengedRank, challengerRank)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET rank=$1 WHERE ladder_id=$2 AND user_id=$3`, challengedRank, ladderID, challengerID)

	today := time.Now().Format("2006-01-02")
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET wins=wins+1, current_streak=current_streak+1, longest_streak=GREATEST(longest_streak,current_streak+1), last_match_date=$1, updated_at=NOW() WHERE ladder_id=$2 AND user_id=$3`, today, ladderID, challengerID)
	tx.Exec(ctx, `UPDATE tennis_ladder_entries SET losses=losses+1, current_streak=0, last_match_date=$1, updated_at=NOW() WHERE ladder_id=$2 AND user_id=$3`, today, ladderID, challengedID)

	tx.Commit(ctx)
}

// autoForfeitExpired marks pending challenges past respond_by as forfeited.
func (h *LadderHandler) autoForfeitExpired(ctx context.Context, ladderID string) {
	rows, err := h.DB.Query(ctx, `
		SELECT id, challenger_id, challenged_id, challenger_rank, challenged_rank
		FROM tennis_challenges
		WHERE ladder_id=$1 AND status='pending' AND respond_by < NOW()`, ladderID)
	if err != nil {
		return
	}
	defer rows.Close()

	type pending struct {
		id             string
		challengerID   string
		challengedID   string
		challengerRank int
		challengedRank int
	}
	var toForfeit []pending
	for rows.Next() {
		var p pending
		rows.Scan(&p.id, &p.challengerID, &p.challengedID, &p.challengerRank, &p.challengedRank)
		toForfeit = append(toForfeit, p)
	}
	rows.Close()

	for _, p := range toForfeit {
		h.applyForfeit(ctx, p.id, ladderID, p.challengerID, p.challengedID, p.challengerRank, p.challengedRank)
	}
}

// writeAudit inserts an audit log record.
func (h *LadderHandler) writeAudit(ctx context.Context, ladderID *string, adminID, action string, targetUserID *string, note string) {
	var adminName, targetName string
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, adminID).Scan(&adminName)
	if targetUserID != nil {
		h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, *targetUserID).Scan(&targetName)
	}
	h.DB.Exec(ctx, `
		INSERT INTO tennis_audit_log (ladder_id, admin_id, admin_name, action, target_user_id, target_name, note)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		ladderID, adminID, adminName, action, targetUserID, targetName, note)
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
			&ch.Status, &ch.WinnerID, &ch.Score, &ch.ScoreStatus, &ch.ScoreSubmittedBy,
			&ch.Message, &ch.MatchFormat, &ch.MatchDate, &ch.MatchTime,
			&ch.CreatedAt, &ch.ExpiresAt, &ch.RespondBy, &ch.PlayBy, &ch.CompletedAt,
		)
		out = append(out, ch)
	}
	return out
}

// ─────────────────────────────────────────────
// Notification helpers
// ─────────────────────────────────────────────

func (h *LadderHandler) notifyChallengeReceived(ctx context.Context, challengedID, challengerID, challengeID, ladderID string, responseHours int) {
	if h.Mailer == nil {
		return
	}
	if !notifprefs.UserWantsEmail(ctx, h.DB, challengedID, "ladder_challenge") {
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
  <h2 style="color:#15803d">You've Been Challenged!</h2>
  <p><strong>%s</strong> has challenged you on the Live Oaks Tennis Ladder.</p>
  <p>Log in to accept or decline. You have <strong>%d hours</strong> to respond — no response results in an automatic forfeit.</p>
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Challenge</a>
</div>`, challengerName, responseHours, h.SiteURL)
	h.Mailer.Send(email, challengerName+" challenged you on the ladder!", body)
}

func (h *LadderHandler) notifyChallengeResponse(ctx context.Context, challengerID, responderID, action, challengeID string) {
	if h.Mailer == nil {
		return
	}
	if !notifprefs.UserWantsEmail(ctx, h.DB, challengerID, "ladder_challenge") {
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
		msg = fmt.Sprintf(`<p><strong>%s</strong> accepted your challenge. You have <strong>10 days</strong> to play. Good luck!</p>`, responderName)
	} else {
		subject = responderName + " declined your ladder challenge"
		msg = fmt.Sprintf(`<p><strong>%s</strong> declined your challenge. You may challenge another player.</p>`, responderName)
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Challenge Update</h2>
  %s
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Ladder</a>
</div>`, msg, h.SiteURL)
	h.Mailer.Send(email, subject, body)
}

func (h *LadderHandler) notifyScoreSubmitted(ctx context.Context, opponentID, submitterID, challengeID string) {
	if h.Mailer == nil {
		return
	}
	if !notifprefs.UserWantsEmail(ctx, h.DB, opponentID, "ladder_challenge") {
		return
	}
	var email, submitterName string
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, opponentID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, submitterID).Scan(&submitterName)
	if email == "" {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Score Submitted</h2>
  <p><strong>%s</strong> has submitted a score for your recent match. Please log in to approve or dispute the result.</p>
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">Review Score</a>
</div>`, submitterName, h.SiteURL)
	h.Mailer.Send(email, "Score submitted — please review", body)
}

func (h *LadderHandler) notifyScoreApproved(ctx context.Context, submitterID, approverID, challengeID string) {
	if h.Mailer == nil {
		return
	}
	if !notifprefs.UserWantsEmail(ctx, h.DB, submitterID, "ladder_challenge") {
		return
	}
	var email, approverName string
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, submitterID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, approverID).Scan(&approverName)
	if email == "" {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Score Approved</h2>
  <p><strong>%s</strong> approved the match score. The result is now official and rankings have been updated.</p>
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Ladder</a>
</div>`, approverName, h.SiteURL)
	h.Mailer.Send(email, "Match result confirmed — rankings updated", body)
}

func (h *LadderHandler) notifyScoreDisputed(ctx context.Context, submitterID, disputerID, challengeID string) {
	if h.Mailer == nil {
		return
	}
	var adminEmails []string
	aRows, _ := h.DB.Query(ctx, `
		SELECT u.email FROM admin_section_permissions asp
		JOIN users u ON u.id = asp.user_id
		WHERE asp.section = 'ladder_admin'`)
	if aRows != nil {
		defer aRows.Close()
		for aRows.Next() {
			var e string
			aRows.Scan(&e)
			if e != "" {
				adminEmails = append(adminEmails, e)
			}
		}
	}
	var submitterName, disputerName string
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, submitterID).Scan(&submitterName)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, disputerID).Scan(&disputerName)
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">Score Disputed</h2>
  <p><strong>%s</strong> disputed the score submitted by <strong>%s</strong>. Admin review required.</p>
  <a href="%s/admin/ladder" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">Review Dispute</a>
</div>`, disputerName, submitterName, h.SiteURL)
	for _, email := range adminEmails {
		h.Mailer.Send(email, "Score dispute requires admin review", body)
	}
}

func (h *LadderHandler) notifyRankChange(ctx context.Context, ladderID, winnerID string) {
	if h.Mailer == nil {
		return
	}
	if !notifprefs.UserWantsEmail(ctx, h.DB, winnerID, "ladder_challenge") {
		return
	}
	var email, name string
	var newRank int
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, winnerID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, winnerID).Scan(&name)
	h.DB.QueryRow(ctx, `SELECT rank FROM tennis_ladder_entries WHERE ladder_id=$1 AND user_id=$2`, ladderID, winnerID).Scan(&newRank)
	if email == "" || newRank == 0 {
		return
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">You Moved Up!</h2>
  <p>Congratulations <strong>%s</strong>! You are now ranked <strong>#%d</strong> on the Tennis Ladder.</p>
  <a href="%s/ladder" style="background:#15803d;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:16px">View Ladder</a>
</div>`, name, newRank, h.SiteURL)
	h.Mailer.Send(email, fmt.Sprintf("You're now #%d on the Tennis Ladder!", newRank), body)
}

func (h *LadderHandler) notifyConductAction(ctx context.Context, userID, actionType, reason string) {
	if h.Mailer == nil {
		return
	}
	var email, name string
	h.DB.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, userID).Scan(&email)
	h.DB.QueryRow(ctx, `SELECT first_name||' '||last_name FROM users WHERE id=$1`, userID).Scan(&name)
	if email == "" {
		return
	}
	var subject, header string
	if actionType == "suspension" {
		subject = "Tennis Ladder — Account Suspended"
		header = "Account Suspended"
	} else {
		subject = "Tennis Ladder — Warning Issued"
		header = "Warning Issued"
	}
	body := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">%s</h2>
  <p>Dear <strong>%s</strong>,</p>
  <p>A %s has been issued on your Tennis Ladder account:</p>
  <blockquote style="border-left:4px solid #dc2626;padding-left:12px;color:#374151">%s</blockquote>
  <p>Please contact the club administrator if you have questions.</p>
</div>`, header, name, actionType, reason)
	h.Mailer.Send(email, subject, body)
}
