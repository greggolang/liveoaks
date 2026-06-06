package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"io/fs"
	"log"
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

	// (The document list is assembled per-user in accessibleDocBlocks so it
	// respects each member's folder permissions.)

	// Previously board-answered member questions become reusable Q&A, so the
	// next person who asks gets the answer without re-escalating.
	if rows, err := h.DB.Query(ctx,
		`SELECT question, answer FROM club_questions
		 WHERE status = 'answered' AND answer IS NOT NULL
		 ORDER BY answered_at DESC LIMIT 100`); err == nil {
		defer rows.Close()
		var lines []string
		for rows.Next() {
			var q, a string
			if rows.Scan(&q, &a) == nil {
				lines = append(lines, fmt.Sprintf("Q: %s\nA: %s", q, a))
			}
		}
		if len(lines) > 0 {
			b.WriteString("## Previously answered member questions (board-approved)\n")
			b.WriteString(strings.Join(lines, "\n\n"))
			b.WriteString("\n\n")
		}
	}

	return b.String()
}

// boardRoleSet are the roles treated as "board" for assistant document access:
// a board member can search every document their roles are permitted to see.
var boardRoleSet = map[string]bool{
	"admin": true, "president": true, "vice_president": true, "secretary": true,
	"treasurer": true, "entertainment": true, "house_grounds": true,
}

// accessibleDocIDs returns the IDs (and a short title index) of documents the
// caller may search, role-aware — exactly mirroring the Documents page:
//   - admin: every document in the system;
//   - everyone else: documents in folders their roles can see (plus unfiled).
//
// A member can have the assistant read any document they could open on the
// Documents page; role-restricted folders (e.g. board minutes) stay invisible
// to members because their roles don't match the folder's required roles.
func (h *AIHandler) accessibleDocIDs(c echo.Context) (ids []string, indexText string) {
	ctx := c.Request().Context()
	role, _ := c.Get("role").(string)
	extra, _ := c.Get("extra_roles").([]string)
	roles := append([]string{role}, extra...)
	isAdmin := false
	for _, r := range roles {
		if r == "admin" {
			isAdmin = true
		}
	}

	var query string
	var args []interface{}
	if isAdmin {
		query = `SELECT id::text, title FROM documents WHERE ai_indexed = true ORDER BY created_at DESC`
	} else {
		query = `SELECT d.id::text, d.title FROM documents d
			WHERE d.ai_indexed = true
			  AND (
				d.folder_id IS NULL
				OR d.folder_id IN (
					SELECT id FROM document_folders f
					WHERE NOT EXISTS (SELECT 1 FROM document_folder_roles WHERE folder_id = f.id)
					   OR EXISTS (SELECT 1 FROM document_folder_roles WHERE folder_id = f.id AND role = ANY($1))
				)
			)
			ORDER BY d.created_at DESC`
		args = []interface{}{roles}
	}

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, ""
	}
	defer rows.Close()
	var titles []string
	for rows.Next() {
		var id, title string
		if rows.Scan(&id, &title) == nil {
			ids = append(ids, id)
			if len(titles) < 80 {
				titles = append(titles, fmt.Sprintf("- %q", title))
			}
		}
	}
	if len(titles) > 0 {
		indexText = "## Documents available to you (on the Documents page)\n" + strings.Join(titles, "\n")
		if len(ids) > len(titles) {
			indexText += fmt.Sprintf("\n- …and %d more", len(ids)-len(titles))
		}
		indexText += "\n\n"
	}
	return ids, indexText
}

