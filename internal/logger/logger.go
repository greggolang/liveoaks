package logger

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Logger struct {
	DB *pgxpool.Pool
}

func (l *Logger) Log(ctx context.Context, event, details, userID, ip string) {
	var uid *string
	if userID != "" {
		uid = &userID
	}
	var ipv *string
	if ip != "" {
		ipv = &ip
	}
	l.DB.Exec(ctx,
		`INSERT INTO activity_log (event, details, user_id, ip) VALUES ($1, $2, $3, $4)`,
		event, details, uid, ipv)
}
