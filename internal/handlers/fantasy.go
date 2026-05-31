package handlers

import (
	"context"
	"net/http"

	"github.com/greggolang/liveoaks/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

type FantasyHandler struct {
	DB *pgxpool.Pool
}

// ═══════════════════════════════════════════════
// Member endpoints
// ═══════════════════════════════════════════════

// GetTournaments returns all tournaments (open/locked/completed visible to members).
func (h *FantasyHandler) GetTournaments(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, year,
		       to_char(start_date,'YYYY-MM-DD'), to_char(end_date,'YYYY-MM-DD'), status
		FROM fantasy_tournaments
		WHERE status != 'draft'
		ORDER BY year DESC, start_date`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch tournaments")
	}
	defer rows.Close()
	out := []models.FantasyTournament{}
	for rows.Next() {
		var t models.FantasyTournament
		if err := rows.Scan(&t.ID, &t.Name, &t.Year, &t.StartDate, &t.EndDate, &t.Status); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		out = append(out, t)
	}
	return c.JSON(http.StatusOK, out)
}

// GetPlayers returns all players, optionally filtered by gender (?gender=M or W).
func (h *FantasyHandler) GetPlayers(c echo.Context) error {
	gender := c.QueryParam("gender")
	var rows interface {
		Next() bool
		Close()
		Scan(...interface{}) error
	}
	var err error
	if gender == "M" || gender == "W" {
		rows, err = h.DB.Query(c.Request().Context(),
			`SELECT id, name, gender, country FROM fantasy_players WHERE gender = $1 ORDER BY name`, gender)
	} else {
		rows, err = h.DB.Query(c.Request().Context(),
			`SELECT id, name, gender, country FROM fantasy_players ORDER BY gender, name`)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch players")
	}
	defer rows.Close()
	out := []models.FantasyPlayer{}
	for rows.Next() {
		var p models.FantasyPlayer
		if err := rows.Scan(&p.ID, &p.Name, &p.Gender, &p.Country); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		out = append(out, p)
	}
	return c.JSON(http.StatusOK, out)
}

// JoinPool opts the current user into the fantasy pool.
func (h *FantasyHandler) JoinPool(c echo.Context) error {
	userID := c.Get("user_id").(string)
	_, err := h.DB.Exec(c.Request().Context(),
		`INSERT INTO fantasy_participants (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not join pool")
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "joined"})
}

// GetMyStatus returns whether the user is a participant and their entry_paid status.
func (h *FantasyHandler) GetMyStatus(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var joined, paid bool
	err := h.DB.QueryRow(c.Request().Context(),
		`SELECT TRUE, entry_paid FROM fantasy_participants WHERE user_id = $1`, userID,
	).Scan(&joined, &paid)
	if err != nil {
		// Not in pool
		return c.JSON(http.StatusOK, map[string]interface{}{"joined": false, "entry_paid": false})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"joined": true, "entry_paid": paid})
}

