package handlers

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/greggolang/liveoaks/internal/ai"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

// AIHandler hosts every Claude-powered feature. All calls run server-side using
// the key stored in settings (see AdminHandler.GetAIConfig); nothing here is
// reachable from the browser without going through these endpoints.
type AIHandler struct {
	DB         *pgxpool.Pool
	AI         *ai.Client
	UploadDir  string
	FrontendFS fs.FS // fallback source for the embedded bylaws.pdf
}

// aiUnavailable returns a friendly 503 when AI is off or unconfigured.
func aiUnavailable(c echo.Context, err error) error {
	if err == ai.ErrDisabled {
		return echo.NewHTTPError(http.StatusServiceUnavailable,
			"AI features are turned off. An admin can enable them in Settings → AI Assistant.")
	}
	return echo.NewHTTPError(http.StatusBadGateway, "AI request failed: "+err.Error())
}

// expenseCategories is the canonical P&L category list (mirrors the treasurer's
// dropdown in AdminReceipts.tsx). Used for the receipt-categorization schema.
var expenseCategories = []struct{ Value, Label string }{
	{"grounds", "Grounds & Maintenance"},
	{"insurance", "Insurance"},
	{"tennis_pro", "Tennis Pro"},
	{"bookkeeping", "Bookkeeping & Accounting"},
	{"tax", "Tax & Licenses"},
	{"balls", "Balls"},
	{"utilities", "Utilities"},
	{"drinks", "Drinks"},
	{"digital", "Digital Services"},
	{"party", "Party & Events"},
	{"court_system", "Court Reservation System"},
	{"office", "Office Supplies"},
	{"repairs", "General Repairs"},
	{"clubhouse", "Clubhouse Supplies"},
	{"banking", "Banking & Admin"},
	{"other", "Other"},
}

// ============================================================================
// Feature 1: "Ask the Club" — RAG assistant over club content
// ============================================================================

// readBylawsPDF returns the base64 of the bylaws PDF (uploaded copy preferred,
// otherwise the binary's embedded fallback). ok is false if neither exists.
func (h *AIHandler) readBylawsPDF() (b64 string, ok bool) {
	if h.UploadDir != "" {
		if data, err := os.ReadFile(filepath.Join(h.UploadDir, "bylaws.pdf")); err == nil && len(data) > 0 {
			return base64.StdEncoding.EncodeToString(data), true
		}
	}
	if h.FrontendFS != nil {
		if f, err := h.FrontendFS.Open("bylaws.pdf"); err == nil {
			defer f.Close()
			if data, err := io.ReadAll(f); err == nil && len(data) > 0 {
				return base64.StdEncoding.EncodeToString(data), true
			}
		}
	}
	return "", false
}

// buildCorpusText assembles the non-PDF club reference material (announcements,
// document index, and the public site/booking policy content) into one block.
func (h *AIHandler) buildCorpusText(ctx context.Context) string {
	var b strings.Builder

	// Public site content — booking rules, cancellation policy, guest policy, etc.
	var siteContent string
	h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'public_site_content'`).Scan(&siteContent)
	if strings.TrimSpace(siteContent) != "" {
		b.WriteString("## Club website content (booking, guest & policy info)\n")
		b.WriteString(siteContent)
		b.WriteString("\n\n")
	}

	// Booking settings the assistant is commonly asked about.
	settingKeys := map[string]string{
		"booking_max_days_ahead": "How many days ahead a court can be booked",
		"booking_max_per_day":    "Max bookings per member per day",
		"guest_fee":              "Guest fee (USD)",
	}
	var settingsLines []string
	for k, label := range settingKeys {
		var v string
		h.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = $1`, k).Scan(&v)
		if v != "" {
			settingsLines = append(settingsLines, fmt.Sprintf("- %s: %s", label, v))
		}
	}
	if len(settingsLines) > 0 {
		b.WriteString("## Current booking settings\n")
		b.WriteString(strings.Join(settingsLines, "\n"))
		b.WriteString("\n\n")
	}

	// Recent announcements.
	if rows, err := h.DB.Query(ctx,
		`SELECT title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 25`); err == nil {
		defer rows.Close()
		var lines []string
		for rows.Next() {
			var title, body string
			var created time.Time
			if rows.Scan(&title, &body, &created) == nil {
				lines = append(lines, fmt.Sprintf("### %s (%s)\n%s", title, created.Format("Jan 2, 2006"), body))
			}
		}
		if len(lines) > 0 {
			b.WriteString("## Recent announcements\n")
			b.WriteString(strings.Join(lines, "\n\n"))
			b.WriteString("\n\n")
		}
	}

	// Document index — so the assistant can point members to the right file.
	if rows, err := h.DB.Query(ctx,
		`SELECT title, category FROM documents ORDER BY created_at DESC LIMIT 100`); err == nil {
		defer rows.Close()
		var lines []string
		for rows.Next() {
			var title, category string
			if rows.Scan(&title, &category) == nil {
				lines = append(lines, fmt.Sprintf("- \"%s\" (%s) — found on the Documents page", title, category))
			}
		}
		if len(lines) > 0 {
			b.WriteString("## Documents available to members\n")
			b.WriteString(strings.Join(lines, "\n"))
			b.WriteString("\n\n")
		}
	}

	return b.String()
}

