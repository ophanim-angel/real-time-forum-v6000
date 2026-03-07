package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	middleware "toolKit/backend/middlewares"
	"toolKit/backend/models"
	"toolKit/backend/utils"
)

// CommentHandler holds the DB connection
type CommentHandler struct {
	DB *sql.DB
}

// GetComments returns comments for a post
func (h *CommentHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	postID := r.URL.Query().Get("post_id")
	if postID == "" {
		http.Error(w, "Post ID required", http.StatusBadRequest)
		return
	}

	query := `
		SELECT c.id, c.post_id, c.user_id, u.nickname, c.content, c.created_at
		FROM comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.post_id = ?
		ORDER BY c.created_at ASC
	`

	rows, err := h.DB.Query(query, postID)
	if err != nil {
		log.Println("Error fetching comments:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var comment models.Comment
		err := rows.Scan(&comment.ID, &comment.PostID, &comment.UserID, &comment.Nickname, &comment.Content, &comment.CreatedAt)
		if err != nil {
			log.Println("Error scanning comment:", err)
			continue
		}
		comments = append(comments, comment)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

// CreateComment creates a new comment
func (h *CommentHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user_id from context
	userID := middleware.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Decode input
	var input struct {
		PostID  string `json:"post_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate content
	if err := utils.ValidateMessageContent(input.Content); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	commentID := utils.GenerateUUID()

	query := `
		INSERT INTO comments (id, post_id, user_id, content)
		VALUES (?, ?, ?, ?)
	`
	_, err := h.DB.Exec(query, commentID, input.PostID, userID, input.Content)
	if err != nil {
		log.Println("Error creating comment:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message":    "Comment created successfully",
		"comment_id": commentID,
	})
}
