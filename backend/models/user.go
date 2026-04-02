package models

// User represents a user in the database
type User struct {
	ID           string `json:"id"`
	NickName     string `json:"nickname"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Age          int    `json:"age"`
	Gender       string `json:"gender"`
	AvatarURL    string `json:"avatar_url"`
	IsOnline     bool   `json:"is_online"`
	CreatedAt    string `json:"created_at"`
	IsActive     bool   `json:"is_active"`
}

// RegisterInput: Data coming from frontend for registration
type RegisterInput struct {
	Nickname  string `json:"nickname"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Age       int    `json:"age"`
	Gender    string `json:"gender"`
}

// LoginInput: Data coming from frontend for login
type LoginInput struct {
	Identifier string `json:"identifier"` // Can be email OR nickname
	Password   string `json:"password"`
}