const askClubSystem = `You are the Liveoaks Tennis Club assistant. You answer members' questions ONLY from the club materials provided (the bylaws PDF, the club website content, current booking settings, recent announcements, and the document index).

Rules:
- Answer concisely and warmly, like a helpful club volunteer.
- Use ONLY the provided materials. Do NOT invent policies, fees, or rules.
- If the materials don't cover the question, say so plainly and suggest contacting the board (do not guess).
- When a relevant document exists in the index, tell the member it's on the Documents page.
- Quote specific numbers (guest fees, booking limits, days ahead) when they appear in the materials.
- Keep answers to a few sentences unless the member asks for detail.`

// AskClub answers a member question using the club corpus, with the fixed
// corpus prompt-cached so repeat questions are cheap.
func (h *AIHandler) AskClub(c echo.Context) error {
	ctx := c.Request().Context()
	var req struct {
		Question string `json:"question"`
		History  []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"history"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	req.Question = strings.TrimSpace(req.Question)
	if req.Question == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "question is required")
	}

	// Build the fixed corpus as the first user turn (cached), followed by a
	// short assistant acknowledgement, then the running conversation.
	corpus := []ai.Block{}
	if b64, ok := h.readBylawsPDF(); ok {
		corpus = append(corpus, ai.DocumentBlock(b64))
	}
	corpusText := h.buildCorpusText(ctx)
	if corpusText == "" {
		corpusText = "(No additional club materials are on file yet.)"
	}
	corpus = append(corpus, ai.CachedText("# Liveoaks club reference materials\n\n"+corpusText))

	messages := []ai.Message{
		{Role: "user", Content: corpus},
		{Role: "assistant", Content: []ai.Block{ai.Text("Understood — I'll answer using only the Liveoaks club materials above.")}},
	}
	// Replay prior conversation turns (text only), capped to keep prompts small.
	hist := req.History
	if len(hist) > 12 {
		hist = hist[len(hist)-12:]
	}
	for _, m := range hist {
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		messages = append(messages, ai.Message{Role: role, Content: []ai.Block{ai.Text(m.Content)}})
	}
	messages = append(messages, ai.UserText(req.Question))

	answer, err := h.AI.Complete(ctx, ai.Request{
		System:    []ai.Block{ai.CachedText(askClubSystem)},
		Messages:  messages,
		MaxTokens: 800,
	})
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, map[string]string{"answer": answer})
}

// ============================================================================
// Feature 2: Treasurer's receipt auto-categorization (vision)
// ============================================================================