// retrieveChunks does the "R" in RAG: a full-text search over the indexed
// document chunks the user may access, returning the most relevant excerpts for
// their question (only the relevant bits, so it scales to a large library).
func (h *AIHandler) retrieveChunks(ctx context.Context, docIDs []string, question string) string {
	if len(docIDs) == 0 || strings.TrimSpace(question) == "" {
		return ""
	}
	rows, err := h.DB.Query(ctx, `
		SELECT d.title, dc.content
		FROM doc_chunks dc
		JOIN documents d ON d.id = dc.document_id
		WHERE dc.document_id = ANY($1::uuid[])
		  AND dc.tsv @@ plainto_tsquery('english', $2)
		ORDER BY ts_rank(dc.tsv, plainto_tsquery('english', $2)) DESC
		LIMIT 12`, docIDs, question)
	if err != nil {
		return ""
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var title, content string
		if rows.Scan(&title, &content) == nil {
			b.WriteString("### From \"" + title + "\"\n")
			b.WriteString(strings.TrimSpace(content))
			b.WriteString("\n\n")
		}
	}
	return b.String()
}

// boardRestrictedHit reports whether the question matches indexed chunks in
// documents the caller may NOT access (i.e. board-restricted material such as
// board minutes). When true, the assistant points the member to a board member
// instead of pretending the material doesn't exist.
func (h *AIHandler) boardRestrictedHit(ctx context.Context, accessibleIDs []string, question string) bool {
	if strings.TrimSpace(question) == "" {
		return false
	}
	var hit bool
	if err := h.DB.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM doc_chunks dc
			WHERE dc.document_id <> ALL($1::uuid[])
			  AND dc.tsv @@ plainto_tsquery('english', $2)
		)`, accessibleIDs, question).Scan(&hit); err != nil {
		return false
	}
	return hit
}

// readableExt reports whether a document's text can be indexed. Text and Office
// files are extracted locally; PDFs and images are read by Claude.
func readableExt(filename string) bool {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".pdf", ".txt", ".md", ".markdown", ".csv", ".log",
		".docx", ".xlsx", ".pptx",
		".jpg", ".jpeg", ".png", ".webp", ".gif":
		return true
	}
	return false
}

// imageMediaType maps an image extension to its MIME type for Claude's vision API.
func imageMediaType(ext string) string {
	switch ext {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "image/jpeg"
	}
}

// extractOfficeText pulls the text out of a .docx/.xlsx/.pptx file. These are
// just ZIP archives of XML, so we read the relevant parts and collect their
// text nodes — no external library or AI call needed. Ordering within a part is
// preserved; formatting is dropped (fine for search).
func extractOfficeText(data []byte, ext string) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", err
	}
	var want func(name string) bool
	switch ext {
	case ".docx":
		want = func(n string) bool {
			return n == "word/document.xml" || n == "word/footnotes.xml" || n == "word/endnotes.xml" ||
				strings.HasPrefix(n, "word/header") || strings.HasPrefix(n, "word/footer")
		}
	case ".pptx":
		want = func(n string) bool {
			return strings.HasPrefix(n, "ppt/slides/slide") || strings.HasPrefix(n, "ppt/notesSlides/")
		}
	case ".xlsx":
		want = func(n string) bool {
			return n == "xl/sharedStrings.xml" || strings.HasPrefix(n, "xl/worksheets/")
		}
	default:
		return "", nil
	}
	var b strings.Builder
	for _, f := range zr.File {
		if !want(f.Name) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		dec := xml.NewDecoder(rc)
		for {
			tok, err := dec.Token()
			if err != nil {
				break
			}
			if cd, ok := tok.(xml.CharData); ok {
				if t := strings.TrimSpace(string(cd)); t != "" {
					b.WriteString(t)
					b.WriteByte(' ')
				}
			}
		}
		rc.Close()
		b.WriteString("\n")
	}
	return b.String(), nil
}

// extractText pulls a document's plain text. Text and Office files are read
// locally; PDFs and images are extracted by Claude (which reads them natively),
// so no PDF/OCR library is needed. Runs once per document at index time, not per
// question.
func (h *AIHandler) extractText(ctx context.Context, filename string) (string, error) {
	if h.UploadDir == "" {
		return "", nil
	}
	data, err := os.ReadFile(filepath.Join(h.UploadDir, "documents", filepath.Base(filename)))
	if err != nil || len(data) == 0 {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".txt", ".md", ".markdown", ".csv", ".log":
		return string(data), nil
	case ".docx", ".xlsx", ".pptx":
		return extractOfficeText(data, ext)
	case ".pdf":
		if len(data) > 12<<20 {
			return "", nil // too large to extract in one shot
		}
		return h.AI.Complete(ctx, ai.Request{
			System: []ai.Block{ai.Text("You extract text from documents verbatim. Output only the document's text content as plain text, preserving headings and order. Do not summarize, comment, or add anything.")},
			Messages: []ai.Message{{Role: "user", Content: []ai.Block{
				ai.DocumentBlock(base64.StdEncoding.EncodeToString(data)),
				ai.Text("Extract all text from this document."),
			}}},
			MaxTokens: 8000,
			Feature:   "index",
		})
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		if len(data) > 8<<20 {
			return "", nil // too large to send in one shot
		}
		return h.AI.Complete(ctx, ai.Request{
			System: []ai.Block{ai.Text("You read text from images (OCR). Output only the text visible in the image as plain text, preserving order. If the image contains no text, output nothing. Do not describe the image or add commentary.")},
			Messages: []ai.Message{{Role: "user", Content: []ai.Block{
				ai.ImageBlock(imageMediaType(ext), base64.StdEncoding.EncodeToString(data)),
				ai.Text("Extract all text visible in this image."),
			}}},
			MaxTokens: 4000,
			Feature:   "index",
		})
	}
	return "", nil
}

// chunkText splits text into ~chunkSize-character pieces on line boundaries.
func chunkText(s string, chunkSize int) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var chunks []string
	var cur strings.Builder
	flush := func() {
		if strings.TrimSpace(cur.String()) != "" {
			chunks = append(chunks, strings.TrimSpace(cur.String()))
		}
		cur.Reset()
	}
	for _, line := range strings.Split(s, "\n") {
		if cur.Len() > 0 && cur.Len()+len(line)+1 > chunkSize {
			flush()
		}
		cur.WriteString(line)
		cur.WriteString("\n")
	}
	flush()
	return chunks
}

// indexDocument (re)builds the searchable chunks for one document.
func (h *AIHandler) indexDocument(ctx context.Context, id, filename string) error {
	var chunks []string
	if readableExt(filename) {
		text, err := h.extractText(ctx, filename)
		if err != nil {
			return err
		}
		chunks = chunkText(text, 1500)
		if len(chunks) > 300 {
			chunks = chunks[:300]
		}
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tx.Exec(ctx, `DELETE FROM doc_chunks WHERE document_id = $1`, id)
	for i, ch := range chunks {
		if _, err := tx.Exec(ctx,
			`INSERT INTO doc_chunks (document_id, chunk_index, content) VALUES ($1, $2, $3)`, id, i, ch); err != nil {
			return err
		}
	}
	tx.Exec(ctx, `UPDATE documents SET indexed_at = NOW() WHERE id = $1`, id)
	return tx.Commit(ctx)
}

// IndexDocumentBG extracts and indexes one document's text in the background.
// It's wired into the upload flow so every supported file is auto-indexed on
// upload (text/Office files locally; PDFs and images via Claude). If extraction
// fails — e.g. AI is disabled when a PDF arrives — indexed_at stays NULL so the
// batch Reindex picks it up later. Unsupported types are skipped.
func (h *AIHandler) IndexDocumentBG(id, filename string) {
	if !readableExt(filename) {
		return
	}
	go func() {
		if err := h.indexDocument(context.Background(), id, filename); err != nil {
			log.Printf("auto-index failed for document %s (%s): %v", id, filename, err)
		}
	}()
}

// IndexStatus reports how many documents are indexed for the assistant (board+).
func (h *AIHandler) IndexStatus(c echo.Context) error {
	ctx := c.Request().Context()
	var total, indexed int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents`).Scan(&total)
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents WHERE indexed_at IS NOT NULL`).Scan(&indexed)
	return c.JSON(http.StatusOK, map[string]int{
		"total": total, "indexed": indexed, "pending": total - indexed,
	})
}

// Reindex builds the search index for a batch of not-yet-indexed documents.
// PDFs cost one Claude extraction call each, so it works in batches; the UI
// calls it repeatedly until nothing is pending. Non-readable files are marked
// done with no chunks so they don't keep coming back.
func (h *AIHandler) Reindex(c echo.Context) error {
	ctx := c.Request().Context()
	if !h.AI.Enabled(ctx) {
		return aiUnavailable(c, ai.ErrDisabled)
	}
	// "Rebuild all" resets every document so the whole library is re-extracted.
	if c.QueryParam("force") == "1" {
		h.DB.Exec(ctx, `UPDATE documents SET indexed_at = NULL`)
	}
	rows, err := h.DB.Query(ctx,
		`SELECT id::text, filename FROM documents WHERE indexed_at IS NULL ORDER BY created_at DESC LIMIT 15`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load documents")
	}
	type d struct{ id, filename string }
	var batch []d
	for rows.Next() {
		var x d
		if rows.Scan(&x.id, &x.filename) == nil {
			batch = append(batch, x)
		}
	}
	rows.Close()

	indexed := 0
	for _, doc := range batch {
		if readableExt(doc.filename) && h.indexDocument(ctx, doc.id, doc.filename) == nil {
			indexed++
			continue
		}
		// Non-readable, or extraction failed — mark done so it never blocks the
		// batch from making progress (it just won't have searchable text).
		h.DB.Exec(ctx, `UPDATE documents SET indexed_at = NOW() WHERE id = $1`, doc.id)
	}

	var pending int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM documents WHERE indexed_at IS NULL`).Scan(&pending)
	return c.JSON(http.StatusOK, map[string]int{"indexed": indexed, "pending": pending})
}

