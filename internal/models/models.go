package models

import "time"

type Role string
type Status string

const (
	RoleAdmin       Role = "admin"
	RolePresident   Role = "president"
	RoleVicePresident Role = "vice_president"
	RoleSecretary   Role = "secretary"
	RoleTreasurer   Role = "treasurer"
	RoleEntertainment Role = "entertainment"
	RoleHouseGrounds Role = "house_grounds"
	RoleBilling     Role = "billing"
	RoleMembership  Role = "membership"
	RoleUSTA        Role = "usta"
	RoleMember      Role = "member"

	StatusActive   Status = "active"
	StatusInactive Status = "inactive"
	StatusPending  Status = "pending"
)

// BoardRoles are roles that have board-level permissions
var BoardRoles = []string{
	"admin", "president", "vice_president", "secretary",
	"treasurer", "entertainment", "house_grounds",
}

type User struct {
	ID           string    `json:"id"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	Status       Status    `json:"status"`
	Phone        *string   `json:"phone,omitempty"`
	Address      *string   `json:"address,omitempty"`
	Family       *string   `json:"family,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Court struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Number int    `json:"number"`
}

type Booking struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	CourtID   int       `json:"court_id"`
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	User      *User     `json:"user,omitempty"`
	Court     *Court    `json:"court,omitempty"`
}

type Announcement struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	AuthorID  string    `json:"author_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Author    *User     `json:"author,omitempty"`
}

type Due struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id"`
	Amount    float64    `json:"amount"`
	DueDate   time.Time  `json:"due_date"`
	PaidAt    *time.Time `json:"paid_at,omitempty"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
}
