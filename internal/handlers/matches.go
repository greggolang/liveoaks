package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// MatchesHandler backs the scorecard + club scoreboard feature: members report
// the score of a singles/doubles court booking, choose public or private
// visibility, and public results flow to the club-wide scoreboard.
type MatchesHandler struct {
	DB *pgxpool.Pool
}

// ── Scoring model ──────────────────────────────────────────────────────────

type setScore struct {
	A   int  `json:"a"`
	B   int  `json:"b"`
	TBA *int `json:"tba,omitempty"`
	TBB *int `json:"tbb,omitempty"`
}

// validateMatch enforces standard best-of-3 tennis scoring and returns the
// winning side (1 or 2) and a human summary ("6-4 3-6 7-6(5)") from side 1's
// perspective. Each set must be a legal result (6-0..6-4, 7-5, or 7-6 with an
// optional tiebreak score); the match must be decided 2 sets to 0 or 2 to 1.
func validateMatch(sets []setScore) (winnerSide int, summary string, err error) {
	if len(sets) < 2 || len(sets) > 3 {
		return 0, "", errors.New("a match must have 2 or 3 sets")
	}
	wonA, wonB := 0, 0
	parts := make([]string, 0, len(sets))
	for i, s := range sets {
		n := i + 1
		if s.A < 0 || s.B < 0 || s.A > 7 || s.B > 7 {
			return 0, "", fmt.Errorf("set %d: games must be between 0 and 7", n)
		}
		if s.A == s.B {
			return 0, "", fmt.Errorf("set %d can't be tied at %d-%d", n, s.A, s.B)
		}
		hi, lo := s.A, s.B
		if lo > hi {
			hi, lo = lo, hi
		}
		valid := (hi == 6 && lo <= 4) || (hi == 7 && (lo == 5 || lo == 6))
		if !valid {
			return 0, "", fmt.Errorf("set %d: %d-%d isn't a valid set score", n, s.A, s.B)
		}
		part := fmt.Sprintf("%d-%d", s.A, s.B)
		if hi == 7 && lo == 6 && s.TBA != nil && s.TBB != nil {
			// Annotate with the loser's tiebreak points, e.g. 7-6(5).
			loserTB := *s.TBB
			if s.B > s.A {
				loserTB = *s.TBA
			}
			if loserTB < 0 {
				return 0, "", fmt.Errorf("set %d: tiebreak points can't be negative", n)
			}
			part = fmt.Sprintf("%d-%d(%d)", s.A, s.B, loserTB)
		}
		parts = append(parts, part)
		if s.A > s.B {
			wonA++
		} else {
			wonB++
		}
	}
	switch len(sets) {
	case 2:
		if wonA != 2 && wonB != 2 {
			return 0, "", errors.New("in a 2-set match one side must win both sets")
		}
	case 3:
		if !((wonA == 2 && wonB == 1) || (wonB == 2 && wonA == 1)) {
			return 0, "", errors.New("a 3-set match must be decided 2 sets to 1")
		}
	}
	winnerSide = 1
	if wonB > wonA {
		winnerSide = 2
	}
	return winnerSide, strings.Join(parts, " "), nil
}

// ── Output shapes ──────────────────────────────────────────────────────────

type participantOut struct {
	Side     int     `json:"side"`
	Position int     `json:"position"`
	UserID   *string `json:"user_id"`
	Name     string  `json:"name"`
	IsGuest  bool    `json:"is_guest"`
}

type matchOut struct {
	ID           string          `json:"id"`
	BookingID    *string         `json:"booking_id"`
	MatchType    string          `json:"match_type"`
	CourtName    *string         `json:"court_name"`
	PlayedAt     time.Time       `json:"played_at"`
	Visibility   string          `json:"visibility"`
	WinnerSide   int             `json:"winner_side"`
	ScoreSummary string          `json:"score_summary"`
	Sets         json.RawMessage `json:"sets"`
	ReportedBy   *string         `json:"reported_by_name"`
	CreatedAt    time.Time       `json:"created_at"`
	Participants []participantOut `json:"participants"`
}

