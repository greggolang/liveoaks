package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/textproto"
	"time"

	"github.com/emersion/go-imap"
	imapclient "github.com/emersion/go-imap/client"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// MailFilterHandler exposes CRUD for per-mailbox IMAP filter rules and houses the
// runner that applies them. It lives in package handlers so it can reuse the
// unexported imapConnect / resolveFolder and the same move/delete/mark IMAP
// sequences used by IMAPHandler.MessageAction.
type MailFilterHandler struct {
	DB *pgxpool.Pool
}

type mailFilterRule struct {
	ID           string     `json:"id"`
	AccountID    string     `json:"account_id"`
	Name         string     `json:"name"`
	Enabled      bool       `json:"enabled"`
	MatchField   string     `json:"match_field"`
	Pattern      string     `json:"pattern"`
	SourceFolder string     `json:"source_folder"`
	Action       string     `json:"action"`
	DestFolder   string     `json:"dest_folder"`
	MatchedCount int        `json:"matched_count"`
	LastRunAt    *time.Time `json:"last_run_at"`
	LastError    string     `json:"last_error"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func validMatchField(s string) bool {
	switch s {
	case "from", "to_cc", "subject", "body":
		return true
	}
	return false
}

func validAction(s string) bool {
	switch s {
	case "move", "delete", "mark_read":
		return true
	}
	return false
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

// List returns every rule for one mail account.
func (h *MailFilterHandler) List(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT id, account_id, name, enabled, match_field, pattern,
		       source_folder, action, dest_folder, matched_count,
		       last_run_at, last_error, created_at, updated_at
		FROM mail_filter_rules
		WHERE account_id = $1
		ORDER BY created_at
	`, c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	defer rows.Close()

	rules := []mailFilterRule{}
	for rows.Next() {
		var r mailFilterRule
		if err := rows.Scan(
			&r.ID, &r.AccountID, &r.Name, &r.Enabled, &r.MatchField, &r.Pattern,
			&r.SourceFolder, &r.Action, &r.DestFolder, &r.MatchedCount,
			&r.LastRunAt, &r.LastError, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
		}
		rules = append(rules, r)
	}
	return c.JSON(http.StatusOK, rules)
}

type filterRuleInput struct {
	Name         string `json:"name"`
	Enabled      bool   `json:"enabled"`
	MatchField   string `json:"match_field"`
	Pattern      string `json:"pattern"`
	SourceFolder string `json:"source_folder"`
	Action       string `json:"action"`
	DestFolder   string `json:"dest_folder"`
}

// validate normalizes and checks an incoming rule, returning a user-facing error.
func (in *filterRuleInput) validate() error {
	if !validMatchField(in.MatchField) {
		return fmt.Errorf("match_field must be from, to_cc, subject or body")
	}
	if !validAction(in.Action) {
		return fmt.Errorf("action must be move, delete or mark_read")
	}
	if in.Pattern == "" {
		return fmt.Errorf("pattern is required")
	}
	if in.SourceFolder == "" {
		in.SourceFolder = "INBOX"
	}
	if in.Action == "move" && in.DestFolder == "" {
		return fmt.Errorf("a destination folder is required for the move action")
	}
	if in.Action != "move" {
		in.DestFolder = ""
	}
	return nil
}

// Create adds a rule to one mail account.
func (h *MailFilterHandler) Create(c echo.Context) error {
	var in filterRuleInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if err := in.validate(); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	var id string
	err := h.DB.QueryRow(c.Request().Context(), `
		INSERT INTO mail_filter_rules
		    (account_id, name, enabled, match_field, pattern, source_folder, action, dest_folder)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`, c.Param("id"), in.Name, in.Enabled, in.MatchField, in.Pattern,
		in.SourceFolder, in.Action, in.DestFolder).Scan(&id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]string{"id": id})
}