// GetMyPicks returns the user's picks grouped by tournament.
func (h *FantasyHandler) GetMyPicks(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT fp.id, fp.tournament_id, fp.player_id, fp.pick_slot,
		       pl.name, pl.gender, pl.country
		FROM fantasy_picks fp
		JOIN fantasy_players pl ON pl.id = fp.player_id
		WHERE fp.user_id = $1
		ORDER BY fp.tournament_id, fp.pick_slot`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch picks")
	}
	defer rows.Close()
	out := []models.FantasyPick{}
	for rows.Next() {
		var p models.FantasyPick
		p.Player = &models.FantasyPlayer{}
		p.UserID = userID
		if err := rows.Scan(&p.ID, &p.TournamentID, &p.PlayerID, &p.PickSlot,
			&p.Player.Name, &p.Player.Gender, &p.Player.Country); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		p.Player.ID = p.PlayerID
		out = append(out, p)
	}
	return c.JSON(http.StatusOK, out)
}

// SavePicks upserts all 4 picks for a given tournament. Locked tournaments are rejected.
func (h *FantasyHandler) SavePicks(c echo.Context) error {
	userID := c.Get("user_id").(string)
	tournamentID := c.Param("tid")

	// Verify participant and tournament status
	var status string
	if err := h.DB.QueryRow(c.Request().Context(),
		`SELECT status FROM fantasy_tournaments WHERE id = $1`, tournamentID,
	).Scan(&status); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "tournament not found")
	}
	if status == "locked" || status == "completed" {
		return echo.NewHTTPError(http.StatusForbidden, "picks are locked for this tournament")
	}

	// Ensure participant
	h.DB.Exec(c.Request().Context(),
		`INSERT INTO fantasy_participants (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, userID)

	var req struct {
		Picks []struct {
			Slot     string `json:"slot"`
			PlayerID string `json:"player_id"`
		} `json:"picks"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	for _, pick := range req.Picks {
		if pick.PlayerID == "" {
			// Clear this slot
			h.DB.Exec(c.Request().Context(),
				`DELETE FROM fantasy_picks WHERE user_id=$1 AND tournament_id=$2 AND pick_slot=$3`,
				userID, tournamentID, pick.Slot)
		} else {
			_, err := h.DB.Exec(c.Request().Context(), `
				INSERT INTO fantasy_picks (user_id, tournament_id, player_id, pick_slot)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (user_id, tournament_id, pick_slot)
				DO UPDATE SET player_id = EXCLUDED.player_id`,
				userID, tournamentID, pick.PlayerID, pick.Slot)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, "could not save pick")
			}
		}
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "saved"})
}

// GetResults returns player results (and per-pick value) for a tournament.
func (h *FantasyHandler) GetResults(c echo.Context) error {
	tid := c.Param("tid")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT fpr.id, fpr.player_id, fpr.tournament_id, fpr.result, fpr.prize_money,
		       pl.name, pl.gender, pl.country,
		       COUNT(fp.id)::int AS pick_count,
		       CASE WHEN COUNT(fp.id) > 0
		            THEN fpr.prize_money / COUNT(fp.id)
		            ELSE fpr.prize_money
		       END AS value_per_pick
		FROM fantasy_player_results fpr
		JOIN fantasy_players pl ON pl.id = fpr.player_id
		LEFT JOIN fantasy_picks fp ON fp.player_id = fpr.player_id AND fp.tournament_id = fpr.tournament_id
		WHERE fpr.tournament_id = $1
		GROUP BY fpr.id, fpr.player_id, fpr.tournament_id, fpr.result, fpr.prize_money,
		         pl.name, pl.gender, pl.country
		ORDER BY fpr.prize_money DESC`, tid)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch results")
	}
	defer rows.Close()
	out := []models.FantasyResult{}
	for rows.Next() {
		var r models.FantasyResult
		r.Player = &models.FantasyPlayer{}
		if err := rows.Scan(&r.ID, &r.PlayerID, &r.TournamentID, &r.Result, &r.PrizeMoney,
			&r.Player.Name, &r.Player.Gender, &r.Player.Country,
			&r.PickCount, &r.ValuePerPick); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		r.Player.ID = r.PlayerID
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

// GetLeaderboard returns overall standings with per-tournament breakdowns.
func (h *FantasyHandler) GetLeaderboard(c echo.Context) error {
	ctx := c.Request().Context()

	// Per-tournament scores for every participant
	tRows, err := h.DB.Query(ctx, `
		WITH pick_counts AS (
			SELECT tournament_id, player_id, COUNT(*)::numeric AS cnt
			FROM fantasy_picks
			GROUP BY tournament_id, player_id
		),
		pick_values AS (
			SELECT fp.user_id, fp.tournament_id,
			       COALESCE(fpr.prize_money, 0) / GREATEST(pc.cnt, 1) AS value
			FROM fantasy_picks fp
			LEFT JOIN fantasy_player_results fpr
			    ON fpr.player_id = fp.player_id AND fpr.tournament_id = fp.tournament_id
			LEFT JOIN pick_counts pc
			    ON pc.tournament_id = fp.tournament_id AND pc.player_id = fp.player_id
		)
		SELECT pv.user_id, ft.name AS tname, SUM(pv.value) AS score
		FROM pick_values pv
		JOIN fantasy_tournaments ft ON ft.id = pv.tournament_id
		GROUP BY pv.user_id, ft.name
		ORDER BY pv.user_id, ft.name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "leaderboard error")
	}
	defer tRows.Close()

	// Accumulate tournament scores per user
	tScores := map[string]map[string]float64{}
	totals := map[string]float64{}
	for tRows.Next() {
		var uid, tname string
		var score float64
		if err := tRows.Scan(&uid, &tname, &score); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		if tScores[uid] == nil {
			tScores[uid] = map[string]float64{}
		}
		tScores[uid][tname] = score
		totals[uid] += score
	}

	// Get all participants
	pRows, err := h.DB.Query(ctx, `
		SELECT par.user_id, u.first_name || ' ' || u.last_name
		FROM fantasy_participants par
		JOIN users u ON u.id = par.user_id
		ORDER BY u.first_name, u.last_name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "participants error")
	}
	defer pRows.Close()

	standings := []models.FantasyStanding{}
	for pRows.Next() {
		var uid, name string
		if err := pRows.Scan(&uid, &name); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		ts := tScores[uid]
		if ts == nil {
			ts = map[string]float64{}
		}
		standings = append(standings, models.FantasyStanding{
			UserID:           uid,
			Name:             name,
			TotalScore:       totals[uid],
			TournamentScores: ts,
		})
	}

	// Sort by total score descending and assign rank
	for i := 0; i < len(standings); i++ {
		for j := i + 1; j < len(standings); j++ {
			if standings[j].TotalScore > standings[i].TotalScore {
				standings[i], standings[j] = standings[j], standings[i]
			}
		}
	}
	for i := range standings {
		standings[i].Rank = i + 1
	}

	// Also return tournament list
	tournaments := []models.FantasyTournament{}
	tListRows, _ := h.DB.Query(ctx,
		`SELECT id, name, year, to_char(start_date,'YYYY-MM-DD'), to_char(end_date,'YYYY-MM-DD'), status
		 FROM fantasy_tournaments WHERE status != 'draft' ORDER BY year, start_date`)
	if tListRows != nil {
		defer tListRows.Close()
		for tListRows.Next() {
			var t models.FantasyTournament
			tListRows.Scan(&t.ID, &t.Name, &t.Year, &t.StartDate, &t.EndDate, &t.Status)
			tournaments = append(tournaments, t)
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"standings":   standings,
		"tournaments": tournaments,
	})
}

