package yolink

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Mailer interface {
	Send(to, subject, body string) error
}

// SMSSender sends a plain-text SMS. Implemented by *sms.DBSender.
type SMSSender interface {
	Send(to, body string) error
}

type Service struct {
	DB     *pgxpool.Pool
	Mailer Mailer
	SMS    SMSSender

	mu     sync.Mutex
	cancel context.CancelFunc
	bgCtx  context.Context
}

func (s *Service) Start(ctx context.Context) {
	s.mu.Lock()
	s.bgCtx = ctx
	svcCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.mu.Unlock()
	go s.run(svcCtx)
}

// Reload cancels the current connection and starts fresh — call after credential changes.
func (s *Service) Reload() {
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
	}
	svcCtx, cancel := context.WithCancel(s.bgCtx)
	s.cancel = cancel
	s.mu.Unlock()
	go s.run(svcCtx)
}

func (s *Service) run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		err := s.connect(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("yolink: %v; retrying in 60s", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(60 * time.Second):
			}
		}
	}
}

type tokenResp struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

type apiResp struct {
	Code string          `json:"code"`
	Data json.RawMessage `json:"data"`
}

type homeInfo struct {
	ID   string `json:"id"`
	MQTT struct {
		Host   string   `json:"host"`
		Port   int      `json:"port"`
		Topics []string `json:"topics"`
	} `json:"mqtt"`
}

// DeviceList is exported so the handler can call SyncDevices.
type DeviceList struct {
	Devices []struct {
		DeviceID  string `json:"deviceId"`
		Name      string `json:"name"`
		Type      string `json:"type"`
		ModelName string `json:"modelName"`
	} `json:"devices"`
}

func (s *Service) loadCreds(ctx context.Context) (clientID, secretKey string) {
	s.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'yolink_client_id'`).Scan(&clientID)
	s.DB.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'yolink_secret_key'`).Scan(&secretKey)
	return
}

func fetchToken(clientID, secretKey string) (*tokenResp, error) {
	vals := url.Values{}
	vals.Set("grant_type", "client_credentials")
	vals.Set("client_id", clientID)
	vals.Set("client_secret", secretKey)
	resp, err := http.PostForm("https://api.yosmart.com/open/yolink/token", vals)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var t tokenResp
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	if t.AccessToken == "" {
		return nil, fmt.Errorf("empty token response: %s", string(body))
	}
	return &t, nil
}

