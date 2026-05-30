package config

import "os"

type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
}

func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		Port:        port,
	}
}
