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
	RoleGames       Role = "games"
	RolePro         Role = "pro"
	RoleMember      Role = "member"

	StatusActive   Status = "active"
	StatusInactive Status = "inactive"
	StatusPending  Status = "pending"
)

// BoardRoles are roles that have board-level permissions
var BoardRoles = []string{
	"admin", "president", "vice_president", "secretary",
	"treasurer", "billing", "entertainment", "house_grounds",
}

type User struct {
	ID           string    `json:"id"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	ExtraRoles   []string  `json:"extra_roles,omitempty"`
	Status       Status    `json:"status"`
	Phone        *string   `json:"phone,omitempty"`
	Address      *string   `json:"address,omitempty"`
	Family       *string   `json:"family,omitempty"`
	USTARanking  *string   `json:"usta_ranking,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Court struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Number         int    `json:"number"`
	HasBallMachine bool   `json:"has_ball_machine"`
}

type Booking struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	CourtID         int       `json:"court_id"`
	StartTime       time.Time `json:"start_time"`
	EndTime         time.Time `json:"end_time"`
	Notes           *string   `json:"notes,omitempty"`
	MatchType       string    `json:"match_type,omitempty"`
	PlayersNeeded   int       `json:"players_needed,omitempty"`
	Players         []string  `json:"players,omitempty"`
	InvitesPending  int       `json:"invites_pending,omitempty"`
	InvitesDeclined int       `json:"invites_declined,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	User            *User     `json:"user,omitempty"`
	Court           *Court    `json:"court,omitempty"`
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

// ————— Fantasy Tennis Pool —————

type FantasyTournament struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Year      int     `json:"year"`
	StartDate *string `json:"start_date"`
	EndDate   *string `json:"end_date"`
	Status    string  `json:"status"` // draft | open | locked | completed
}

type FantasyPlayer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Gender  string `json:"gender"` // M | W
	Country string `json:"country,omitempty"`
}

type FantasyParticipant struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	EntryPaid bool   `json:"entry_paid"`
	JoinedAt  string `json:"joined_at"`
}

type FantasyPick struct {
	ID           string         `json:"id"`
	UserID       string         `json:"user_id"`
	TournamentID string         `json:"tournament_id"`
	PlayerID     string         `json:"player_id"`
	PickSlot     string         `json:"pick_slot"` // M1 | M2 | W1 | W2
	Player       *FantasyPlayer `json:"player,omitempty"`
}

type FantasyResult struct {
	ID           string         `json:"id"`
	PlayerID     string         `json:"player_id"`
	TournamentID string         `json:"tournament_id"`
	Result       string         `json:"result"` // R1..R4 | QF | SF | F | Champion
	PrizeMoney   float64        `json:"prize_money"`
	Player       *FantasyPlayer `json:"player,omitempty"`
	PickCount    int            `json:"pick_count,omitempty"`
	ValuePerPick float64        `json:"value_per_pick,omitempty"`
}

type FantasyStanding struct {
	Rank             int                `json:"rank"`
	UserID           string             `json:"user_id"`
	Name             string             `json:"name"`
	TotalScore       float64            `json:"total_score"`
	TournamentScores map[string]float64 `json:"tournament_scores"`
}

// ————————————————————————————

type Due struct {
	ID        string     `json:"id"`
	UserID    string     `json:"user_id"`
	Amount    float64    `json:"amount"`
	DueDate   time.Time  `json:"due_date"`
	PaidAt    *time.Time `json:"paid_at,omitempty"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
}