// loadMatches runs a matches query (whose SELECT columns must match the scan
// below) and attaches each match's participants.
func (h *MatchesHandler) loadMatches(c echo.Context, sql string, args ...any) ([]matchOut, error) {
	ctx := c.Request().Context()
	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []matchOut{}
	byID := map[string]int{}
	ids := []string{}
	for rows.Next() {
		var m matchOut
		if err := rows.Scan(&m.ID, &m.BookingID, &m.MatchType, &m.CourtName, &m.PlayedAt,
			&m.Visibility, &m.WinnerSide, &m.ScoreSummary, &m.Sets, &m.ReportedBy, &m.CreatedAt); err != nil {
			continue
		}
		m.Participants = []participantOut{}
		byID[m.ID] = len(out)
		out = append(out, m)
		ids = append(ids, m.ID)
	}
	rows.Close()
	if len(ids) == 0 {
		return out, nil
	}

	prows, err := h.DB.Query(ctx, `
		SELECT match_id::text, side, position, user_id::text, name, is_guest
		FROM match_participants WHERE match_id = ANY($1)
		ORDER BY side, position`, ids)
	if err == nil {
		for prows.Next() {
			var mid string
			var p participantOut
			if prows.Scan(&mid, &p.Side, &p.Position, &p.UserID, &p.Name, &p.IsGuest) != nil {
				continue
			}
			if idx, ok := byID[mid]; ok {
				out[idx].Participants = append(out[idx].Participants, p)
			}
		}
		prows.Close()
	}
	return out, nil
}

const matchSelect = `
	SELECT m.id, m.booking_id::text, m.match_type, m.court_name, m.played_at,
	       m.visibility, m.winner_side, m.score_summary, m.sets,
	       ru.first_name || ' ' || ru.last_name, m.created_at
	FROM matches m
	LEFT JOIN users ru ON ru.id = m.reported_by`

// ── Endpoints ──────────────────────────────────────────────────────────────

type pendingPlayer struct {
	UserID  *string `json:"user_id"`
	Name    string  `json:"name"`
	IsGuest bool    `json:"is_guest"`
}

type pendingMatch struct {
	BookingID string          `json:"booking_id"`
	CourtName string          `json:"court_name"`
	StartTime time.Time       `json:"start_time"`
	MatchType string          `json:"match_type"`
	Players   []pendingPlayer `json:"players"`
}

// Pending returns the caller's singles/doubles bookings that have ended within
// the last two weeks and don't yet have a scorecard — the prompts shown on the
// dashboard and Scores page. The booking roster is included to prefill players.
func (h *MatchesHandler) Pending(c echo.Context) error {
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()
	rows, err := h.DB.Query(ctx, `
		SELECT b.id::text, ct.name, b.start_time, b.match_type
		FROM bookings b
		JOIN courts ct ON ct.id = b.court_id
		WHERE b.user_id = $1
		  AND b.match_type IN ('singles', 'doubles')
		  AND b.end_time < NOW()
		  AND b.end_time > NOW() - INTERVAL '14 days'
		  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.booking_id = b.id)
		ORDER BY b.start_time DESC`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load pending matches")
	}
	defer rows.Close()

	out := []pendingMatch{}
	for rows.Next() {
		var pm pendingMatch
		if err := rows.Scan(&pm.BookingID, &pm.CourtName, &pm.StartTime, &pm.MatchType); err != nil {
			continue
		}
		pm.Players = []pendingPlayer{}
		out = append(out, pm)
	}
	rows.Close()

	for i := range out {
		prows, err := h.DB.Query(ctx, `
			SELECT mp.user_id::text, mp.player_name, mp.is_guest
			FROM match_players mp
			WHERE mp.booking_id = $1 AND mp.withdrew_at IS NULL
			ORDER BY mp.is_host DESC, mp.added_at`, out[i].BookingID)
		if err != nil {
			continue
		}
		for prows.Next() {
			var p pendingPlayer
			if prows.Scan(&p.UserID, &p.Name, &p.IsGuest) == nil {
				out[i].Players = append(out[i].Players, p)
			}
		}
		prows.Close()
	}
	return c.JSON(http.StatusOK, out)
}