// GetMyScores returns the detailed pick-by-pick breakdown for the current user.
func (h *FantasyHandler) GetMyScores(c echo.Context) error {
	userID := c.Get("user_id").(string)
	rows, err := h.DB.Query(c.Request().Context(), `
		WITH pick_counts AS (
			SELECT tournament_id, player_id, COUNT(*)::numeric AS cnt
			FROM fantasy_picks
			GROUP BY tournament_id, player_id
		)
		SELECT fp.tournament_id, ft.name AS tname, ft.status,
		       fp.pick_slot, fp.player_id, pl.name AS player_name, pl.gender,
		       COALESCE(fpr.result, '') AS result,
		       COALESCE(fpr.prize_money, 0) AS prize_money,
		       COALESCE(pc.cnt, 0)::int AS pick_count,
		       CASE WHEN pc.cnt > 0
		            THEN COALESCE(fpr.prize_money, 0) / pc.cnt
		            ELSE 0
		       END AS value
		FROM fantasy_picks fp
		JOIN fantasy_tournaments ft ON ft.id = fp.tournament_id
		JOIN fantasy_players pl ON pl.id = fp.player_id
		LEFT JOIN fantasy_player_results fpr
		    ON fpr.player_id = fp.player_id AND fpr.tournament_id = fp.tournament_id
		LEFT JOIN pick_counts pc
		    ON pc.tournament_id = fp.tournament_id AND pc.player_id = fp.player_id
		WHERE fp.user_id = $1
		ORDER BY ft.start_date NULLS LAST, ft.name, fp.pick_slot`, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch scores")
	}
	defer rows.Close()

	type PickScore struct {
		TournamentID   string  `json:"tournament_id"`
		TournamentName string  `json:"tournament_name"`
		Status         string  `json:"status"`
		PickSlot       string  `json:"pick_slot"`
		PlayerID       string  `json:"player_id"`
		PlayerName     string  `json:"player_name"`
		Gender         string  `json:"gender"`
		Result         string  `json:"result"`
		PrizeMoney     float64 `json:"prize_money"`
		PickCount      int     `json:"pick_count"`
		Value          float64 `json:"value"`
	}

	out := []PickScore{}
	for rows.Next() {
		var s PickScore
		if err := rows.Scan(&s.TournamentID, &s.TournamentName, &s.Status,
			&s.PickSlot, &s.PlayerID, &s.PlayerName, &s.Gender,
			&s.Result, &s.PrizeMoney, &s.PickCount, &s.Value); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "scan error")
		}
		out = append(out, s)
	}
	return c.JSON(http.StatusOK, out)
}