// AnalyzeReceipt reads an uploaded receipt image/PDF and returns suggested
// vendor, amount, date, P&L category, and notes for the treasurer to confirm.
func (h *AIHandler) AnalyzeReceipt(c echo.Context) error {
	ctx := c.Request().Context()
	file, header, err := c.Request().FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "a receipt file is required")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 12<<20)) // 12MB cap
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "could not read file")
	}
	b64 := base64.StdEncoding.EncodeToString(data)
	ext := strings.ToLower(filepath.Ext(header.Filename))

	var fileBlock ai.Block
	switch ext {
	case ".pdf":
		fileBlock = ai.DocumentBlock(b64)
	case ".png":
		fileBlock = ai.ImageBlock("image/png", b64)
	case ".jpg", ".jpeg":
		fileBlock = ai.ImageBlock("image/jpeg", b64)
	case ".webp":
		fileBlock = ai.ImageBlock("image/webp", b64)
	case ".gif":
		fileBlock = ai.ImageBlock("image/gif", b64)
	default:
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported file type (use PDF, JPG, PNG, WEBP, or GIF)")
	}

	// Build the category list for the prompt + schema enum.
	var catLines []string
	var catEnum []string
	for _, cat := range expenseCategories {
		catLines = append(catLines, fmt.Sprintf("- %s: %s", cat.Value, cat.Label))
		catEnum = append(catEnum, `"`+cat.Value+`"`)
	}

	today := time.Now().Format("2006-01-02")
	prompt := fmt.Sprintf(`Read this receipt or invoice for a tennis club and extract the fields below.

Pick the single best P&L category from this list (use the value on the left):
%s

Today's date is %s; interpret any relative or 2-digit year sensibly and never return a future date.
If a field is not visible, leave it empty (empty string for text, null for amount). Do not guess the amount.`,
		strings.Join(catLines, "\n"), today)

	schema := fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"vendor": {"type": "string", "description": "Merchant/vendor name, used as the receipt title"},
			"amount": {"type": ["number", "null"], "description": "Total amount paid in USD"},
			"date": {"type": "string", "description": "Receipt date as YYYY-MM-DD, or empty if not visible"},
			"category": {"type": "string", "enum": [%s], "description": "Best-fit P&L category value"},
			"notes": {"type": "string", "description": "Short note: what was purchased (a few words)"},
			"confidence": {"type": "string", "enum": ["high", "medium", "low"]}
		},
		"required": ["vendor", "amount", "date", "category", "notes", "confidence"]
	}`, strings.Join(catEnum, ", "))

	var result struct {
		Vendor     string   `json:"vendor"`
		Amount     *float64 `json:"amount"`
		Date       string   `json:"date"`
		Category   string   `json:"category"`
		Notes      string   `json:"notes"`
		Confidence string   `json:"confidence"`
	}
	err = h.AI.Structured(ctx, ai.Request{
		System:    []ai.Block{ai.Text("You are a meticulous bookkeeping assistant for a tennis club. You extract receipt data precisely and never fabricate figures.")},
		Messages:  []ai.Message{{Role: "user", Content: []ai.Block{fileBlock, ai.Text(prompt)}}},
		Schema:    []byte(schema),
		MaxTokens: 600,
	}, &result)
	if err != nil {
		return aiUnavailable(c, err)
	}

	// Normalise the amount to a 2-decimal string for the form field.
	amountStr := ""
	if result.Amount != nil {
		amountStr = fmt.Sprintf("%.2f", *result.Amount)
	}
	return c.JSON(http.StatusOK, map[string]any{
		"title":        result.Vendor,
		"amount":       amountStr,
		"receipt_date": result.Date,
		"category":     result.Category,
		"notes":        result.Notes,
		"confidence":   result.Confidence,
	})
}

// ============================================================================
// Feature 3a: Board minutes drafting from rough notes
// ============================================================================

const draftMinutesSchema = `{
	"type": "object",
	"properties": {
		"attendees_present": {"type": "string", "description": "Names of attendees present, comma-separated, or empty"},
		"attendees_absent": {"type": "string", "description": "Names noted as absent, comma-separated, or empty"},
		"treasurer_report": {"type": "string", "description": "Polished treasurer's report paragraph(s), or empty if not mentioned"},
		"old_business": {"type": "string", "description": "Polished summary of old/continuing business, or empty"},
		"new_business": {"type": "string", "description": "Polished summary of new business, or empty"},
		"action_items": {"type": "string", "description": "Action items as a list, one per line, with owner and item; empty if none"},
		"additional_notes": {"type": "string", "description": "Any other relevant notes, or empty"}
	},
	"required": ["attendees_present", "attendees_absent", "treasurer_report", "old_business", "new_business", "action_items", "additional_notes"]
}`

// DraftMinutes turns a board member's rough bullet notes into polished,
// structured minutes fields and extracts action items. The treasurer reviews
// and edits before saving — nothing is persisted here.
func (h *AIHandler) DraftMinutes(c echo.Context) error {
	ctx := c.Request().Context()
	var req struct {
		Notes string `json:"notes"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Notes) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "notes are required")
	}

	var out struct {
		AttendeesPresent string `json:"attendees_present"`
		AttendeesAbsent  string `json:"attendees_absent"`
		TreasurerReport  string `json:"treasurer_report"`
		OldBusiness      string `json:"old_business"`
		NewBusiness      string `json:"new_business"`
		ActionItems      string `json:"action_items"`
		AdditionalNotes  string `json:"additional_notes"`
	}
	err := h.AI.Structured(ctx, ai.Request{
		System: []ai.Block{ai.Text(`You polish rough board-meeting notes for the Liveoaks Tennis Club into clear, professional minutes. Organize the content into the provided fields. Keep the club's facts exactly as given — never invent attendees, figures, decisions, or action items that aren't in the notes. Use complete, neutral, past-tense sentences. Leave a field empty if the notes don't cover it.`)},
		Messages: []ai.Message{ai.UserText("Here are the rough notes from the board meeting:\n\n" + req.Notes +
			"\n\nOrganize these into polished minutes fields and extract clear action items (owner — task).")},
		Schema:    []byte(draftMinutesSchema),
		MaxTokens: 1500,
	}, &out)
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, out)
}

