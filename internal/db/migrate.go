package db

import (
	"context"
	"io/fs"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func RunMigrations(ctx context.Context, pool *pgxpool.Pool, migrations fs.FS) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return err
	}

	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	// If schema_migrations is empty but the database already has tables,
	// this is an existing installation that predates the migration tracker.
	// Mark every migration file as applied without re-running them.
	var count int
	pool.QueryRow(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&count)
	if count == 0 {
		var existing bool
		pool.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_schema='public' AND table_name='users'
		)`).Scan(&existing)
		if existing {
			for _, name := range names {
				pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, name)
			}
			log.Printf("existing database detected — %d migrations marked as applied", len(names))
			return nil
		}
	}

	rows, err := pool.Query(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return err
	}
	applied := map[string]bool{}
	for rows.Next() {
		var name string
		rows.Scan(&name)
		applied[name] = true
	}
	rows.Close()

	for _, name := range names {
		if applied[name] {
			continue
		}
		sql, err := fs.ReadFile(migrations, "migrations/"+name)
		if err != nil {
			return err
		}
		if _, err = pool.Exec(ctx, string(sql)); err != nil {
			return err
		}
		pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name)
		log.Printf("migration applied: %s", name)
	}
	return nil
}
