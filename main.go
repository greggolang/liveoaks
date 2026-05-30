package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"

	"github.com/greggolang/liveoaks/internal/config"
	"github.com/greggolang/liveoaks/internal/db"
	"github.com/greggolang/liveoaks/internal/handlers"
	mw "github.com/greggolang/liveoaks/internal/middleware"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

//go:embed frontend/dist
var frontendFS embed.FS

func main() {
	cfg := config.Load()

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	defer pool.Close()

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowCredentials: true,
	}))

	auth := &handlers.AuthHandler{DB: pool, JWTSecret: cfg.JWTSecret}
	users := &handlers.UsersHandler{DB: pool}
	courts := &handlers.CourtsHandler{DB: pool}
	bookings := &handlers.BookingsHandler{DB: pool}
	announcements := &handlers.AnnouncementsHandler{DB: pool}
	admin := &handlers.AdminHandler{DB: pool}

	api := e.Group("/api")

	// Public routes
	api.POST("/auth/register", auth.Register)
	api.POST("/auth/login", auth.Login)
	api.POST("/auth/forgot-password", auth.ForgotPassword)
	api.POST("/auth/reset-password", auth.ResetPassword)

	// Authenticated routes
	authed := api.Group("", mw.JWTAuth(cfg.JWTSecret))
	authed.POST("/auth/logout", auth.Logout)
	authed.GET("/auth/me", auth.Me)

	authed.GET("/courts", courts.List)

	authed.GET("/bookings", bookings.List)
	authed.POST("/bookings", bookings.Create)
	authed.DELETE("/bookings/:id", bookings.Delete)

	authed.GET("/announcements", announcements.List)

	// Board + admin routes
	boardPlus := authed.Group("", mw.RequireRole("board", "admin"))
	boardPlus.POST("/announcements", announcements.Create)
	boardPlus.DELETE("/announcements/:id", announcements.Delete)

	// Admin-only routes
	adminOnly := authed.Group("/admin", mw.RequireRole("admin"))
	adminOnly.GET("/users", users.List)
	adminOnly.PUT("/users/:id/role", users.UpdateRole)
	adminOnly.PUT("/users/:id/status", users.UpdateStatus)
	adminOnly.DELETE("/users/:id", users.Delete)
	adminOnly.GET("/settings", admin.GetSettings)
	adminOnly.PUT("/settings/:key", admin.UpdateSetting)
	adminOnly.GET("/password-resets", admin.PendingResets)

	// Serve React frontend
	distFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		log.Fatalf("could not load frontend: %v", err)
	}
	e.GET("/*", echo.WrapHandler(http.FileServer(http.FS(distFS))))

	log.Printf("starting server on :%s", cfg.Port)
	e.Logger.Fatal(e.Start(":" + cfg.Port))
}
