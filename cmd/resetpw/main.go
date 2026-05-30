package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	password := "LiveOaks2026!"
	if len(os.Args) > 1 {
		password = os.Args[1]
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("could not hash password: %v", err)
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	defer pool.Close()

	tag, err := pool.Exec(context.Background(),
		`UPDATE users SET password_hash = $1`, string(hash))
	if err != nil {
		log.Fatalf("could not update passwords: %v", err)
	}

	fmt.Printf("Updated %d users with default password\n", tag.RowsAffected())
}
