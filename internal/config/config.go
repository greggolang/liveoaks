package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL     string
	JWTSecret       string
	Port            string
	SiteURL         string
	SMTPHost        string
	SMTPPort        int
	SMTPUser        string
	SMTPPass        string
	SMTPFrom        string
	GoogleSAJSON    string // service account JSON for Gmail/Drive integration
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
		siteURL = "http://liveoaks.webgoserver.com"
	}
	return Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Port:        port,
		SiteURL:     siteURL,
		SMTPHost:    os.Getenv("SMTP_HOST"),
		SMTPPort:    smtpPort,
		SMTPUser:    os.Getenv("SMTP_USER"),
		SMTPPass:    os.Getenv("SMTP_PASS"),
		SMTPFrom:     os.Getenv("SMTP_FROM"),
		GoogleSAJSON: os.Getenv("GOOGLE_SA_JSON"),
	}
}