// Update edits a rule by its own id.
func (h *MailFilterHandler) Update(c echo.Context) error {
	var in filterRuleInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if err := in.validate(); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	ct, err := h.DB.Exec(c.Request().Context(), `
		UPDATE mail_filter_rules
		SET name = $1, enabled = $2, match_field = $3, pattern = $4,
		    source_folder = $5, action = $6, dest_folder = $7, updated_at = NOW()
		WHERE id = $8
	`, in.Name, in.Enabled, in.MatchField, in.Pattern,
		in.SourceFolder, in.Action, in.DestFolder, c.Param("fid"))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	if ct.RowsAffected() == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "rule not found")
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete removes a rule by its own id.
func (h *MailFilterHandler) Delete(c echo.Context) error {
	if _, err := h.DB.Exec(c.Request().Context(),
		`DELETE FROM mail_filter_rules WHERE id = $1`, c.Param("fid")); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": err.Error()})
	}
	return c.NoContent(http.StatusNoContent)
}

// RunNow applies every enabled rule for one account immediately and reports how
// many messages were acted on plus any per-rule errors.
func (h *MailFilterHandler) RunNow(c echo.Context) error {
	matched, errs := h.runAccountFilters(c.Request().Context(), c.Param("id"))
	return c.JSON(http.StatusOK, map[string]interface{}{"matched": matched, "errors": errs})
}

// ─── runner ──────────────────────────────────────────────────────────────────

