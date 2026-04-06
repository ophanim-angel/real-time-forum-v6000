package models

// Post represents a post in the database
type Post struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	Nickname     string `json:"nickname"`
	Title        string `json:"title"`
	Content      string `json:"content"`
	Category     string `json:"category"`
	CreatedAt    string `json:"created_at"`
	Comments     int    `json:"comments"`
	Likes        int    `json:"likes"`
	Dislikes     int    `json:"dislikes"`
	UserReaction string `json:"user_reaction"`
}

// CreatePostInput: Data coming from frontend to create a post
type CreatePostInput struct {
	Title    string `json:"title"`
	Content  string `json:"content"`
	Category string `json:"category"`
}

// Comment represents a comment in the database
type Comment struct {
	ID           string `json:"id"`
	PostID       string `json:"post_id"`
	UserID       string `json:"user_id"`
	Nickname     string `json:"nickname"`
	Content      string `json:"content"`
	CreatedAt    string `json:"created_at"`
	Likes        int    `json:"likes"`
	Dislikes     int    `json:"dislikes"`
	UserReaction string `json:"user_reaction"`
}
