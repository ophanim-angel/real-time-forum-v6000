package models

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
