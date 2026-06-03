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
	"github.com/greggolang/liveoaks/internal/sms"
	"github.com/greggolang/liveoaks/internal/yolink"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

//go:embed frontend/dist
var frontendFS embed.FS

//go:embed migrations
var migrationsFS embed.FS

// Version is injected at build time via -ldflags
var Version = "dev"

func main() {
	cfg := config.Load()

	pool, err := db.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(context.Background(), pool, migrationsFS); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	mailer := &email.DBMailer{
		DB: pool,
		Fallback: &email.Mailer{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUser,
			Password: cfg.SMTPPass,
			From:     cfg.SMTPFrom,
			SiteURL:  cfg.SiteURL,
		},
	}

	smsSender := &sms.DBSender{
		DB: pool,
		Fallback: &sms.Sender{
			AccountSID: cfg.TwilioAccountSID,
			AuthToken:  cfg.TwilioAuthToken,
			From:       cfg.TwilioFrom,
		},
	}

	actlog := &logger.Logger{DB: pool}

	// Start booking reminder service
	reminderSvc := &reminder.Service{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	reminderSvc.Start(context.Background())

	// Start YoLink sensor service (connects to MQTT if credentials are configured)
	yolinkSvc := &yolink.Service{DB: pool, Mailer: mailer, SMS: smsSender}
	yolinkSvc.Start(context.Background())

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
	finance := &handlers.FinancialHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL, Logger: actlog}
	courts := &handlers.CourtsHandler{DB: pool}
	bookings := &handlers.BookingsHandler{DB: pool, Logger: actlog, Mailer: mailer, SiteURL: cfg.SiteURL}
	announcements := &handlers.AnnouncementsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	admin := &handlers.AdminHandler{DB: pool, Mailer: mailer, SMS: smsSender}
	members := &handlers.MembersHandler{DB: pool}
	events := &handlers.EventsHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	emailTemplates := &handlers.EmailTemplatesHandler{DB: pool}
	dues := &handlers.DuesHandler{DB: pool}
	waitlist := &handlers.WaitlistHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	guests := &handlers.GuestsHandler{DB: pool}
	usta := &handlers.USTAHandler{DB: pool}
	uploads := &handlers.UploadsHandler{DB: pool, UploadDir: uploadDir}
	tax := &handlers.TaxHandler{DB: pool, UploadDir: uploadDir}
	camera := &handlers.CameraHandler{DB: pool, CameraToken: cfg.CameraToken, HLSDir: cfg.CameraHLSDir, SiteURL: cfg.SiteURL, Mailer: mailer}
	camera.Init()
	alerts := &handlers.AlertsHandler{DB: pool}
	balls := &handlers.BallsHandler{DB: pool}
	proshop := &handlers.ProShopHandler{DB: pool}
	contacts := &handlers.ContactsHandler{DB: pool}
	friends := &handlers.FriendsHandler{DB: pool}
	perms := &handlers.PermissionsHandler{DB: pool}
	adminPerms := &handlers.AdminPermsHandler{DB: pool}
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
	mail := &handlers.MailHandler{DB: pool}
	imapH := &handlers.IMAPHandler{DB: pool, UploadDir: uploadDir}
	mailContacts := &handlers.MailContactsHandler{DB: pool}
	courtWaitlist := &handlers.CourtWaitlistHandler{DB: pool, Mailer: mailer, SiteURL: cfg.SiteURL}
	notifPrefs := &handlers.NotifPrefsHandler{DB: pool}
	yolinkH := &handlers.YoLinkHandler{DB: pool, Service: yolinkSvc}
	courtBlocks := &handlers.CourtBlocksHandler{DB: pool}
	boardComms := &handlers.BoardCommsHandler{DB: pool}
	stripeH := &handlers.StripeHandler{DB: pool, SecretKey: cfg.StripeSecretKey, WebhookSecret: cfg.StripeWebhookSecret, PublishableKey: cfg.StripePublishableKey}
	appliances := &handlers.AppliancesHandler{DB: pool, UploadDir: uploadDir, Mailer: mailer, SiteURL: cfg.SiteURL}
	passwords := &handlers.PasswordsHandler{DB: pool, Secret: cfg.JWTSecret}
	polls := &handlers.PollsHandler{DB: pool}

	api := e.Group("/api")

	// Public
	api.GET("/version", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"version": Version})
	})
	api.GET("/session-config", admin.GetSessionConfig)
	api.GET("/site-content", admin.GetSiteContent)
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
	authed.GET("/notification-prefs", notifPrefs.Get)
	authed.PUT("/notification-prefs", notifPrefs.Update)

	authed.GET("/courts", courts.List)
	authed.GET("/court-blocks", courtBlocks.ListForDate)

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
	authed.GET("/stripe/config", stripeH.Config)
	authed.POST("/dues/:id/stripe-intent", stripeH.CreatePaymentIntent)
	api.POST("/stripe/webhook", stripeH.Webhook)
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

	// Board+ — board-shared utility routes pass with the board-role fallback;
	// routes that map to a grantable admin section are gated by section grant.
	boardPlus := authed.Group("", mw.RequireAdminSection(pool, mw.BoardRoleList()...))
	boardPlus.POST("/admin/bookings", bookings.AdminCreate)
	boardPlus.POST("/admin/booking-cancel-reasons", bookings.CreateCancelReason)
	boardPlus.DELETE("/admin/booking-cancel-reasons/:id", bookings.DeleteCancelReason)
	boardPlus.GET("/admin/court-blocks", courtBlocks.ListAdmin)
	boardPlus.POST("/admin/court-blocks", courtBlocks.Create)
	boardPlus.DELETE("/admin/court-blocks/:id", courtBlocks.Delete)
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
	boardPlus.GET("/admin/document-folders", uploads.AdminListFolders)
	boardPlus.POST("/admin/document-folders", uploads.CreateFolder)
	boardPlus.PUT("/admin/document-folders/:id", uploads.UpdateFolder)
	boardPlus.DELETE("/admin/document-folders/:id", uploads.DeleteFolder)
	boardPlus.POST("/admin/photos", uploads.UploadPhoto)
	boardPlus.DELETE("/admin/photos/:id", uploads.DeletePhoto)
	boardPlus.GET("/admin/photo-folders", uploads.AdminListPhotoFolders)
	boardPlus.POST("/admin/photo-folders", uploads.CreatePhotoFolder)
	boardPlus.PUT("/admin/photo-folders/:id", uploads.UpdatePhotoFolder)
	boardPlus.DELETE("/admin/photo-folders/:id", uploads.DeletePhotoFolder)
	boardPlus.POST("/usta-teams", usta.Create)
	boardPlus.DELETE("/usta-teams/:id", usta.Delete)

	// Polls — members vote, admins manage
	authed.GET("/polls", polls.List)
	authed.POST("/polls/:id/vote", polls.Vote)
	boardPlus.GET("/admin/polls", polls.AdminList)
	boardPlus.POST("/admin/polls", polls.AdminCreate)
	boardPlus.PUT("/admin/polls/:id/close", polls.AdminClose)
	boardPlus.DELETE("/admin/polls/:id", polls.AdminDelete)

	// Admin only — admin-prefixed routes that map to a grantable section are
	// opened to roles granted that section (admins always pass); routes that map
	// to no section (Mail, Password Vault, Permissions, Bylaws upload, camera
	// config) stay admin-only via the empty fallback.
	adminOnly := authed.Group("/admin", mw.RequireAdminSection(pool))
	// Games admin (admin or the games role can manage the fantasy pool)
	gamesAdmin := authed.Group("/admin", mw.RequireAdminSection(pool, "games"))
	adminOnly.GET("/users", users.List)
	adminOnly.POST("/users", users.Create)
	adminOnly.PUT("/users/:id/profile", users.UpdateProfile)
	adminOnly.PUT("/users/:id/role", users.UpdateRole)
	adminOnly.PUT("/users/:id/extra-roles", users.UpdateExtraRoles)
	adminOnly.PUT("/users/:id/status", users.UpdateStatus)
	adminOnly.DELETE("/users/:id", users.Delete)
	adminOnly.POST("/users/:id/force-reset", users.ForcePasswordReset)
	adminOnly.POST("/users/:id/impersonate", auth.CreateImpersonationToken)
	api.POST("/auth/redeem-impersonation", auth.RedeemImpersonationToken)
	adminOnly.GET("/settings", admin.GetSettings)
	adminOnly.PUT("/settings/:key", admin.UpdateSetting)
	adminOnly.GET("/password-resets", admin.PendingResets)
	adminOnly.GET("/activity-log", admin.ActivityLog)
	adminOnly.GET("/dues", dues.AdminList)
	adminOnly.PUT("/dues/:id/status", dues.UpdateStatus)
	adminOnly.POST("/dues/generate", dues.Generate)
	adminOnly.POST("/dues/generate-for-user", dues.GenerateForUser)
	// Financial rules, balances, charges, P&L
	adminOnly.GET("/finance/rules", finance.ListRules)
	adminOnly.POST("/finance/rules", finance.CreateRule)
	adminOnly.PUT("/finance/rules/:id", finance.UpdateRule)
	adminOnly.DELETE("/finance/rules/:id", finance.DeleteRule)
	adminOnly.GET("/finance/balances", finance.MemberBalances)
	adminOnly.GET("/finance/statement/:id", finance.MemberStatement)
	adminOnly.POST("/finance/charges", finance.CreateCharge)
	adminOnly.PUT("/finance/charges/:id/status", finance.UpdateChargeStatus)
	adminOnly.DELETE("/finance/charges/:id", finance.DeleteCharge)
	adminOnly.POST("/finance/kiosk-payments", finance.RecordKioskPayment)
	adminOnly.DELETE("/finance/kiosk-payments/:id", finance.DeleteKioskPayment)
	adminOnly.GET("/finance/pl", finance.PLReport)
	adminOnly.POST("/finance/send-reminders", finance.SendReminders)
	authed.GET("/finance/my-balance", finance.MyBalance)
	authed.GET("/finance/my-statement", finance.MyStatement)
	adminOnly.GET("/waitlist", waitlist.List)
	adminOnly.PUT("/waitlist/:id/status", waitlist.UpdateStatus)
	adminOnly.PUT("/waitlist/:id/contact", waitlist.UpdateContact)
	adminOnly.PUT("/waitlist/:id/admin-notes", waitlist.UpdateAdminNotes)
	adminOnly.DELETE("/waitlist/:id", waitlist.Delete)
	// Member requests — new applicants awaiting board review
	boardPlus.GET("/admin/member-requests", waitlist.ListRequests)
	boardPlus.PUT("/admin/member-requests/:id/approve", waitlist.Approve)
	boardPlus.PUT("/admin/member-requests/:id/admin-notes", waitlist.UpdateAdminNotes)
	boardPlus.POST("/admin/member-requests/:id/email", waitlist.SendApplicantEmail)
	boardPlus.PUT("/admin/member-requests/:id/status", waitlist.UpdateStatus)
	boardPlus.DELETE("/admin/member-requests/:id", waitlist.Delete)
	adminOnly.GET("/events/:id/signups", signups.List)
	adminOnly.GET("/events/:id/signups/summary", signups.Summary)
	adminOnly.DELETE("/events/:id/signups/:signupId", signups.Delete)
	adminOnly.GET("/board-communications", boardComms.List)
	adminOnly.GET("/board-members", boardComms.BoardMembers)
	adminOnly.POST("/test-email", admin.TestEmail)
	adminOnly.GET("/smtp-ping", admin.SMTPPing)
	adminOnly.POST("/test-sms", admin.TestSMS)
	adminOnly.GET("/permissions", perms.GetAll)
	adminOnly.PUT("/permissions/:page/:role", perms.Toggle)
	authed.GET("/my-permissions", perms.MyPages)
	// Admin-panel section access (Board Access page) — admin only
	adminOnly.GET("/admin-permissions/sections", adminPerms.Sections)
	adminOnly.GET("/admin-permissions", adminPerms.GetAll)
	adminOnly.PUT("/admin-permissions/:section/:role", adminPerms.Toggle)
	authed.GET("/my-admin-sections", adminPerms.Mine)
	authed.GET("/email-templates", emailTemplates.List) // read-only for all authenticated users
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
	boardPlus.GET("/admin/board-meetings/:id/minutes", boardMeetings.GetMinutes)
	boardPlus.PUT("/admin/board-meetings/:id/minutes", boardMeetings.SaveMinutes)
	boardPlus.POST("/admin/board-meetings/:id/minutes/publish", boardMeetings.PublishMinutes)
	authed.GET("/board-meetings/:id/minutes", boardMeetings.GetMemberMinutes)

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

	// Mail — current user's assigned account (authenticated, not admin-only)
	authed.GET("/my-mail-account", mail.MyAccount)

	// Court waitlist
	authed.GET("/court-waitlist", courtWaitlist.ListForDate)
	authed.GET("/court-waitlist/mine", courtWaitlist.MyEntries)
	authed.POST("/court-waitlist", courtWaitlist.Join)
	authed.DELETE("/court-waitlist/:id", courtWaitlist.Leave)

	// In-app IMAP inbox (any authenticated user with an assigned mail account)
	authed.GET("/imap/messages", imapH.ListMessages)
	authed.GET("/imap/messages/:uid", imapH.GetMessage)
	authed.POST("/imap/send", imapH.SendMessage)
	authed.PUT("/imap/messages/:uid/read", imapH.MarkRead)
	authed.PUT("/imap/messages/:uid/unread", imapH.MarkUnread)
	authed.DELETE("/imap/messages/:uid", imapH.DeleteMessage)
	authed.POST("/imap/messages/action", imapH.MessageAction)
	authed.POST("/imap/folders/:folder/empty", imapH.EmptyFolder)

	// Mail contacts (personal address book per user)
	authed.GET("/imap/contacts", mailContacts.List)
	authed.POST("/imap/contacts", mailContacts.Create)
	authed.PUT("/imap/contacts/:id", mailContacts.Update)
	authed.DELETE("/imap/contacts/:id", mailContacts.Delete)

	// Mail account management (admin only)
	adminOnly.GET("/mail/accounts", mail.List)
	adminOnly.POST("/mail/accounts", mail.Create)
	adminOnly.PUT("/mail/accounts/:id", mail.Update)
	adminOnly.POST("/mail/accounts/:id/reset-password", mail.ResetPassword)
	adminOnly.POST("/mail/accounts/:id/assign", mail.Assign)
	adminOnly.GET("/mail/accounts/:id/stats", mail.MailboxStats)
	adminOnly.POST("/mail/accounts/:id/import", mail.ImportMbox)
	adminOnly.POST("/mail/accounts/:id/empty", mail.EmptyMailbox)
	adminOnly.DELETE("/mail/accounts/:id", mail.Delete)

	// Broadcast email (admin only)
	adminOnly.GET("/broadcast/recipients", broadcast.PreviewRecipients)
	adminOnly.POST("/broadcast/send", broadcast.Send)

	// Admin notes (board+)
	boardPlus.GET("/admin/notes", notes.List)
	boardPlus.POST("/admin/notes", notes.Create)
	boardPlus.PUT("/admin/notes/:id", notes.Update)
	boardPlus.DELETE("/admin/notes/:id", notes.Delete)

	// Public website content (the landing page shown before login)
	boardPlus.PUT("/admin/site-content", admin.SaveSiteContent)

	// Taxes (board-grantable "taxes" section)
	boardPlus.GET("/admin/taxes/documents", tax.ListDocuments)
	boardPlus.POST("/admin/taxes/documents", tax.UploadDocument)
	boardPlus.DELETE("/admin/taxes/documents/:id", tax.DeleteDocument)
	boardPlus.GET("/admin/taxes/contractors", tax.ListContractors)
	boardPlus.POST("/admin/taxes/contractors", tax.CreateContractor)
	boardPlus.PUT("/admin/taxes/contractors/:id", tax.UpdateContractor)
	boardPlus.DELETE("/admin/taxes/contractors/:id", tax.DeleteContractor)
	boardPlus.GET("/admin/taxes/settings", tax.GetSettings)
	boardPlus.PUT("/admin/taxes/settings", tax.SaveSettings)
	boardPlus.GET("/admin/taxes/sales-summary", tax.SalesSummary)

	// Password vault (admin only) — adminOnly already prefixes /admin
	adminOnly.GET("/passwords", passwords.List)
	adminOnly.POST("/passwords", passwords.Create)
	adminOnly.PUT("/passwords/:id", passwords.Update)
	adminOnly.DELETE("/passwords/:id", passwords.Delete)

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
	boardPlus.PUT("/admin/kiosk/purchases/:id", kiosk.UpdatePurchase)
	boardPlus.DELETE("/admin/kiosk/purchases/:id", kiosk.DeletePurchase)

	// YoLink sensors (board+ only)
	boardPlus.GET("/admin/yolink/config", yolinkH.GetConfig)
	boardPlus.PUT("/admin/yolink/config", yolinkH.UpdateConfig)
	boardPlus.POST("/admin/yolink/sync", yolinkH.SyncDevices)
	boardPlus.GET("/admin/yolink/devices", yolinkH.ListDevices)
	boardPlus.PUT("/admin/yolink/devices/:id", yolinkH.UpdateDevice)
	boardPlus.GET("/admin/yolink/alerts", yolinkH.ListAlerts)
	boardPlus.GET("/admin/yolink/rules", yolinkH.ListRules)
	boardPlus.POST("/admin/yolink/rules", yolinkH.CreateRule)
	boardPlus.PUT("/admin/yolink/rules/:id", yolinkH.UpdateRule)
	boardPlus.DELETE("/admin/yolink/rules/:id", yolinkH.DeleteRule)
	boardPlus.POST("/admin/yolink/rules/:id/test", yolinkH.TestRule)

	// Member alerts (admin → member dashboard)
	authed.GET("/member-alerts", alerts.GetMyAlerts)
	authed.POST("/member-alerts/:id/dismiss", alerts.Dismiss)
	boardPlus.GET("/admin/member-alerts", alerts.AdminListAll)
	boardPlus.GET("/admin/member-alerts/:userId", alerts.AdminList)
	boardPlus.GET("/admin/teaching-pro", bookings.TeachingProList)
	boardPlus.GET("/admin/booking-cancellations", bookings.CancellationReport)
	boardPlus.POST("/admin/member-alerts", alerts.AdminCreate)
	boardPlus.DELETE("/admin/member-alerts/:id", alerts.AdminDelete)

	// Appliances & maintenance (board+)
	boardPlus.GET("/admin/appliances", appliances.List)
	boardPlus.POST("/admin/appliances", appliances.Create)
	boardPlus.PUT("/admin/appliances/:id", appliances.Update)
	boardPlus.DELETE("/admin/appliances/:id", appliances.Delete)
	boardPlus.POST("/admin/appliances/:id/manual", appliances.UploadManual)
	boardPlus.DELETE("/admin/appliances/:id/manual", appliances.DeleteManual)
	boardPlus.GET("/admin/appliances/:id/service-records", appliances.ListServiceRecords)
	boardPlus.POST("/admin/appliances/:id/service-records", appliances.CreateServiceRecord)
	boardPlus.DELETE("/admin/appliances/:id/service-records/:recordId", appliances.DeleteServiceRecord)
	boardPlus.GET("/admin/appliances/:id/reminders", appliances.ListReminders)
	boardPlus.POST("/admin/appliances/:id/reminders", appliances.CreateReminder)
	boardPlus.PUT("/admin/appliances/:id/reminders/:reminderId", appliances.UpdateReminder)
	boardPlus.DELETE("/admin/appliances/:id/reminders/:reminderId", appliances.DeleteReminder)
	boardPlus.POST("/admin/appliances/:id/reminders/:reminderId/send", appliances.SendReminder)
	e.GET("/uploads/appliance-manuals/:filename", appliances.ServeManual)

	// Serve uploaded files
	e.GET("/uploads/documents/:filename", uploads.ServeDocument)
	e.GET("/uploads/photos/:filename", uploads.ServePhoto)
	e.GET("/uploads/receipts/:filename", uploads.ServeReceipt)
	e.GET("/uploads/tax-documents/:filename", tax.ServeDocument)

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
