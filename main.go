package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
	_ "time/tzdata" // embed IANA timezone data so America/Los_Angeles works on any server

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
	bookings := &handlers.BookingsHandler{DB: pool, Logger: actlog, Mailer: mailer, SiteURL: cfg.SiteURL}
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
	google := &handlers.GoogleHandler{DB: pool, ServiceAccount: []byte(cfg.GoogleSAJSON)}
	camera := &handlers.CameraHandler{DB: pool, CameraToken: cfg.CameraToken, HLSDir: cfg.CameraHLSDir, SiteURL: cfg.SiteURL, Mailer: mailer}
	camera.Init()
	alerts := &handlers.AlertsHandler{DB: pool}
	balls := &handlers.BallsHandler{DB: pool}
	proshop := &handlers.ProShopHandler{DB: pool}
	contacts := &handlers.ContactsHandler{DB: pool}
	friends := &handlers.FriendsHandler{DB: pool}
	perms := &handlers.PermissionsHandler{DB: pool}
	feedback := &handlers.FeedbackHandler{DB: pool}
	family := &handlers.FamilyHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	groups := &handlers.GroupsHandler{DB: pool}
	notes := &handlers.NotesHandler{DB: pool}
	broadcast := &handlers.BroadcastHandler{DB: pool, Mailer: mailer}
	ladder := &handlers.LadderHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	liveball := &handlers.LiveballHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	boardMeetings := &handlers.BoardMeetingsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	invitations := &handlers.InvitationsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	signups := &handlers.SignupsHandler{DB: pool}
	weather := &handlers.WeatherHandler{DB: pool}
	fantasy := &handlers.FantasyHandler{DB: pool}
	bookingReminder := &handlers.BookingReminderHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	messages := &handlers.MessagesHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	kiosk := &handlers.KioskHandler{DB: pool}

	api := e.Group("/api")

	// Public
	api.GET("/session-config", admin.GetSessionConfig)
	api.GET("/weather", weather.Get)
	api.GET("/air-quality", weather.AirQuality)
	api.POST("/auth/register", auth.Register)
	api.POST("/auth/login", auth.Login)
	api.POST("/auth/forgot-password", auth.ForgotPassword)
	api.POST("/auth/reset-password", auth.ResetPassword)
	api.POST("/waitlist", waitlist.Join)
	api.GET("/bookings/:id/ical", bookings.ICal)

	// Authenticated
	authed := api.Group("", mw.JWTAuth(cfg.JWTSecret))
	authed.POST("/auth/logout", auth.Logout)
	authed.GET("/auth/me", auth.Me)
	authed.PUT("/auth/profile", auth.UpdateProfile)
	authed.PUT("/auth/password", auth.ChangePassword)

	authed.GET("/courts", courts.List)

	authed.GET("/bookings", bookings.List)
	authed.GET("/bookings/mine", bookings.Mine)
	authed.GET("/bookings/history", bookings.History)
	authed.POST("/bookings", bookings.Create)
	authed.PUT("/bookings/:id", bookings.Update)
	authed.DELETE("/bookings/:id", bookings.Delete)
	authed.GET("/booking-cancel-reasons", bookings.ListCancelReasons)

	authed.GET("/announcements", announcements.List)
	authed.POST("/announcements/:id/read", announcements.Confirm)

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

	// Member-to-member messages
	authed.GET("/messages/inbox", messages.Inbox)
	authed.GET("/messages/sent", messages.Sent)
	authed.GET("/messages/unread-count", messages.UnreadCount)
	authed.GET("/messages/:id", messages.Get)
	authed.POST("/messages", messages.Send)
	authed.PUT("/messages/read-all", messages.MarkAllRead)
	authed.DELETE("/messages/:id", messages.Delete)

	// Friends
	authed.GET("/friends", friends.List)
	authed.GET("/friends/search", friends.SearchMembers)
	authed.POST("/friends/member", friends.AddMember)
	authed.POST("/friends/guest", friends.AddGuest)
	authed.POST("/friends/from-family/:id", friends.AddFromFamily)
	authed.DELETE("/friends/:id", friends.Remove)

	// Match invitations
	authed.GET("/bookings/:id/roster", invitations.GetRoster)
	authed.POST("/bookings/:id/invite", invitations.Send)
	authed.POST("/bookings/:id/players", invitations.AddPlayer)
	authed.DELETE("/bookings/:id/players/:playerId", invitations.RemovePlayer)
	authed.POST("/bookings/:id/withdraw", invitations.WithdrawFromBooking)
	authed.PUT("/invitations/:id/cancel", invitations.Cancel)
	authed.GET("/invitations/responses", invitations.GetResponses)
	authed.GET("/invitations/pending", invitations.GetPendingForMe)
	authed.GET("/invitations/sent/pending", invitations.GetSentPending)

	// Public invite response (no auth needed)
	api.POST("/invite/:token/:action", invitations.Respond)

	// Public booking day-of reminder responses (no auth needed — links come from email)
	api.GET("/booking-reminder/:token", bookingReminder.GetInfo)
	api.POST("/booking-reminder/:token/ok", bookingReminder.Confirm)
	api.POST("/booking-reminder/:token/issue", bookingReminder.ReportIssue)

	// Board+
	boardPlus := authed.Group("", mw.RequireRole(mw.BoardRoleList()...))
	boardPlus.POST("/admin/bookings", bookings.AdminCreate)
	boardPlus.POST("/admin/booking-cancel-reasons", bookings.CreateCancelReason)
	boardPlus.DELETE("/admin/booking-cancel-reasons/:id", bookings.DeleteCancelReason)
	boardPlus.POST("/announcements", announcements.Create)
	boardPlus.PUT("/announcements/:id", announcements.Update)
	boardPlus.DELETE("/announcements/:id", announcements.Delete)
	boardPlus.GET("/announcements/:id/reads", announcements.GetReadStats)
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
	// Games admin (admin or games role can manage the fantasy pool)
	gamesAdmin := authed.Group("/admin", mw.RequireRole("admin", "games"))
	adminOnly.GET("/users", users.List)
	adminOnly.POST("/users", users.Create)
	adminOnly.PUT("/users/:id/profile", users.UpdateProfile)
	adminOnly.PUT("/users/:id/role", users.UpdateRole)
	adminOnly.PUT("/users/:id/extra-roles", users.UpdateExtraRoles)
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
	adminOnly.GET("/smtp-ping", admin.SMTPPing)
	adminOnly.GET("/permissions", perms.GetAll)
	adminOnly.PUT("/permissions/:page/:role", perms.Toggle)
	authed.POST("/feedback", feedback.Submit)
	boardPlus.GET("/feedback/new", feedback.NewFeedback)
	adminOnly.GET("/feedback", feedback.AdminList)
	adminOnly.PUT("/feedback/:id/status", feedback.UpdateStatus)
	adminOnly.DELETE("/feedback/:id", feedback.Delete)
	adminOnly.GET("/email-templates", emailTemplates.List)
	adminOnly.POST("/email-templates", emailTemplates.Create)
	adminOnly.PUT("/email-templates/:id", emailTemplates.Update)
	adminOnly.DELETE("/email-templates/:id", emailTemplates.Delete)
	// Board Meetings — public response (no auth)
	api.POST("/board-meetings/invite/:token/:action", boardMeetings.Respond)
	// Board Meetings — member
	authed.GET("/board-meetings/invitations/mine", boardMeetings.MyInvitations)
	// Board Meetings — board+
	boardPlus.GET("/admin/board-meetings", boardMeetings.List)
	boardPlus.POST("/admin/board-meetings", boardMeetings.Create)
	boardPlus.GET("/admin/board-meetings/:id/roster", boardMeetings.Roster)
	boardPlus.DELETE("/admin/board-meetings/:id", boardMeetings.Delete)

	// LiveBall — public response
	api.POST("/liveball/:token/:action", liveball.Respond)
	// LiveBall — member
	authed.GET("/liveball/my-invitations", liveball.GetMyInvitations)
	// LiveBall — board+ admin
	boardPlus.GET("/admin/liveball", liveball.AdminListEvents)
	boardPlus.POST("/admin/liveball", liveball.AdminCreateEvent)
	boardPlus.GET("/admin/liveball/:id/roster", liveball.AdminGetRoster)
	boardPlus.GET("/admin/liveball/:id/preview", liveball.AdminPreviewInvites)
	boardPlus.POST("/admin/liveball/:id/invite", liveball.AdminSendInvites)
	boardPlus.DELETE("/admin/liveball/:id/players/:userId", liveball.AdminRemovePlayer)
	boardPlus.DELETE("/admin/liveball/:id", liveball.AdminCancelEvent)

	// Tennis Ladder — member routes
	authed.GET("/ladder", ladder.GetLadders)
	authed.GET("/ladder/:id", ladder.GetLadder)
	authed.POST("/ladder/:id/register", ladder.Register)
	authed.GET("/ladder/:id/me", ladder.GetMyStatus)
	authed.POST("/ladder/:id/challenge", ladder.CreateChallenge)
	authed.PUT("/challenges/:id/respond", ladder.RespondChallenge)
	authed.GET("/ladder/:id/leaderboard", ladder.GetSeasonLeaderboard)

	// Tennis Ladder — admin routes
	adminOnly.GET("/ladder", ladder.AdminGetLadders)
	adminOnly.POST("/ladder", ladder.AdminCreateLadder)
	adminOnly.PUT("/ladder/:id", ladder.AdminUpdateLadder)
	adminOnly.DELETE("/ladder/:id", ladder.AdminDeleteLadder)
	adminOnly.GET("/ladder/:id/registrations", ladder.AdminGetRegistrations)
	adminOnly.PUT("/ladder/:id/registrations/:userId", ladder.AdminApproveRegistration)
	adminOnly.PUT("/ladder/:id/rank", ladder.AdminSetRank)
	adminOnly.GET("/ladder/:id/challenges", ladder.AdminGetChallenges)
	adminOnly.PUT("/challenges/:id/result", ladder.AdminEnterResult)
	adminOnly.PUT("/challenges/:id/forfeit", ladder.AdminForfeit)
	adminOnly.POST("/ladder/:id/points", ladder.AdminAwardPoints)

	// Broadcast email (admin only)
	adminOnly.GET("/broadcast/recipients", broadcast.PreviewRecipients)
	adminOnly.POST("/broadcast/send", broadcast.Send)

	// Admin notes (board+)
	boardPlus.GET("/admin/notes", notes.List)
	boardPlus.POST("/admin/notes", notes.Create)
	boardPlus.PUT("/admin/notes/:id", notes.Update)
	boardPlus.DELETE("/admin/notes/:id", notes.Delete)

	adminOnly.GET("/receipts", uploads.ListReceipts)
	adminOnly.POST("/receipts", uploads.UploadReceipt)
	adminOnly.DELETE("/receipts/:id", uploads.DeleteReceipt)

	// Fantasy Tennis Pool — member routes
	authed.GET("/fantasy/tournaments", fantasy.GetTournaments)
	authed.GET("/fantasy/players", fantasy.GetPlayers)
	authed.GET("/fantasy/leaderboard", fantasy.GetLeaderboard)
	authed.GET("/fantasy/me", fantasy.GetMyStatus)
	authed.GET("/fantasy/picks", fantasy.GetMyPicks)
	authed.GET("/fantasy/scores", fantasy.GetMyScores)
	authed.GET("/fantasy/results/:tid", fantasy.GetResults)
	authed.POST("/fantasy/join", fantasy.JoinPool)
	authed.PUT("/fantasy/picks/:tid", fantasy.SavePicks)

	// Fantasy Tennis Pool — admin routes (admin or games role)
	gamesAdmin.GET("/fantasy/tournaments", fantasy.AdminGetTournaments)
	gamesAdmin.POST("/fantasy/tournaments", fantasy.AdminCreateTournament)
	gamesAdmin.PUT("/fantasy/tournaments/:id", fantasy.AdminUpdateTournament)
	gamesAdmin.DELETE("/fantasy/tournaments/:id", fantasy.AdminDeleteTournament)
	gamesAdmin.GET("/fantasy/players", fantasy.AdminGetPlayers)
	gamesAdmin.POST("/fantasy/players", fantasy.AdminCreatePlayer)
	gamesAdmin.PUT("/fantasy/players/:id", fantasy.AdminUpdatePlayer)
	gamesAdmin.DELETE("/fantasy/players/:id", fantasy.AdminDeletePlayer)
	gamesAdmin.PUT("/fantasy/results", fantasy.AdminSaveResult)
	gamesAdmin.DELETE("/fantasy/results/:tid/:pid", fantasy.AdminDeleteResult)
	gamesAdmin.GET("/fantasy/participants", fantasy.AdminGetParticipants)
	gamesAdmin.PUT("/fantasy/participants/:userId/paid", fantasy.AdminUpdateParticipantPaid)
	gamesAdmin.GET("/fantasy/picks/popularity/:tid", fantasy.AdminGetPickPopularity)

	authed.GET("/family-members", family.List)
	authed.GET("/family-members/all", family.AllMembers)
	authed.POST("/family-members", family.Create)
	authed.PUT("/family-members/:id", family.Update)
	authed.DELETE("/family-members/:id", family.Delete)
	authed.PUT("/family-members/:id/password", family.SetPassword)
	boardPlus.GET("/admin/family-members", family.AdminListAll)
	boardPlus.GET("/admin/users/:userId/family", family.AdminList)
	boardPlus.POST("/admin/users/:userId/family", family.AdminCreate)
	boardPlus.PUT("/admin/users/:userId/family/:id", family.AdminUpdate)
	boardPlus.DELETE("/admin/users/:userId/family/:id", family.AdminDelete)

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

	// Google Workspace — credentials + Gmail + Drive (board members and above)
	boardPlus.GET("/google/credentials", google.GetCredentials)
	boardPlus.GET("/google/email/threads", google.ListThreads)
	boardPlus.GET("/google/email/threads/:threadId", google.GetThread)
	boardPlus.POST("/google/email/send", google.SendEmail)
	boardPlus.PUT("/google/email/threads/:threadId/read", google.MarkRead)
	boardPlus.DELETE("/google/email/threads/:threadId", google.TrashThread)
	boardPlus.GET("/google/drive/files", google.ListDriveFiles)

	// Camera viewer (HLS proxy + status)
	e.GET("/camera", camera.Page)
	e.GET("/camera/status", camera.Status)
	e.GET("/camera/api/*", camera.Proxy)
	authed.GET("/camera/embed", camera.EmbedURL)
	adminOnly.PUT("/camera/url", camera.UpdateURL)
	boardPlus.GET("/admin/camera/status", camera.AdminStatus)

	// Ball tracking
	boardPlus.GET("/admin/balls/summary", balls.Summary)
	boardPlus.GET("/admin/balls/usage", balls.UsageList)
	boardPlus.DELETE("/admin/balls/usage/:id", balls.DeleteUsage)
	boardPlus.GET("/admin/balls/purchases", balls.PurchaseList)
	boardPlus.POST("/admin/balls/purchases", balls.RecordPurchase)
	boardPlus.DELETE("/admin/balls/purchases/:id", balls.DeletePurchase)
	boardPlus.POST("/admin/balls/usage", balls.RecordManualUsage)

	// Pro Shop
	authed.GET("/pro-shop", proshop.List)
	boardPlus.GET("/admin/pro-shop", proshop.AdminList)
	boardPlus.POST("/admin/pro-shop", proshop.Create)
	boardPlus.PUT("/admin/pro-shop/:id", proshop.Update)
	boardPlus.DELETE("/admin/pro-shop/:id", proshop.Delete)

	// Kiosk — public endpoints (iPad in the club, no login required)
	api.GET("/kiosk/members", kiosk.Members)
	api.GET("/kiosk/items", proshop.List) // reuse existing in-stock items
	api.POST("/kiosk/purchase", kiosk.Purchase)
	// Kiosk admin — board+ can view all purchases
	boardPlus.GET("/admin/kiosk/purchases", kiosk.AdminPurchaseList)

	// Member alerts (admin → member dashboard)
	authed.GET("/member-alerts", alerts.GetMyAlerts)
	authed.POST("/member-alerts/:id/dismiss", alerts.Dismiss)
	boardPlus.GET("/admin/member-alerts", alerts.AdminListAll)
	boardPlus.GET("/admin/member-alerts/:userId", alerts.AdminList)
	boardPlus.GET("/admin/teaching-pro", bookings.TeachingProList)
	boardPlus.POST("/admin/member-alerts", alerts.AdminCreate)
	boardPlus.DELETE("/admin/member-alerts/:id", alerts.AdminDelete)

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