// accountCreds mirrors MailHandler.mailboxCreds but without an echo.Context, so
// the background runner can look up a mailbox's IMAP login. Empty address or
// password means the account can't be logged into and should be skipped.
func (h *MailFilterHandler) accountCreds(ctx context.Context, id string) (address, password, host string) {
	h.DB.QueryRow(ctx,
		`SELECT address, imap_password FROM mail_accounts WHERE id = $1 AND active = true`,
		id).Scan(&address, &password)
	if address == "" || password == "" {
		return "", "", ""
	}
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'imap_host'`).Scan(&host)
	if host == "" {
		host = "mail.webgoserver.com"
	}
	return address, password, host
}

// runAccountFilters logs into one mailbox and applies each enabled rule. It is
// best-effort: a failure on one rule or folder is recorded in last_error and the
// remaining rules still run. Returns the total messages acted on and any errors.
func (h *MailFilterHandler) runAccountFilters(ctx context.Context, accountID string) (int, []string) {
	var errs []string

	rows, err := h.DB.Query(ctx, `
		SELECT id, match_field, pattern, source_folder, action, dest_folder
		FROM mail_filter_rules
		WHERE account_id = $1 AND enabled = true
		ORDER BY source_folder, created_at
	`, accountID)
	if err != nil {
		return 0, []string{err.Error()}
	}
	type rule struct {
		id, field, pattern, src, action, dest string
	}
	var rules []rule
	for rows.Next() {
		var r rule
		if err := rows.Scan(&r.id, &r.field, &r.pattern, &r.src, &r.action, &r.dest); err == nil {
			rules = append(rules, r)
		}
	}
	rows.Close()
	if len(rules) == 0 {
		return 0, nil
	}

	address, password, host := h.accountCreds(ctx, accountID)
	if address == "" {
		return 0, nil // no usable credentials — silently skip
	}

	ic, err := imapConnect(host, address, password)
	if err != nil {
		// One connect failure shouldn't silently swallow the rules — surface it on
		// every rule so the admin can see why nothing ran.
		for _, r := range rules {
			h.recordRun(ctx, r.id, 0, err.Error())
		}
		return 0, []string{fmt.Sprintf("%s: %v", address, err)}
	}
	defer ic.Logout()

	total := 0
	selected := "" // currently selected folder, to skip redundant Selects

	for _, r := range rules {
		folder := resolveFolder(ic, r.src)
		if folder != selected {
			if _, err := ic.Select(folder, false); err != nil {
				msg := "source folder not found: " + r.src
				h.recordRun(ctx, r.id, 0, msg)
				errs = append(errs, msg)
				selected = ""
				continue
			}
			selected = folder
		}

		uids, err := ic.UidSearch(searchCriteria(r.field, r.pattern))
		if err != nil {
			h.recordRun(ctx, r.id, 0, "search failed: "+err.Error())
			errs = append(errs, err.Error())
			continue
		}
		if len(uids) == 0 {
			h.recordRun(ctx, r.id, 0, "")
			continue
		}

		if err := applyAction(ic, folder, r.action, r.dest, uids); err != nil {
			h.recordRun(ctx, r.id, 0, err.Error())
			errs = append(errs, err.Error())
			// The mailbox state may have changed; force a re-Select next loop.
			selected = ""
			continue
		}

		h.recordRun(ctx, r.id, len(uids), "")
		total += len(uids)
		// move/delete expunge from the current folder; re-Select before the next rule.
		if r.action == "move" || r.action == "delete" {
			selected = ""
		}
	}

	return total, errs
}

// recordRun updates a rule's running stats after it is evaluated.
func (h *MailFilterHandler) recordRun(ctx context.Context, ruleID string, matched int, lastErr string) {
	h.DB.Exec(ctx, `
		UPDATE mail_filter_rules
		SET matched_count = matched_count + $1, last_run_at = NOW(), last_error = $2
		WHERE id = $3
	`, matched, lastErr, ruleID)
}

// searchCriteria builds an IMAP SEARCH for one match field + pattern. IMAP
// HEADER / BODY searches are case-insensitive substring matches by spec, which
// matches the "contains" semantics of the original Gmail cleaner rules.
func searchCriteria(field, pattern string) *imap.SearchCriteria {
	crit := imap.NewSearchCriteria()
	switch field {
	case "from":
		crit.Header = textproto.MIMEHeader{"From": {pattern}}
	case "subject":
		crit.Header = textproto.MIMEHeader{"Subject": {pattern}}
	case "body":
		crit.Body = []string{pattern}
	case "to_cc":
		// No single header search covers both To and Cc, so OR two header searches.
		to := imap.NewSearchCriteria()
		to.Header = textproto.MIMEHeader{"To": {pattern}}
		cc := imap.NewSearchCriteria()
		cc.Header = textproto.MIMEHeader{"Cc": {pattern}}
		crit.Or = [][2]*imap.SearchCriteria{{to, cc}}
	}
	return crit
}

// applyAction performs the rule's action against the matched UIDs in the
// currently selected source folder, reusing the same IMAP sequence as
// IMAPHandler.MessageAction (copy → mark deleted → expunge for move/delete,
// add \Seen for mark_read).
func applyAction(ic *imapclient.Client, sourceFolder, action, destFolder string, uids []uint32) error {
	seqset := new(imap.SeqSet)
	seqset.AddNum(uids...)

	switch action {
	case "mark_read":
		return ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.SeenFlag}, nil)
	case "delete":
		trash := resolveFolder(ic, "Trash")
		if sourceFolder != trash {
			ic.Create(trash)
			if err := ic.UidCopy(seqset, trash); err != nil {
				return fmt.Errorf("copy to Trash failed: %w", err)
			}
		}
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
		return ic.Expunge(nil)
	case "move":
		dest := resolveFolder(ic, destFolder)
		ic.Create(dest) // ensure it exists; ignores "already exists"
		if err := ic.UidCopy(seqset, dest); err != nil {
			return fmt.Errorf("move to %s failed: %w", destFolder, err)
		}
		ic.UidStore(seqset, imap.FormatFlagsOp(imap.AddFlags, true), []interface{}{imap.DeletedFlag}, nil)
		return ic.Expunge(nil)
	}
	return fmt.Errorf("unknown action %q", action)
}

// ─── scheduler ───────────────────────────────────────────────────────────────

// MailFilterService runs every account's filter rules on a fixed interval.
type MailFilterService struct {
	DB *pgxpool.Pool
}

// Start launches the 5-minute filter runner. It mirrors reminder.Service.Start.
func (s *MailFilterService) Start(ctx context.Context) {
	h := &MailFilterHandler{DB: s.DB}
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		s.runAll(ctx, h)
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.runAll(ctx, h)
			}
		}
	}()
}

// runAll applies filters for every active mailbox that has a stored IMAP
// password. Each account is isolated so one failure never aborts the rest.
func (s *MailFilterService) runAll(ctx context.Context, h *MailFilterHandler) {
	rows, err := s.DB.Query(ctx,
		`SELECT id FROM mail_accounts WHERE active = true AND imap_password <> ''`)
	if err != nil {
		log.Printf("mailfilter: list accounts: %v", err)
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()

	for _, id := range ids {
		func(accountID string) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("mailfilter: account %s panicked: %v", accountID, r)
				}
			}()
			if n, errs := h.runAccountFilters(ctx, accountID); n > 0 || len(errs) > 0 {
				log.Printf("mailfilter: account %s acted on %d messages, %d errors", accountID, n, len(errs))
			}
		}(id)
	}
}