// Recent returns public matches for the club-wide scoreboard, newest first.
func (h *MatchesHandler) Recent(c echo.Context) error {
	limit := 30
	if n := c.QueryParam("limit"); n != "" {
		fmt.Sscanf(n, "%d", &limit)
	}
	if limit < 1 || limit > 100 {
		limit = 30
	}
	out, err := h.loadMatches(c, matchSelect+`
		WHERE m.visibility = 'public'
		ORDER BY m.played_at DESC, m.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load matches")
	}
	return c.JSON(http.StatusOK, out)
}

// Mine returns every match the caller played in, public or private.
func (h *MatchesHandler) Mine(c echo.Context) error {
	userID := c.Get("user_id").(string)
	out, err := h.loadMatches(c, matchSelect+`
		WHERE m.id IN (SELECT match_id FROM match_participants WHERE user_id = $1)
		ORDER BY m.played_at DESC, m.created_at DESC
		LIMIT 200`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load matches")
	}
	return c.JSON(http.StatusOK, out)
}

// Get returns one match. Private matches are only visible to their participants.
func (h *MatchesHandler) Get(c echo.Context) error {
	userID := c.Get("user_id").(string)
	out, err := h.loadMatches(c, matchSelect+` WHERE m.id = $1`, c.Param("id"))
	if err != nil || len(out) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "match not found")
	}
	m := out[0]
	if m.Visibility != "public" {
		isPlayer := false
		for _, p := range m.Participants {
			if p.UserID != nil && *p.UserID == userID {
				isPlayer = true
				break
			}
		}
		if !isPlayer {
			return echo.NewHTTPError(http.StatusForbidden, "this match is private")
		}
	}
	return c.JSON(http.StatusOK, m)
}

type playerInput struct {
	UserID  *string `json:"user_id"`
	Name    string  `json:"name"`
	IsGuest bool    `json:"is_guest"`
}

// Create records (or replaces) the scorecard for a booking. Only the booking
// host may report the score. Players are supplied as two sides so the host can
// swap in a last-minute substitute who wasn't on the original roster.
func (h *MatchesHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(string)
	ctx := c.Request().Context()

	var req struct {
		BookingID  string          `json:"booking_id"`
		MatchType  string          `json:"match_type"`
		Visibility string          `json:"visibility"`
		Teams      [][]playerInput `json:"teams"`
		Sets       []setScore      `json:"sets"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.BookingID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "booking_id is required")
	}
	if req.Visibility != "private" {
		req.Visibility = "public"
	}

	// The booking must exist, belong to the caller, and be a singles/doubles match.
	var courtName, bookingType string
	var playedAt time.Time
	err := h.DB.QueryRow(ctx, `
		SELECT ct.name, b.match_type, b.start_time
		FROM bookings b JOIN courts ct ON ct.id = b.court_id
		WHERE b.id = $1 AND b.user_id = $2`, req.BookingID, userID).
		Scan(&courtName, &bookingType, &playedAt)
	if err != nil {
		return echo.NewHTTPError(http.StatusForbidden, "only the booking host can enter this score")
	}
	if bookingType != "singles" && bookingType != "doubles" {
		return echo.NewHTTPError(http.StatusBadRequest, "only singles and doubles matches can be scored")
	}
	req.MatchType = bookingType

	// Team shape must match the match type.
	perSide := 1
	if req.MatchType == "doubles" {
		perSide = 2
	}
	if len(req.Teams) != 2 {
		return echo.NewHTTPError(http.StatusBadRequest, "two teams are required")
	}
	for s, team := range req.Teams {
		if len(team) != perSide {
			return echo.NewHTTPError(http.StatusBadRequest,
				fmt.Sprintf("team %d must have %d player(s)", s+1, perSide))
		}
		for _, p := range team {
			if strings.TrimSpace(p.Name) == "" {
				return echo.NewHTTPError(http.StatusBadRequest, "every player needs a name")
			}
		}
	}

	winnerSide, summary, verr := validateMatch(req.Sets)
	if verr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, verr.Error())
	}
	setsJSON, _ := json.Marshal(req.Sets)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save score")
	}
	defer tx.Rollback(ctx)

	// Replace any prior scorecard for this booking (host fixing a mistake).
	tx.Exec(ctx, `DELETE FROM matches WHERE booking_id = $1`, req.BookingID)

	var matchID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO matches (booking_id, match_type, court_name, played_at, visibility,
		                     winner_side, sets, score_summary, reported_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id`,
		req.BookingID, req.MatchType, courtName, playedAt, req.Visibility,
		winnerSide, setsJSON, summary, userID).Scan(&matchID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save score")
	}

	for s, team := range req.Teams {
		for pos, p := range team {
			var uid interface{}
			if p.UserID != nil && *p.UserID != "" {
				uid = *p.UserID
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO match_participants (match_id, side, position, user_id, name, is_guest)
				VALUES ($1, $2, $3, $4, $5, $6)`,
				matchID, s+1, pos+1, uid, strings.TrimSpace(p.Name), p.IsGuest && uid == nil); err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, "could not save players")
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save score")
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": matchID})
}