// ═══════════════════════════════════════════════
// Admin endpoints
// ═══════════════════════════════════════════════

func (h *FantasyHandler) AdminGetTournaments(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, year,
		       to_char(start_date,'YYYY-MM-DD'), to_char(end_date,'YYYY-MM-DD'), status
		FROM fantasy_tournaments
		ORDER BY year DESC, start_date`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch tournaments")
	}
	defer rows.Close()
	out := []models.FantasyTournament{}
	for rows.Next() {
		var t models.FantasyTournament
		rows.Scan(&t.ID, &t.Name, &t.Year, &t.StartDate, &t.EndDate, &t.Status)
		out = append(out, t)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *FantasyHandler) AdminCreateTournament(c echo.Context) error {
	var req struct {
		Name      string `json:"name"`
		Year      int    `json:"year"`
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
		Status    string `json:"status"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || req.Year == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "name and year required")
	}
	if req.Status == "" {
		req.Status = "draft"
	}
	var t models.FantasyTournament
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO fantasy_tournaments (name, year, start_date, end_date, status)
		VALUES ($1, $2, NULLIF($3,'')::date, NULLIF($4,'')::date, $5)
		RETURNING id, name, year,
		          to_char(start_date,'YYYY-MM-DD'), to_char(end_date,'YYYY-MM-DD'), status`,
		req.Name, req.Year, req.StartDate, req.EndDate, req.Status,
	).Scan(&t.ID, &t.Name, &t.Year, &t.StartDate, &t.EndDate, &t.Status)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create tournament")
	}
	return c.JSON(http.StatusCreated, t)
}

func (h *FantasyHandler) AdminUpdateTournament(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name      string `json:"name"`
		Year      int    `json:"year"`
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
		Status    string `json:"status"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	var t models.FantasyTournament
	err := h.DB.QueryRow(c.Request().Context(), `
		UPDATE fantasy_tournaments
		SET name=$1, year=$2, start_date=NULLIF($3,'')::date, end_date=NULLIF($4,'')::date, status=$5
		WHERE id=$6
		RETURNING id, name, year,
		          to_char(start_date,'YYYY-MM-DD'), to_char(end_date,'YYYY-MM-DD'), status`,
		req.Name, req.Year, req.StartDate, req.EndDate, req.Status, id,
	).Scan(&t.ID, &t.Name, &t.Year, &t.StartDate, &t.EndDate, &t.Status)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "tournament not found")
	}
	return c.JSON(http.StatusOK, t)
}

func (h *FantasyHandler) AdminDeleteTournament(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM fantasy_tournaments WHERE id=$1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete tournament")
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *FantasyHandler) AdminGetPlayers(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, name, gender, country FROM fantasy_players ORDER BY gender, name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch players")
	}
	defer rows.Close()
	out := []models.FantasyPlayer{}
	for rows.Next() {
		var p models.FantasyPlayer
		rows.Scan(&p.ID, &p.Name, &p.Gender, &p.Country)
		out = append(out, p)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *FantasyHandler) AdminCreatePlayer(c echo.Context) error {
	var req struct {
		Name    string `json:"name"`
		Gender  string `json:"gender"`
		Country string `json:"country"`
	}
	if err := c.Bind(&req); err != nil || req.Name == "" || (req.Gender != "M" && req.Gender != "W") {
		return echo.NewHTTPError(http.StatusBadRequest, "name and gender (M/W) required")
	}
	var p models.FantasyPlayer
	err := h.DB.QueryRow(c.Request().Context(),
		`INSERT INTO fantasy_players (name, gender, country) VALUES ($1,$2,$3)
		 RETURNING id, name, gender, country`,
		req.Name, req.Gender, req.Country,
	).Scan(&p.ID, &p.Name, &p.Gender, &p.Country)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not create player")
	}
	return c.JSON(http.StatusCreated, p)
}

