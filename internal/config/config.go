package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL          string
	JWTSecret            string
	Port                 string
	SiteURL              string
	SMTPHost             string
	SMTPPort             int
	SMTPUser             string
	SMTPPass             string
	SMTPFrom             string
	CameraToken          string // optional token to protect the camera page
	CameraHLSDir         string // directory where camera-hls systemd service writes HLS files
	StripeSecretKey      string
	StripeWebhookSecret  string
	StripePublishableKey string
	TwilioAccountSID     string
	TwilioAuthToken      string
	TwilioFrom           string // E.164 sending number, e.g. +14155551234
	DropshotURL          string // base URL for forwarding feedback to the central DropShot tracker
	FeedbackSyncSecret   string // shared secret used for DropShot ↔ LiveOaks status sync
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	smtpPort := 587
	if p, err := strconv.Atoi(os.Getenv("SMTP_PORT")); err == nil {
		smtpPort = p
	}
	siteURL := os.Getenv("SITE_URL")
	if siteURL == "" {
		siteURL = "http://172.236.228.11"
	}
	cameraHLSDir := os.Getenv("CAMERA_HLS_DIR")
	if cameraHLSDir == "" {
		cameraHLSDir = "/var/cache/camera-hls"
	}
	return Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		Port:         port,
		SiteURL:      siteURL,
		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     smtpPort,
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPass:     os.Getenv("SMTP_PASS"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		CameraToken:          os.Getenv("CAMERA_TOKEN"),
		CameraHLSDir:         cameraHLSDir,
		StripeSecretKey:      os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:  os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePublishableKey: os.Getenv("STRIPE_PUBLISHABLE_KEY"),
		TwilioAccountSID:     os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:      os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioFrom:           os.Getenv("TWILIO_FROM"),
		DropshotURL:          os.Getenv("DROPSHOT_URL"),
		FeedbackSyncSecret:   os.Getenv("FEEDBACK_SYNC_SECRET"),
	}
}