const askClubSystem = `You are the Liveoaks Tennis Club assistant. You help members using the club materials provided (bylaws, website content, booking settings, announcements, documents) AND the live tools available to you.

Rules:
- Answer concisely and warmly, like a helpful club volunteer.
- For club policies/rules, use ONLY the provided materials — do NOT invent policies, fees, or rules.
- If a policy question isn't covered by the materials, briefly say you don't have it on file (do not guess). Do NOT tell them to email the board — the app offers to forward the question.
- Quote specific numbers (guest fees, booking limits, days ahead) when they appear in the materials.
- Keep answers to a few sentences unless more detail is asked for.

Live tools — use them when relevant:
- court_availability(date): open/booked court times for a date. Use for "what's open on …".
- todays_schedule(): who is playing today. Use for "who's on the courts today".
- my_bookings(): the member's own upcoming reservations.
- propose_booking(date, start_time, duration_hours, match_type, invitees): finds an open court and PROPOSES a booking. It does NOT book it. Before you call it, make sure you know ALL of these — and ask the member (one friendly question, listing the choices) for anything still missing:
    1. the date and start time,
    2. how long they want the court: 1 hour or 1½ hours,
    3. the match type: singles, doubles, or a casual hit,
    4. whether they'd like to invite anyone — if so, get their names (pass them as invitees; pass an empty list if they say no).
  Don't assume a default for duration or match type — ask. Once you have them, call propose_booking, then tell the member the court, time, duration, match type, and who will be invited, and that they can tap Confirm to book (Confirm also sends the invitations). NEVER claim a booking is confirmed — only the member's tap books it.
Resolve relative dates ("next Thursday", "tomorrow") from today's date given below.

At the very end of every reply, on its own line, output a status tag and nothing after it:
- [[ANSWERED]] if you answered (from materials or tools).
- [[UNANSWERED]] only if it was a club-policy question the materials didn't cover.`

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
	// Fixed, cacheable corpus: bylaws + a title index of the user's accessible
	// documents + site/announcement/Q&A text.
	docIDs, docIndex := h.accessibleDocIDs(c)
	corpus := []ai.Block{}
	if b64, ok := h.readBylawsPDF(); ok {
		corpus = append(corpus, ai.DocumentBlock(b64))
	}
	corpusText := h.buildCorpusText(ctx)
	if corpusText == "" && docIndex == "" {
		corpusText = "(No additional club materials are on file yet.)"
	}
	corpus = append(corpus, ai.CachedText("# Liveoaks club reference materials\n\n"+docIndex+corpusText))

	messages := []ai.Message{
		{Role: "user", Content: corpus},
		{Role: "assistant", Content: []ai.Block{ai.Text("Understood — I'll answer using only the Liveoaks club materials above and any document excerpts provided with the question.")}},
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
	// Retrieve only the document excerpts relevant to THIS question (the RAG
	// step) and attach them to the final user turn — kept out of the cached
	// prefix because they're query-specific.
	finalBlocks := []ai.Block{}
	if excerpts := h.retrieveChunks(ctx, docIDs, req.Question); excerpts != "" {
		finalBlocks = append(finalBlocks, ai.Text("Relevant excerpts from club documents you have access to:\n\n"+excerpts))
	}
	// If the question matches board-restricted documents this member cannot see,
	// point them to the board rather than saying it isn't on file.
	role, _ := c.Get("role").(string)
	extra, _ := c.Get("extra_roles").([]string)
	privileged := false
	for _, r := range append([]string{role}, extra...) {
		if r == "admin" || boardRoleSet[r] {
			privileged = true
			break
		}
	}
	if !privileged && h.boardRestrictedHit(ctx, docIDs, req.Question) {
		finalBlocks = append(finalBlocks, ai.Text("ACCESS NOTE: One or more club documents that match this question are restricted to the board, and you cannot see their contents. If you cannot answer the question from the materials above, tell the member: that information is restricted to the board — please ask a board member (such as the president or secretary). When you do this, end your reply with [[ANSWERED]] and do NOT offer to forward the question."))
	}
	finalBlocks = append(finalBlocks, ai.Text("Question: "+req.Question))
	messages = append(messages, ai.Message{Role: "user", Content: finalBlocks})

	// Live booking tools (court availability, today's schedule, my bookings, and
	// a propose-booking that the member confirms).
	loc := h.aiTimezone(ctx)
	userID := c.Get("user_id").(string)
	var proposal *bookingProposal
	tools, handlers := h.bookingTools(loc, userID, &proposal)

	system := []ai.Block{
		ai.CachedText(askClubSystem),
		ai.Text("Today is " + time.Now().In(loc).Format("Monday, January 2, 2006") + " (club time)."),
	}

	answer, err := h.AI.Converse(ctx, ai.Request{
		System:    system,
		Messages:  messages,
		MaxTokens: 1024,
		Feature:   "ask_club",
	}, tools, handlers)
	if err != nil {
		return aiUnavailable(c, err)
	}
	// The model tags each reply so the UI knows whether to offer escalation.
	answered := !strings.Contains(answer, "[[UNANSWERED]]")
	answer = strings.TrimSpace(strings.NewReplacer("[[ANSWERED]]", "", "[[UNANSWERED]]", "").Replace(answer))
	resp := map[string]interface{}{"answer": answer, "answered": answered}
	if proposal != nil {
		resp["booking_proposal"] = proposal
	}
	return c.JSON(http.StatusOK, resp)
}

