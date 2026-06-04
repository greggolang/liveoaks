// Package ai is a thin server-side client for the Anthropic (Claude) Messages
// API. It reads the API key, model, and enabled flag from the settings table
// (configured via the admin panel — see AdminHandler.GetAIConfig), so nothing is
// ever called from the browser. It supports prompt caching, image/PDF vision,
// and forced-tool structured output, which the club's AI features build on.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	apiURL     = "https://api.anthropic.com/v1/messages"
	apiVersion = "2023-06-01"
)

// ErrDisabled is returned when AI features are turned off or no key is set. It is
// distinct so callers can surface a friendly "AI is not configured" message.
var ErrDisabled = errors.New("ai: not configured or disabled")

// Client makes Claude calls using credentials stored in the settings table.
type Client struct {
	DB         *pgxpool.Pool
	HTTPClient *http.Client
}

// Config holds the resolved Claude settings.
type Config struct {
	APIKey  string
	Model   string
	Enabled bool
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	// Vision + large cached corpora can be slow; allow generous time.
	return &http.Client{Timeout: 120 * time.Second}
}

// Config loads the current Claude configuration from the settings table.
func (c *Client) Config(ctx context.Context) (Config, error) {
	var cfg Config
	var enabled string
	c.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'anthropic_api_key'`).Scan(&cfg.APIKey)
	c.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'claude_model'`).Scan(&cfg.Model)
	c.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'ai_enabled'`).Scan(&enabled)
	if cfg.Model == "" {
		cfg.Model = "claude-sonnet-4-6"
	}
	cfg.Enabled = enabled == "true"
	return cfg, nil
}

// Enabled reports whether AI features are usable (turned on and key present).
func (c *Client) Enabled(ctx context.Context) bool {
	cfg, _ := c.Config(ctx)
	return cfg.Enabled && cfg.APIKey != ""
}

// --- Content blocks -------------------------------------------------------

// CacheControl marks a block as a prompt-cache breakpoint. Use Ephemeral() on
// the last block of a fixed corpus (e.g. the bylaws) so repeat calls are cheap.
type CacheControl struct {
	Type string `json:"type"` // always "ephemeral"
}

// Ephemeral returns a cache-breakpoint marker.
func Ephemeral() *CacheControl { return &CacheControl{Type: "ephemeral"} }

// Source is the payload for image/document blocks (base64-encoded bytes).
type Source struct {
	Type      string `json:"type"` // "base64"
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

// Block is one piece of message or system content.
type Block struct {
	Type         string        `json:"type"` // "text" | "image" | "document"
	Text         string        `json:"text,omitempty"`
	Source       *Source       `json:"source,omitempty"`
	CacheControl *CacheControl `json:"cache_control,omitempty"`
}

// Text builds a text block.
func Text(s string) Block { return Block{Type: "text", Text: s} }

// CachedText builds a text block that ends a prompt-cache prefix.
func CachedText(s string) Block { return Block{Type: "text", Text: s, CacheControl: Ephemeral()} }

// ImageBlock builds a base64 image block (e.g. a photographed receipt).
func ImageBlock(mediaType string, b64 string) Block {
	return Block{Type: "image", Source: &Source{Type: "base64", MediaType: mediaType, Data: b64}}
}

// DocumentBlock builds a base64 PDF document block (Claude reads PDFs natively).
func DocumentBlock(b64 string) Block {
	return Block{Type: "document", Source: &Source{Type: "base64", MediaType: "application/pdf", Data: b64}}
}

// WithCache returns a copy of b marked as a cache breakpoint.
func WithCache(b Block) Block {
	b.CacheControl = Ephemeral()
	return b
}

// Message is one turn in the conversation.
type Message struct {
	Role    string  `json:"role"` // "user" | "assistant"
	Content []Block `json:"content"`
}

// UserText is a convenience for a single-text-block user message.
func UserText(s string) Message {
	return Message{Role: "user", Content: []Block{Text(s)}}
}

// --- Structured output (forced tool use) ----------------------------------

type tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

type toolChoice struct {
	Type string `json:"type"` // "tool"
	Name string `json:"name"`
}

// --- Request / response ---------------------------------------------------

// Request is a Messages API call.
type Request struct {
	System    []Block
	Messages  []Message
	MaxTokens int
	// Schema, when set, forces the model to emit JSON matching it via a tool
	// call; the result is returned by Structured.
	Schema      json.RawMessage
	Temperature *float64
}

type apiRequest struct {
	Model       string      `json:"model"`
	MaxTokens   int         `json:"max_tokens"`
	System      []Block     `json:"system,omitempty"`
	Messages    []Message   `json:"messages"`
	Tools       []tool      `json:"tools,omitempty"`
	ToolChoice  *toolChoice `json:"tool_choice,omitempty"`
	Temperature *float64    `json:"temperature,omitempty"`
}

type respBlock struct {
	Type  string          `json:"type"` // "text" | "tool_use"
	Text  string          `json:"text"`
	Input json.RawMessage `json:"input"`
}

type apiResponse struct {
	Content    []respBlock `json:"content"`
	StopReason string      `json:"stop_reason"`
	Usage      struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

const structuredToolName = "emit_result"

func (c *Client) do(ctx context.Context, cfg Config, ar apiRequest) (*apiResponse, error) {
	if ar.MaxTokens == 0 {
		ar.MaxTokens = 1024
	}
	body, err := json.Marshal(ar)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("anthropic-version", apiVersion)
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("ai: request failed: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))

	var out apiResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("ai: bad response (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		if out.Error != nil {
			return nil, fmt.Errorf("ai: %s", out.Error.Message)
		}
		return nil, fmt.Errorf("ai: HTTP %d", resp.StatusCode)
	}
	return &out, nil
}

// Complete runs a request and returns the concatenated text output.
func (c *Client) Complete(ctx context.Context, req Request) (string, error) {
	cfg, _ := c.Config(ctx)
	if !cfg.Enabled || cfg.APIKey == "" {
		return "", ErrDisabled
	}
	ar := apiRequest{
		Model:       cfg.Model,
		MaxTokens:   req.MaxTokens,
		System:      req.System,
		Messages:    req.Messages,
		Temperature: req.Temperature,
	}
	out, err := c.do(ctx, cfg, ar)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	for _, b := range out.Content {
		if b.Type == "text" {
			buf.WriteString(b.Text)
		}
	}
	return buf.String(), nil
}

// Structured forces the model to return JSON matching req.Schema and unmarshals
// it into dst (a pointer). Use for receipt fields, parsed scores, triage, etc.
func (c *Client) Structured(ctx context.Context, req Request, dst any) error {
	cfg, _ := c.Config(ctx)
	if !cfg.Enabled || cfg.APIKey == "" {
		return ErrDisabled
	}
	if len(req.Schema) == 0 {
		return errors.New("ai: Structured requires a Schema")
	}
	ar := apiRequest{
		Model:       cfg.Model,
		MaxTokens:   req.MaxTokens,
		System:      req.System,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		Tools: []tool{{
			Name:        structuredToolName,
			Description: "Return the result in the required structured form.",
			InputSchema: req.Schema,
		}},
		ToolChoice: &toolChoice{Type: "tool", Name: structuredToolName},
	}
	out, err := c.do(ctx, cfg, ar)
	if err != nil {
		return err
	}
	for _, b := range out.Content {
		if b.Type == "tool_use" && len(b.Input) > 0 {
			return json.Unmarshal(b.Input, dst)
		}
	}
	return errors.New("ai: model did not return structured output")
}