// ============================================================================
// Feature 3b: "✨ Improve" for announcements / broadcast / emails
// ============================================================================

const improveTextSchema = `{
	"type": "object",
	"properties": {
		"subject": {"type": "string", "description": "Improved subject/title line; empty string if a subject was not relevant"},
		"body": {"type": "string", "description": "Improved message body"}
	},
	"required": ["subject", "body"]
}`

// ImproveText cleans up the tone, clarity, and subject line of a draft
// announcement or broadcast email. Returns the improved subject + body for the
// composer to accept or discard.
func (h *AIHandler) ImproveText(c echo.Context) error {
	ctx := c.Request().Context()
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
		Kind    string `json:"kind"` // "announcement" | "broadcast" | "email"
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Body) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "body text is required")
	}
	kind := req.Kind
	switch kind {
	case "announcement", "broadcast", "email":
	default:
		kind = "message"
	}

	var out struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	err := h.AI.Structured(ctx, ai.Request{
		System: []ai.Block{ai.Text(`You are an editor for a friendly community tennis club. You improve the clarity, warmth, and professionalism of member communications without changing their meaning or facts. Preserve any dates, times, names, prices, and links exactly. Keep it concise and avoid corporate jargon. Match the club's welcoming tone.`)},
		Messages: []ai.Message{ai.UserText(fmt.Sprintf(
			"Improve this %s.\n\nCurrent subject/title: %s\n\nCurrent body:\n%s\n\nReturn a tightened subject and an improved body. If no subject applies, return an empty subject.",
			kind, req.Subject, req.Body))},
		Schema:    []byte(improveTextSchema),
		MaxTokens: 1200,
	}, &out)
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, out)
}

// ============================================================================
// Feature 4: Feedback triage digest
// ============================================================================

const feedbackDigestSchema = `{
	"type": "object",
	"properties": {
		"summary": {"type": "string", "description": "One or two sentence overview for the board"},
		"themes": {
			"type": "array",
			"description": "Clusters of related feedback items",
			"items": {
				"type": "object",
				"properties": {
					"title": {"type": "string", "description": "Short theme title"},
					"type": {"type": "string", "enum": ["bug", "idea", "mixed"]},
					"count": {"type": "integer", "description": "Number of items in this theme"},
					"item_numbers": {"type": "array", "items": {"type": "integer"}, "description": "Feedback #numbers in this theme"},
					"summary": {"type": "string", "description": "What members are saying"},
					"suggestion": {"type": "string", "description": "Recommended next step for the board"},
					"priority": {"type": "string", "enum": ["high", "medium", "low"]}
				},
				"required": ["title", "type", "count", "item_numbers", "summary", "suggestion", "priority"]
			}
		}
	},
	"required": ["summary", "themes"]
}`

// FeedbackDigest categorizes, deduplicates, and summarizes open feedback into a
// board-ready digest. Reads the feedback table; persists nothing.
func (h *AIHandler) FeedbackDigest(c echo.Context) error {
	ctx := c.Request().Context()

	rows, err := h.DB.Query(ctx,
		`SELECT number, type, COALESCE(page, ''), message
		 FROM feedback
		 WHERE status NOT IN ('done', 'declined')
		 ORDER BY created_at DESC
		 LIMIT 300`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load feedback")
	}
	defer rows.Close()
	var lines []string
	var n int
	for rows.Next() {
		var num int
		var ftype, page, message string
		if rows.Scan(&num, &ftype, &page, &message) == nil {
			loc := ""
			if page != "" {
				loc = " [" + page + "]"
			}
			lines = append(lines, fmt.Sprintf("#%d (%s)%s: %s", num, ftype, loc, message))
			n++
		}
	}
	if n == 0 {
		return c.JSON(http.StatusOK, map[string]any{
			"summary": "No open feedback to triage.",
			"themes":  []any{},
		})
	}

	var out any
	err = h.AI.Structured(ctx, ai.Request{
		System: []ai.Block{ai.Text(`You triage member feedback for a tennis club's website. Group related items into themes, merging duplicates ("3 people reported the same thing"). Separate bugs from feature ideas, but a theme may be "mixed" if it spans both. Be accurate about which #numbers belong to each theme, prioritize by member impact, and give the board a concrete next step per theme. Do not invent items.`)},
		Messages: []ai.Message{ai.UserText(fmt.Sprintf(
			"Triage these %d open feedback items into a board-ready digest:\n\n%s", n, strings.Join(lines, "\n")))},
		Schema:    []byte(feedbackDigestSchema),
		MaxTokens: 2000,
	}, &out)
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, out)
}