func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// EscalateQuestion forwards a member's unanswered question to the board and
// alerts the admins. The board answers it from Admin → Club Q&A.
func (h *AIHandler) EscalateQuestion(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req struct {
		Question string `json:"question"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Question) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "question is required")
	}
	ctx := c.Request().Context()
	q := strings.TrimSpace(req.Question)

	var id string
	if err := h.DB.QueryRow(ctx,
		`INSERT INTO club_questions (question, asked_by) VALUES ($1, $2) RETURNING id`, q, userID).Scan(&id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not submit question")
	}

	var askerName string
	h.DB.QueryRow(ctx, `SELECT first_name || ' ' || last_name FROM users WHERE id = $1`, userID).Scan(&askerName)
	msg := fmt.Sprintf("New question for the board from %s: \"%s\" — answer it in Admin → Club Q&A.", askerName, clip(q, 140))
	if rows, err := h.DB.Query(ctx, `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`); err == nil {
		var adminIDs []string
		for rows.Next() {
			var aid string
			if rows.Scan(&aid) == nil {
				adminIDs = append(adminIDs, aid)
			}
		}
		rows.Close()
		for _, aid := range adminIDs {
			h.DB.Exec(ctx,
				`INSERT INTO member_alerts (user_id, message, type, created_by) VALUES ($1, $2, 'info', $3)`,
				aid, msg, userID)
		}
	}
	return c.JSON(http.StatusCreated, map[string]string{"id": id})
}

type clubQuestion struct {
	ID             string     `json:"id"`
	Question       string     `json:"question"`
	AskedByName    *string    `json:"asked_by_name"`
	Status         string     `json:"status"`
	Answer         *string    `json:"answer"`
	AnsweredByName *string    `json:"answered_by_name"`
	AnsweredAt     *time.Time `json:"answered_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ListClubQuestions returns every escalated question, pending first (board+).
func (h *AIHandler) ListClubQuestions(c echo.Context) error {
	rows, err := h.DB.Query(c.Request().Context(), `
		SELECT q.id, q.question, a.first_name || ' ' || a.last_name, q.status, q.answer,
		       b.first_name || ' ' || b.last_name, q.answered_at, q.created_at
		FROM club_questions q
		LEFT JOIN users a ON a.id = q.asked_by
		LEFT JOIN users b ON b.id = q.answered_by
		ORDER BY (q.status = 'pending') DESC, q.created_at DESC`)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "could not load questions")
	}
	defer rows.Close()
	out := []clubQuestion{}
	for rows.Next() {
		var q clubQuestion
		if rows.Scan(&q.ID, &q.Question, &q.AskedByName, &q.Status, &q.Answer, &q.AnsweredByName, &q.AnsweredAt, &q.CreatedAt) == nil {
			out = append(out, q)
		}
	}
	return c.JSON(http.StatusOK, out)
}

