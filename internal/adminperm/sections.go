// Package adminperm defines the catalog of admin-panel sections that can be
// granted to board roles, and resolves an HTTP route path to the section it
// belongs to. It is the single source of truth shared by the authorization
// middleware and the admin-permissions handler.
package adminperm

import (
	"sort"
	"strings"
)

// Section is one grantable area of the admin panel.
type Section struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Group string `json:"group"`
	Desc  string `json:"desc"`
}

// Catalog is the ordered list of grantable sections shown on the Board Access
// page. Anything NOT listed here (Mail, Password Vault, both Permissions pages,
// Bylaws upload, camera config) stays admin-only and is never grantable.
var Catalog = []Section{
	// Content
	{"events_admin", "Events", "Content", "Create, edit, delete events and email attendees"},
	{"announcements", "Announcements", "Content", "Post, edit, and delete club announcements"},
	{"pro_shop", "Pro Shop", "Content", "Manage pro shop items and pricing"},
	{"files", "Files", "Content", "Upload and organize club documents and folders"},
	{"photos", "Photos", "Content", "Upload and organize photo albums"},
	{"usta_teams", "USTA Teams", "Content", "Add and remove USTA league teams"},
	{"content", "Main Site Content", "Content", "Edit the main public-facing site content"},
	{"polls", "Membership Polls", "Members", "Create and manage membership polls"},
	// Members
	{"members", "Members", "Members", "View and manage the member roster, roles, and status"},
	{"member_requests", "New Member Requests", "Members", "Review, approve, and communicate with membership applicants"},
	{"waitlist", "Waitlist", "Members", "Review and manage the official membership waitlist"},
	// Accounting
	{"accounting", "P&L", "Accounting", "Member balances, charges, kiosk payments, and P&L"},
	{"financial_rules", "Enforcement Rules", "Accounting", "Manage automated billing enforcement rules"},
	// Billing
	{"taxes", "Taxes", "Billing", "Tax documents and records for the club"},
	{"dues", "Dues", "Billing", "Generate and manage member dues"},
	{"receipts", "Receipts", "Billing", "Upload and manage expense receipts"},
	{"kiosk_purchases", "Kiosk Purchases", "Billing", "View and edit kiosk purchase records"},
	// Bookings
	{"bookings_admin", "All Bookings", "Bookings", "Create bookings for members and manage cancel reasons"},
	{"court_blocks", "Court Blocks", "Bookings", "Block courts for maintenance or events"},
	{"cancellations", "Cancellations", "Bookings", "View the booking cancellation report"},
	{"ball_tracking", "Ball Tracking", "Bookings", "Record ball inventory, usage, and purchases"},
	{"teaching_pro", "Teaching Pro", "Bookings", "View teaching pro booking activity"},
	// Games
	{"fantasy", "Fantasy Tennis Pool", "Games", "Manage the fantasy tennis pool"},
	{"ladder_admin", "Tennis Ladder", "Games", "Manage ladders, registrations, and challenge results"},
	{"liveball", "LiveBall Events", "Games", "Create and manage LiveBall events"},
	// Feedback
	{"feedback", "Site Ideas", "Feedback", "Review and manage member feedback"},
	// Board
	{"board_meetings", "Board Meetings", "Board", "Schedule and manage board meetings"},
	{"board_communications", "Communications", "Board", "View the board communications log"},
	{"notes", "Notes", "Board", "Shared board notes"},
	// Clubhouse
	{"appliances", "Appliances", "Clubhouse", "Manage appliances, service records, and reminders"},
	{"yolink", "YoLink Sensors", "Clubhouse", "Configure YoLink sensors and alert rules"},
	// System
	{"broadcast", "Broadcast Email", "System", "Send mass emails to members"},
	{"settings", "Settings", "System", "Edit club-wide settings"},
	{"email_templates", "Email Templates", "System", "Create and edit email templates"},
	{"password_resets", "Password Resets", "System", "View pending password reset requests"},
	{"password_vault", "Password Vault", "System", "View and manage the shared password vault"},
	{"activity_log", "Activity Log", "System", "View the site activity log"},
	{"communication_test", "Test Communications", "System", "Send test emails and texts"},
}