// ============================================================================
// Nice-to-have: natural-language match score entry
// ============================================================================

const parseScoreSchema = `{
	"type": "object",
	"properties": {
		"match_type": {"type": "string", "enum": ["singles", "doubles"]},
		"teams": {
			"type": "array",
			"description": "Exactly two sides. Side 0 is the reporter's side. Each side lists its players.",
			"items": {
				"type": "array",
				"items": {
					"type": "object",
					"properties": {
						"name": {"type": "string"},
						"user_id": {"type": ["string", "null"], "description": "Matched member id from the roster, or null for a guest/unknown"},
						"is_guest": {"type": "boolean"}
					},
					"required": ["name", "user_id", "is_guest"]
				}
			}
		},
		"sets": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"a": {"type": "integer", "description": "Games won by side 0 (reporter's side)"},
					"b": {"type": "integer", "description": "Games won by side 1"},
					"tba": {"type": ["integer", "null"], "description": "Tiebreak points for side 0 in a 7-6 set, else null"},
					"tbb": {"type": ["integer", "null"], "description": "Tiebreak points for side 1 in a 7-6 set, else null"}
				},
				"required": ["a", "b", "tba", "tbb"]
			}
		},
		"winner_side": {"type": "integer", "enum": [1, 2], "description": "1 if side 0 won, 2 if side 1 won"},
		"confidence": {"type": "string", "enum": ["high", "medium", "low"]},
		"notes": {"type": "string", "description": "Any caveat about the parse, or empty"}
	},
	"required": ["match_type", "teams", "sets", "winner_side", "confidence", "notes"]
}`

// ParseScore turns a free-text score description ("beat Mark 6-4 6-3") into the
// structured shape the match scorecard review screen expects. The reporter is
// always side 0. An optional roster lets it match names to member ids.
func (h *AIHandler) ParseScore(c echo.Context) error {
	ctx := c.Request().Context()
	var req struct {
		Text   string `json:"text"`
		Roster []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"roster"`
		ReporterName string `json:"reporter_name"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if strings.TrimSpace(req.Text) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "text is required")
	}

	var roster strings.Builder
	if len(req.Roster) > 0 {
		roster.WriteString("\n\nKnown members (match names to these ids when possible):\n")
		limit := req.Roster
		if len(limit) > 200 {
			limit = limit[:200]
		}
		for _, r := range limit {
			roster.WriteString(fmt.Sprintf("- %s = %s\n", r.Name, r.ID))
		}
	}
	reporter := req.ReporterName
	if reporter == "" {
		reporter = "the reporter"
	}

	prompt := fmt.Sprintf(`Parse this tennis match description into structured sets and teams.

Description: %q

The reporter (%s) is always on side 0 (the first team). "I"/"we"/"my" refer to the reporter's side. "beat X" means the reporter's side won; "lost to X" means side 1 won. Scores are written from the reporter's perspective when phrased that way (e.g. "beat Mark 6-4 6-3" => side 0 wins 6-4, 6-3).

Set winner_side to 1 if side 0 won the match, 2 otherwise. Use null tiebreak fields unless a 7-6 set's tiebreak points are explicitly given. If a player isn't in the roster, set user_id null and is_guest true.%s`,
		req.Text, reporter, roster.String())

	var out any
	err := h.AI.Structured(ctx, ai.Request{
		System:    []ai.Block{ai.Text("You convert casual tennis score descriptions into precise structured data. Be careful about who won and the perspective of the score.")},
		Messages:  []ai.Message{ai.UserText(prompt)},
		Schema:    []byte(parseScoreSchema),
		MaxTokens: 800,
	}, &out)
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, out)
}