// AnswerClubQuestion records the board's answer and notifies the asker. The
// answered Q&A then flows into the assistant's corpus for future questions.
func (h *AIHandler) AnswerClubQuestion(c echo.Context) error {
	adminID := c.Get("user_id").(string)
	var req struct {
		Answer string `json:"answer"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Answer) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "answer is required")
	}
	ctx := c.Request().Context()
	ans := strings.TrimSpace(req.Answer)

	var question string
	var askedBy *string
	err := h.DB.QueryRow(ctx,
		`UPDATE club_questions SET answer = $1, status = 'answered', answered_by = $2, answered_at = NOW()
		 WHERE id = $3 RETURNING question, asked_by`, ans, adminID, c.Param("id")).Scan(&question, &askedBy)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "question not found")
	}
	if askedBy != nil {
		h.DB.Exec(ctx,
			`INSERT INTO member_alerts (user_id, message, type, created_by) VALUES ($1, $2, 'info', $3)`,
			*askedBy, fmt.Sprintf("The board answered your question \"%s\":\n\n%s", clip(question, 120), ans), adminID)
	}
	return c.NoContent(http.StatusNoContent)
}

// DeleteClubQuestion removes an escalated question (board+).
func (h *AIHandler) DeleteClubQuestion(c echo.Context) error {
	h.DB.Exec(c.Request().Context(), `DELETE FROM club_questions WHERE id = $1`, c.Param("id"))
	return c.NoContent(http.StatusNoContent)
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
		Feature:   "receipt",
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
		Feature:   "minutes",
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
		Feature:   "improve_text",
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
		Feature:   "feedback_digest",
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
		Feature:   "parse_score",
	}, &out)
	if err != nil {
		return aiUnavailable(c, err)
	}
	return c.JSON(http.StatusOK, out)
}
