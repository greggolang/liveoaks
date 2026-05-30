package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/greggolang/liveoaks/internal/config"
	"github.com/greggolang/liveoaks/internal/db"
	"github.com/greggolang/liveoaks/internal/email"
	"github.com/greggolang/liveoaks/internal/handlers"
	"github.com/greggolang/liveoaks/internal/logger"
	mw "github.com/greggolang/liveoaks/internal/middleware"
	"github.com/greggolang/liveoaks/internal/reminder"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

//go:embed frontend/dist
var frontendFS embed.FS

// Version is injected at build time via -ldflags
var Version = "dev"

func main() {
	cfg := config.Load()

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	defer pool.Close()

	mailer := &email.DBMailer{
		DB: pool,
		Fallback: &email.Mailer{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUser,
			Password: cfg.SMTPPass,
			From:     cfg.SMTPFrom,
		},
	}

	actlog := &logger.Logger{DB: pool}

	// Start booking reminder service
	reminderSvc := &reminder.Service{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	reminderSvc.Start(context.Background())

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowCredentials: true,
	}))
	e.Use(mw.ErrorLogger(actlog))

	uploadDir := "/opt/liveoaks/uploads"

	auth := &handlers.AuthHandler{DB: pool, JWTSecret: cfg.JWTSecret, SiteURL: cfg.SiteURL, Mailer: mailer, Logger: actlog}
	users := &handlers.UsersHandler{DB: pool, SiteURL: cfg.SiteURL, Mailer: mailer, Logger: actlog}
	courts := &handlers.CourtsHandler{DB: pool}
	bookings := &handlers.BookingsHandler{DB: pool, Logger: actlog}
	announcements := &handlers.AnnouncementsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	admin := &handlers.AdminHandler{DB: pool, Mailer: mailer}
	members := &handlers.MembersHandler{DB: pool}
	events := &handlers.EventsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	emailTemplates := &handlers.EmailTemplatesHandler{DB: pool}
	dues := &handlers.DuesHandler{DB: pool}
	waitlist := &handlers.WaitlistHandler{DB: pool}
	guests := &handlers.GuestsHandler{DB: pool}
	usta := &handlers.USTAHandler{DB: pool}
	uploads := &handlers.UploadsHandler{DB: pool, UploadDir: uploadDir}
	contacts := &handlers.ContactsHandler{DB: pool}
	friends := &handlers.FriendsHandler{DB: pool}
	perms := &handlers.PermissionsHandler{DB: pool}
	feedback := &handlers.FeedbackHandler{DB: pool}
	family := &handlers.FamilyHandler{DB: pool}
	groups := &handlers.GroupsHandler{DB: pool}
	invitations := &handlers.InvitationsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	signups := &handlers.SignupsHandler{DB: pool}

	api := e.Group("/api")

	// Public
	api.GET("/session-config", admin.GetSessionConfig)
	api.POST("/auth/register", auth.Register)
	api.POST("/auth/login", auth.Login)
	api.POST("/auth/forgot-password", auth.ForgotPassword)
	api.POST("/auth/reset-password", auth.ResetPassword)
	api.POST("/waitlist", waitlist.Join)

	// Authenticated
	authed := api.Group("", mw.JWTAuth(cfg.JWTSecret))
	authed.POST("/auth/logout", auth.Logout)
	authed.GET("/auth/me", auth.Me)
	authed.PUT("/auth/profile", auth.UpdateProfile)
	authed.PUT("/auth/password", auth.ChangePassword)

	authed.GET("/courts", courts.List)

	authed.GET("/bookings", bookings.List)
	authed.POST("/bookings", bookings.Create)
	authed.DELETE("/bookings/:id", bookings.Delete)

	authed.GET("/announcements", announcements.List)

	authed.GET("/members/directory", members.Directory)
	authed.GET("/contacts", contacts.List)
	authed.GET("/events", events.List)
	authed.GET("/events/:id", events.Get)
	// Public signup (no auth required — guests can sign up too)
	api.POST("/events/:id/signup", signups.Submit)
	authed.PUT("/events/:id/signup-toggle", signups.ToggleSignup)
	authed.GET("/documents", uploads.ListDocuments)
	authed.GET("/photos", uploads.ListPhotos)
	authed.GET("/usta-teams", usta.List)
	authed.GET("/dues/me", dues.MyDues)
	authed.GET("/guests/me", guests.MyGuests)
	authed.POST("/guests", guests.Log)

	// Friends
	authed.GET("/friends", friends.List)
	authed.GET("/friends/search", friends.SearchMembers)
	authed.POST("/friends/member", friends.AddMember)
	authed.POST("/friends/guest", friends.AddGuest)
	authed.DELETE("/friends/:id", friends.Remove)

	// Match invitations
	authed.GET("/bookings/:id/roster", invitations.GetRoster)
	authed.POST("/bookings/:id/invite", invitations.Send)
	authed.POST("/bookings/:id/players", invitations.AddPlayer)
	authed.DELETE("/bookings/:id/players/:playerId", invitations.RemovePlayer)
	authed.PUT("/invitations/:id/cancel", invitations.Cancel)

	// Public invite response (no auth needed)
	api.POST("/invite/:token/:action", invitations.Respond)

	// Board+
	boardPlus := authed.Group("", mw.RequireRole(mw.BoardRoleList()...))
	boardPlus.POST("/announcements", announcements.Create)
	boardPlus.DELETE("/announcements/:id", announcements.Delete)
	boardPlus.POST("/contacts", contacts.Create)
	boardPlus.PUT("/contacts/:id", contacts.Update)
	boardPlus.DELETE("/contacts/:id", contacts.Delete)
	boardPlus.POST("/events", events.Create)
	boardPlus.DELETE("/events/:id", events.Delete)
	boardPlus.POST("/events/:id/send-email", events.SendEmail)
	boardPlus.POST("/admin/documents", uploads.UploadDocument)
	boardPlus.DELETE("/admin/documents/:id", uploads.DeleteDocument)
	boardPlus.POST("/admin/photos", uploads.UploadPhoto)
	boardPlus.DELETE("/admin/photos/:id", uploads.DeletePhoto)
	boardPlus.POST("/usta-teams", usta.Create)
	boardPlus.DELETE("/usta-teams/:id", usta.Delete)

	// Admin only
	adminOnly := authed.Group("/admin", mw.RequireRole("admin"))
	adminOnly.GET("/users", users.List)
	adminOnly.PUT("/users/:id/profile", users.UpdateProfile)
	adminOnly.PUT("/users/:id/role", users.UpdateRole)
	adminOnly.PUT("/users/:id/status", users.UpdateStatus)
	adminOnly.DELETE("/users/:id", users.Delete)
	adminOnly.GET("/settings", admin.GetSettings)
	adminOnly.PUT("/settings/:key", admin.UpdateSetting)
	adminOnly.GET("/password-resets", admin.PendingResets)
	adminOnly.GET("/activity-log", admin.ActivityLog)
	adminOnly.GET("/dues", dues.AdminList)
	adminOnly.PUT("/dues/:id/status", dues.UpdateStatus)
	adminOnly.POST("/dues/generate", dues.Generate)
	adminOnly.GET("/waitlist", waitlist.List)
	adminOnly.PUT("/waitlist/:id/status", waitlist.UpdateStatus)
	adminOnly.PUT("/waitlist/:id/contact", waitlist.UpdateContact)
	adminOnly.DELETE("/waitlist/:id", waitlist.Delete)
	adminOnly.GET("/guests", guests.AdminList)
	adminOnly.GET("/events/:id/signups", signups.List)
	adminOnly.GET("/events/:id/signups/summary", signups.Summary)
	adminOnly.DELETE("/events/:id/signups/:signupId", signups.Delete)
	adminOnly.POST("/test-email", admin.TestEmail)
	adminOnly.GET("/permissions", perms.GetAll)
	adminOnly.PUT("/permissions/:page/:role", perms.Toggle)
	authed.POST("/feedback", feedback.Submit)
	adminOnly.GET("/feedback", feedback.AdminList)
	adminOnly.PUT("/feedback/:id/status", feedback.UpdateStatus)
	adminOnly.DELETE("/feedback/:id", feedback.Delete)
	adminOnly.GET("/email-templates", emailTemplates.List)
	adminOnly.POST("/email-templates", emailTemplates.Create)
	adminOnly.PUT("/email-templates/:id", emailTemplates.Update)
	adminOnly.DELETE("/email-templates/:id", emailTemplates.Delete)
	adminOnly.GET("/receipts", uploads.ListReceipts)
	adminOnly.POST("/receipts", uploads.UploadReceipt)
	adminOnly.DELETE("/receipts/:id", uploads.DeleteReceipt)

	authed.GET("/family-members", family.List)
	authed.POST("/family-members", family.Create)
	authed.PUT("/family-members/:id", family.Update)
	authed.DELETE("/family-members/:id", family.Delete)
	boardPlus.GET("/admin/users/:userId/family", family.AdminList)

	authed.GET("/friend-groups", groups.List)
	authed.POST("/friend-groups", groups.Create)
	authed.PUT("/friend-groups/:id", groups.Update)
	authed.DELETE("/friend-groups/:id", groups.Delete)
	authed.POST("/friend-groups/:id/members", groups.AddMember)
	authed.DELETE("/friend-groups/:id/members/:friendId", groups.RemoveMember)

	// Bylaws PDF — authenticated download, admin upload/meta
	authed.GET("/bylaws", uploads.ServeBylaws)
	adminOnly.GET("/bylaws/meta", uploads.BylawsMeta)
	adminOnly.POST("/bylaws", uploads.UploadBylaws)

	// Serve uploaded files
	e.GET("/uploads/documents/:filename", uploads.ServeDocument)
	e.GET("/uploads/photos/:filename", uploads.ServePhoto)
	e.GET("/uploads/receipts/:filename", uploads.ServeReceipt)

	// Serve React frontend — fall back to index.html for SPA routes
	distFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		log.Fatalf("could not load frontend: %v", err)
	}
	uploads.FrontendFS = distFS
	e.GET("/*", func(c echo.Context) error {
		req := c.Request()
		path := req.URL.Path
		if path == "/" || path == "" {
			path = "index.html"
		} else {
			path = strings.TrimPrefix(path, "/")
		}
		f, err := distFS.Open(path)
		if err != nil {
			req.URL.Path = "/"
		} else {
			f.Close()
		}
		http.FileServer(http.FS(distFS)).ServeHTTP(c.Response().Writer, req)
		return nil
	})

	log.Printf("Liveoaks %s starting on :%s", Version, cfg.Port)
	e.Logger.Fatal(e.Start(":" + cfg.Port))
}