func (h *FantasyHandler) AdminUpdatePlayer(c echo.Context) error {
	id := c.Param("id")
	var req struct {
		Name    string `json:"name"`
		Gender  string `json:"gender"`
		Country string `json:"country"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	var p models.FantasyPlayer
	err := h.DB.QueryRow(c.Request().Context(),
		`UPDATE fantasy_players SET name=$1, gender=$2, country=$3 WHERE id=$4
		 RETURNING id, name, gender, country`,
		req.Name, req.Gender, req.Country, id,
	).Scan(&p.ID, &p.Name, &p.Gender, &p.Country)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "player not found")
	}
	return c.JSON(http.StatusOK, p)
}

func (h *FantasyHandler) AdminDeletePlayer(c echo.Context) error {
	id := c.Param("id")
	_, err := h.DB.Exec(c.Request().Context(), `DELETE FROM fantasy_players WHERE id=$1`, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete player")
	}
	return c.NoContent(http.StatusNoContent)
}

// AdminSaveResult upserts a player result for a tournament.
func (h *FantasyHandler) AdminSaveResult(c echo.Context) error {
	var req struct {
		PlayerID     string  `json:"player_id"`
		TournamentID string  `json:"tournament_id"`
		Result       string  `json:"result"`
		PrizeMoney   float64 `json:"prize_money"`
	}
	if err := c.Bind(&req); err != nil || req.PlayerID == "" || req.TournamentID == "" || req.Result == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "player_id, tournament_id, result required")
	}
	var r models.FantasyResult
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO fantasy_player_results (player_id, tournament_id, result, prize_money)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (player_id, tournament_id)
		DO UPDATE SET result=EXCLUDED.result, prize_money=EXCLUDED.prize_money
		RETURNING id, player_id, tournament_id, result, prize_money`,
		req.PlayerID, req.TournamentID, req.Result, req.PrizeMoney,
	).Scan(&r.ID, &r.PlayerID, &r.TournamentID, &r.Result, &r.PrizeMoney)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not save result")
	}
	return c.JSON(http.StatusOK, r)
}

func (h *FantasyHandler) AdminDeleteResult(c echo.Context) error {
	tid := c.Param("tid")
	pid := c.Param("pid")
	_, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM fantasy_player_results WHERE tournament_id=$1 AND player_id=$2`, tid, pid)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not delete result")
	}
	return c.NoContent(http.StatusNoContent)
}

// AdminGetParticipants returns all pool participants with their pick counts and entry status.
func (h *FantasyHandler) AdminGetParticipants(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT par.id, par.user_id,
		       u.first_name || ' ' || u.last_name AS name,
		       par.entry_paid,
		       to_char(par.joined_at, 'YYYY-MM-DD')
		FROM fantasy_participants par
		JOIN users u ON u.id = par.user_id
		ORDER BY name`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch participants")
	}
	defer rows.Close()
	out := []models.FantasyParticipant{}
	for rows.Next() {
		var p models.FantasyParticipant
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.EntryPaid, &p.JoinedAt)
		out = append(out, p)
	}
	return c.JSON(http.StatusOK, out)
}

func (h *FantasyHandler) AdminUpdateParticipantPaid(c echo.Context) error {
	userID := c.Param("userId")
	var req struct {
		Paid bool `json:"paid"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	_, err := h.DB.Exec(c.Request().Context(),
		`UPDATE fantasy_participants SET entry_paid=$1 WHERE user_id=$2`, req.Paid, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not update")
	}
	return c.JSON(http.StatusOK, map[string]bool{"paid": req.Paid})
}

// AdminGetPickPopularity returns how many participants picked each player per tournament.
func (h *FantasyHandler) AdminGetPickPopularity(c echo.Context) error {
	tid := c.Param("tid")
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT pl.id, pl.name, pl.gender, fp.pick_slot, COUNT(fp.id)::int AS cnt
		FROM fantasy_picks fp
		JOIN fantasy_players pl ON pl.id = fp.player_id
		WHERE fp.tournament_id = $1
		GROUP BY pl.id, pl.name, pl.gender, fp.pick_slot
		ORDER BY cnt DESC, pl.name`, tid)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not fetch popularity")
	}
	defer rows.Close()

	type PopRow struct {
		PlayerID   string `json:"player_id"`
		PlayerName string `json:"player_name"`
		Gender     string `json:"gender"`
		PickSlot   string `json:"pick_slot"`
		Count      int    `json:"count"`
	}
	out := []PopRow{}
	for rows.Next() {
		var row PopRow
		rows.Scan(&row.PlayerID, &row.PlayerName, &row.Gender, &row.PickSlot, &row.Count)
		out = append(out, row)
	}
	return c.JSON(http.StatusOK, out)
}

// suppress unused import warning
var _ = context.Background