func callAPI(accessToken, method string) (json.RawMessage, error) {
	payload := fmt.Sprintf(`{"method":%q,"time":%d}`, method, time.Now().UnixMilli())
	req, _ := http.NewRequest(http.MethodPost, "https://api.yosmart.com/open/yolink/v2/api",
		strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var ar apiResp
	if err := json.NewDecoder(resp.Body).Decode(&ar); err != nil {
		return nil, err
	}
	if ar.Code != "000000" {
		return nil, fmt.Errorf("API error code %s", ar.Code)
	}
	return ar.Data, nil
}

// SyncDevices fetches the device list from the YoLink API and upserts into the DB.
func (s *Service) SyncDevices(ctx context.Context) error {
	clientID, secretKey := s.loadCreds(ctx)
	if clientID == "" || secretKey == "" {
		return fmt.Errorf("YoLink credentials not configured")
	}
	tok, err := fetchToken(clientID, secretKey)
	if err != nil {
		return fmt.Errorf("get token: %w", err)
	}
	data, err := callAPI(tok.AccessToken, "Home.getDeviceList")
	if err != nil {
		return fmt.Errorf("get devices: %w", err)
	}
	var dl DeviceList
	if err := json.Unmarshal(data, &dl); err != nil {
		return fmt.Errorf("parse devices: %w", err)
	}
	for _, d := range dl.Devices {
		s.DB.Exec(ctx,
			`INSERT INTO yolink_devices (id, name, type, model)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (id) DO UPDATE
			   SET type = EXCLUDED.type, model = EXCLUDED.model, updated_at = NOW()`,
			d.DeviceID, d.Name, d.Type, d.ModelName)
	}
	return nil
}

func (s *Service) connect(ctx context.Context) error {
	clientID, secretKey := s.loadCreds(ctx)
	if clientID == "" || secretKey == "" {
		return fmt.Errorf("YoLink credentials not configured")
	}

	tok, err := fetchToken(clientID, secretKey)
	if err != nil {
		return fmt.Errorf("get token: %w", err)
	}

	data, err := callAPI(tok.AccessToken, "Home.getGeneralInfo")
	if err != nil {
		return fmt.Errorf("get home info: %w", err)
	}
	var hi homeInfo
	if err := json.Unmarshal(data, &hi); err != nil {
		return fmt.Errorf("parse home info: %w", err)
	}
	if hi.ID == "" {
		return fmt.Errorf("empty home ID from YoLink API")
	}

	broker := "tcp://api.yosmart.com:8003"
	if hi.MQTT.Host != "" && hi.MQTT.Port != 0 {
		broker = fmt.Sprintf("tcp://%s:%d", hi.MQTT.Host, hi.MQTT.Port)
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(fmt.Sprintf("liveoaks-%d", time.Now().UnixMilli()))
	opts.SetUsername(tok.AccessToken)
	opts.SetPassword("")
	opts.SetAutoReconnect(false)
	opts.SetConnectTimeout(15 * time.Second)

	mc := mqtt.NewClient(opts)
	if ct := mc.Connect(); ct.Wait() && ct.Error() != nil {
		return fmt.Errorf("MQTT connect: %w", ct.Error())
	}
	defer mc.Disconnect(250)

	// Use topics from API response if available, otherwise wildcard.
	topics := hi.MQTT.Topics
	if len(topics) == 0 {
		topics = []string{fmt.Sprintf("yl-home/%s/#", hi.ID)}
	}
	for _, topic := range topics {
		if st := mc.Subscribe(topic, 0, func(_ mqtt.Client, msg mqtt.Message) {
			msgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			s.handleMessage(msgCtx, msg.Payload())
		}); st.Wait() && st.Error() != nil {
			return fmt.Errorf("MQTT subscribe %s: %w", topic, st.Error())
		}
	}

	log.Printf("yolink: connected, subscribed to %v", topics)

	// Reconnect before the token expires.
	ttl := time.Duration(tok.ExpiresIn-300) * time.Second
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	select {
	case <-ctx.Done():
	case <-time.After(ttl):
	}
	return nil
}

type mqttMsg struct {
	Event    string          `json:"event"`
	DeviceID string          `json:"deviceId"`
	Data     json.RawMessage `json:"data"`
}

func (s *Service) handleMessage(ctx context.Context, payload []byte) {
	var msg mqttMsg
	if err := json.Unmarshal(payload, &msg); err != nil || msg.DeviceID == "" {
		return
	}
	// Only act on alert/status-change events.
	if !strings.Contains(msg.Event, "Alert") && !strings.Contains(msg.Event, "StatusChange") {
		return
	}

	var deviceName, deviceType string
	var alertsEnabled bool
	err := s.DB.QueryRow(ctx,
		`SELECT name, type, alerts_enabled FROM yolink_devices WHERE id = $1`, msg.DeviceID).
		Scan(&deviceName, &deviceType, &alertsEnabled)

	// Always update device state.
	s.DB.Exec(ctx,
		`UPDATE yolink_devices SET state = $1, last_seen_at = NOW(), updated_at = NOW() WHERE id = $2`,
		json.RawMessage(msg.Data), msg.DeviceID)

	if err != nil || !alertsEnabled {
		return
	}

	eventType := formatEvent(msg.Event, msg.Data)

	s.DB.Exec(ctx,
		`INSERT INTO yolink_alerts (device_id, device_name, event_type, raw_event, data)
		 VALUES ($1, $2, $3, $4, $5)`,
		msg.DeviceID, deviceName, eventType, msg.Event, json.RawMessage(msg.Data))

	// Parse the reported state (e.g. "open", "alert") for rule matching.
	var sd struct {
		State string `json:"state"`
	}
	json.Unmarshal(msg.Data, &sd) //nolint:errcheck

	s.evaluateRules(ctx, ruleEvent{
		DeviceID:   msg.DeviceID,
		DeviceName: deviceName,
		DeviceType: deviceType,
		RawEvent:   msg.Event,
		EventLabel: eventType,
		State:      sd.State,
	})
}

// ─── Rule engine ─────────────────────────────────────────────────────────────

// boardRoles are the roles treated as "board members" for recipient_scope = 'board'.
var boardRoles = []string{
	"admin", "president", "vice_president", "secretary", "treasurer",
	"billing", "membership", "usta", "entertainment", "house_grounds", "games", "pro",
}

// ruleEvent is a normalized device event evaluated against the alert rules.
type ruleEvent struct {
	DeviceID   string
	DeviceName string
	DeviceType string
	RawEvent   string // e.g. "LeakSensor.Alert"
	EventLabel string // human label from formatEvent, e.g. "Water Leak Detected"
	State      string // parsed data.state, e.g. "alert", "open"
}

type alertRule struct {
	ID              string
	Name            string
	DeviceID        *string
	DeviceType      *string
	EventContains   *string
	StateEquals     *string
	RecipientScope  string
	RecipientRole   *string
	RecipientUserID *string
	NotifyDashboard bool
	NotifyEmail     bool
	NotifySMS       bool
	AlertType       string
	MessageTemplate *string
}

func nonEmpty(p *string) bool { return p != nil && strings.TrimSpace(*p) != "" }

// matches reports whether every present (non-empty) condition on the rule is
// satisfied by the event. Absent conditions mean "any".
func (r alertRule) matches(e ruleEvent) bool {
	if nonEmpty(r.DeviceID) && *r.DeviceID != e.DeviceID {
		return false
	}
	if nonEmpty(r.DeviceType) && !strings.EqualFold(*r.DeviceType, e.DeviceType) {
		return false
	}
	if nonEmpty(r.EventContains) && !strings.Contains(strings.ToLower(e.RawEvent), strings.ToLower(*r.EventContains)) {
		return false
	}
	if nonEmpty(r.StateEquals) && !strings.EqualFold(*r.StateEquals, e.State) {
		return false
	}
	return true
}

// message renders the alert text, honoring a custom template if set.
func (r alertRule) message(e ruleEvent) string {
	if nonEmpty(r.MessageTemplate) {
		out := strings.ReplaceAll(*r.MessageTemplate, "{device}", e.DeviceName)
		return strings.ReplaceAll(out, "{event}", e.EventLabel)
	}
	return fmt.Sprintf("%s: %s", e.DeviceName, e.EventLabel)
}

type recipient struct{ ID, Email, FirstName, Phone string }

// evaluateRules runs every enabled alert rule against an incoming device event
// and dispatches the configured channels (dashboard / email / SMS) to matching
// recipients. Each recipient is notified at most once per channel per event,
// even when several rules match.
func (s *Service) evaluateRules(ctx context.Context, e ruleEvent) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, name, device_id, device_type, event_contains, state_equals,
		       recipient_scope, recipient_role, recipient_user_id,
		       notify_dashboard, notify_email, notify_sms, alert_type, message_template
		FROM yolink_alert_rules WHERE enabled = true`)
	if err != nil {
		log.Printf("yolink: load rules failed: %v", err)
		return
	}
	var rules []alertRule
	for rows.Next() {
		var r alertRule
		if err := rows.Scan(&r.ID, &r.Name, &r.DeviceID, &r.DeviceType, &r.EventContains, &r.StateEquals,
			&r.RecipientScope, &r.RecipientRole, &r.RecipientUserID,
			&r.NotifyDashboard, &r.NotifyEmail, &r.NotifySMS, &r.AlertType, &r.MessageTemplate); err != nil {
			continue
		}
		rules = append(rules, r)
	}
	rows.Close()

	sentDash := map[string]bool{}
	sentEmail := map[string]bool{}
	sentSMS := map[string]bool{}

	for _, r := range rules {
		if !r.matches(e) {
			continue
		}
		text := r.message(e)
		for _, m := range s.resolveRecipients(ctx, r) {
			if r.NotifyDashboard && !sentDash[m.ID] {
				s.DB.Exec(ctx,
					`INSERT INTO member_alerts (user_id, message, type) VALUES ($1, $2, $3)`,
					m.ID, text, r.AlertType)
				sentDash[m.ID] = true
			}
			if r.NotifyEmail && m.Email != "" && !sentEmail[m.ID] {
				body := fmt.Sprintf(
					"Hi %s,\n\nLive Oaks Tennis Club — sensor alert:\n\n%s\n\nThis is an automated notification from the clubhouse sensor system.",
					m.FirstName, text)
				if err := s.Mailer.Send(m.Email, "YoLink Alert — "+text, body); err != nil {
					log.Printf("yolink: email to %s failed: %v", m.Email, err)
				}
				sentEmail[m.ID] = true
			}
			if r.NotifySMS && m.Phone != "" && s.SMS != nil && !sentSMS[m.ID] {
				if err := s.SMS.Send(m.Phone, "Live Oaks Tennis Club alert — "+text); err != nil {
					log.Printf("yolink: sms to %s failed: %v", m.Phone, err)
				}
				sentSMS[m.ID] = true
			}
		}
	}
}

// resolveRecipients returns the users targeted by a rule's recipient scope.
func (s *Service) resolveRecipients(ctx context.Context, r alertRule) []recipient {
	const cols = `SELECT id, email, first_name, COALESCE(phone, '') FROM users `
	var query string
	var args []interface{}

	switch r.RecipientScope {
	case "all_members":
		query = cols + `WHERE status = 'active'`
	case "role":
		if !nonEmpty(r.RecipientRole) {
			return nil
		}
		query = cols + `WHERE status = 'active' AND (role = $1 OR extra_roles && ARRAY[$1]::text[])`
		args = []interface{}{*r.RecipientRole}
	case "user":
		if !nonEmpty(r.RecipientUserID) {
			return nil
		}
		query = cols + `WHERE id = $1`
		args = []interface{}{*r.RecipientUserID}
	default: // "board"
		ph := make([]string, len(boardRoles))
		args = make([]interface{}, len(boardRoles))
		for i, role := range boardRoles {
			ph[i] = fmt.Sprintf("$%d", i+1)
			args[i] = role
		}
		in := strings.Join(ph, ",")
		query = cols + fmt.Sprintf(`WHERE status = 'active' AND (role IN (%s) OR extra_roles && ARRAY[%s]::text[])`, in, in)
	}

	rows, err := s.DB.Query(ctx, query, args...)
	if err != nil {
		log.Printf("yolink: resolveRecipients (%s) failed: %v", r.RecipientScope, err)
		return nil
	}
	defer rows.Close()
	var out []recipient
	for rows.Next() {
		var m recipient
		if err := rows.Scan(&m.ID, &m.Email, &m.FirstName, &m.Phone); err == nil {
			out = append(out, m)
		}
	}
	return out
}

func formatEvent(rawEvent string, data json.RawMessage) string {
	var d struct {
		State       string  `json:"state"`
		Temperature float64 `json:"temperature"`
		Humidity    float64 `json:"humidity"`
	}
	json.Unmarshal(data, &d) //nolint:errcheck

	parts := strings.SplitN(rawEvent, ".", 2)
	if len(parts) != 2 {
		return rawEvent
	}
	switch parts[0] {
	case "DoorSensor":
		if d.State == "open" {
			return "Opened"
		}
		return "Closed"
	case "LeakSensor":
		if d.State == "alert" || d.State == "leak" || d.State == "full" {
			return "Water Leak Detected"
		}
		return "Clear — No Leak"
	case "THSensor":
		f := d.Temperature*9/5 + 32
		return fmt.Sprintf("%.1f°F, %.0f%% humidity", f, d.Humidity)
	default:
		if d.State != "" {
			return d.State
		}
		return rawEvent
	}
}