// validSections is built from the catalog for quick membership checks.
var validSections = func() map[string]bool {
	m := make(map[string]bool, len(Catalog))
	for _, s := range Catalog {
		m[s.Key] = true
	}
	return m
}()

// IsValidSection reports whether key is a known grantable section.
func IsValidSection(key string) bool { return validSections[key] }

// routePrefix maps a registered route-path prefix (echo c.Path(), which
// includes the /api group prefix and :params) to a section. Matching uses the
// longest prefix that lines up on a path boundary, so it is unaffected by
// route params. Routes with no entry here are not section-controlled.
type routePrefix struct {
	prefix  string
	section string
}

var routePrefixes = []routePrefix{
	{"/api/admin/site-content", "content"},
	{"/api/admin/polls", "polls"},
	{"/api/events", "events_admin"},
	{"/api/admin/events", "events_admin"},
	{"/api/announcements", "announcements"},
	{"/api/admin/pro-shop", "pro_shop"},
	{"/api/admin/documents", "files"},
	{"/api/admin/document-folders", "files"},
	{"/api/admin/photos", "photos"},
	{"/api/admin/photo-folders", "photos"},
	{"/api/usta-teams", "usta_teams"},
	{"/api/admin/users", "members"},
	{"/api/admin/member-requests", "member_requests"},
	{"/api/admin/waitlist", "waitlist"},
	{"/api/admin/finance/balances", "accounting"},
	{"/api/admin/finance/statement", "accounting"},
	{"/api/admin/finance/charges", "accounting"},
	{"/api/admin/finance/kiosk-payments", "accounting"},
	{"/api/admin/finance/pl", "accounting"},
	{"/api/admin/finance/send-reminders", "accounting"},
	{"/api/admin/taxes", "taxes"},
	{"/api/admin/finance/rules", "financial_rules"},
	{"/api/admin/dues", "dues"},
	{"/api/admin/receipts", "receipts"},
	{"/api/admin/kiosk", "kiosk_purchases"},
	{"/api/admin/bookings", "bookings_admin"},
	{"/api/admin/booking-cancel-reasons", "bookings_admin"},
	{"/api/admin/court-blocks", "court_blocks"},
	{"/api/admin/booking-cancellations", "cancellations"},
	{"/api/admin/balls", "ball_tracking"},
	{"/api/admin/teaching-pro", "teaching_pro"},
	{"/api/admin/fantasy", "fantasy"},
	{"/api/admin/ladder", "ladder_admin"},
	{"/api/admin/challenges", "ladder_admin"},
	{"/api/admin/liveball", "liveball"},
	{"/api/admin/feedback", "feedback"},
	{"/api/admin/board-meetings", "board_meetings"},
	{"/api/admin/board-communications", "board_communications"},
	{"/api/admin/board-members", "board_communications"},
	{"/api/admin/notes", "notes"},
	{"/api/admin/appliances", "appliances"},
	{"/api/admin/yolink", "yolink"},
	{"/api/admin/broadcast", "broadcast"},
	{"/api/admin/settings", "settings"},
	{"/api/admin/email-templates", "email_templates"},
	{"/api/admin/password-resets", "password_resets"},
	{"/api/admin/passwords", "password_vault"},
	{"/api/admin/activity-log", "activity_log"},
	{"/api/admin/test-email", "communication_test"},
	{"/api/admin/test-sms", "communication_test"},
	{"/api/admin/smtp-ping", "communication_test"},
}

func init() {
	// Longest prefix first so e.g. /finance/rules wins over a shorter /finance entry.
	sort.SliceStable(routePrefixes, func(i, j int) bool {
		return len(routePrefixes[i].prefix) > len(routePrefixes[j].prefix)
	})
}

// Resolve returns the section a route path belongs to, and whether one was
// found. routePath is the echo route pattern (c.Path()).
func Resolve(routePath string) (section string, known bool) {
	for _, rp := range routePrefixes {
		if routePath == rp.prefix || strings.HasPrefix(routePath, rp.prefix+"/") {
			return rp.section, true
		}
	}
	return "", false
}
