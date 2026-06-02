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

type Service struct {
	DB     *pgxpool.Pool
	Mailer Mailer

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

	var deviceName string
	var alertsEnabled bool
	err := s.DB.QueryRow(ctx,
		`SELECT name, alerts_enabled FROM yolink_devices WHERE id = $1`, msg.DeviceID).
		Scan(&deviceName, &alertsEnabled)

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

	alertMsg := fmt.Sprintf("%s: %s", deviceName, eventType)
	subject := fmt.Sprintf("YoLink Alert — %s", alertMsg)
	s.notifyBoard(ctx, alertMsg, subject)
}

func (s *Service) notifyBoard(ctx context.Context, message, subject string) {
	boardRoles := []string{
		"admin", "president", "vice_president", "secretary", "treasurer",
		"billing", "membership", "usta", "entertainment", "house_grounds", "games", "pro",
	}
	placeholders := make([]string, len(boardRoles))
	args := make([]interface{}, len(boardRoles))
	for i, r := range boardRoles {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = r
	}
	inClause := strings.Join(placeholders, ",")

	rows, err := s.DB.Query(ctx, fmt.Sprintf(
		`SELECT id, email, first_name FROM users
		 WHERE status = 'active' AND (
		     role IN (%s)
		     OR extra_roles && ARRAY[%s]::text[]
		 )`, inClause, inClause), args...)
	if err != nil {
		log.Printf("yolink: notifyBoard query failed: %v", err)
		return
	}
	defer rows.Close()

	type member struct{ ID, Email, FirstName string }
	var members []member
	for rows.Next() {
		var m member
		rows.Scan(&m.ID, &m.Email, &m.FirstName)
		members = append(members, m)
	}

	for _, m := range members {
		s.DB.Exec(ctx,
			`INSERT INTO member_alerts (user_id, message, type) VALUES ($1, $2, 'warning')`,
			m.ID, message)
		body := fmt.Sprintf(
			"Hi %s,\n\nLive Oaks Tennis Club — YoLink alert:\n\n%s\n\nThis is an automated notification from your clubhouse sensor system.",
			m.FirstName, message)
		if err := s.Mailer.Send(m.Email, subject, body); err != nil {
			log.Printf("yolink: email to %s failed: %v", m.Email, err)
		}
	}
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
