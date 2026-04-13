package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"toolKit/backend/middlewares"
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

	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	postID := r.URL.Query().Get("post_id")
	if postID == "" {
		http.Error(w, "Post ID required", http.StatusBadRequest)
		return
	}

	query := `
		SELECT 
			c.id, c.post_id, c.user_id, u.nickname, c.content, c.created_at,
			(SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND type = 'like') AS likes,
			(SELECT COUNT(*) FROM comment_reactions WHERE comment_id = c.id AND type = 'dislike') AS dislikes,
			IFNULL((SELECT type FROM comment_reactions WHERE comment_id = c.id AND user_id = ?), '') AS user_reaction
		FROM comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.post_id = ?
		ORDER BY c.created_at ASC
	`

	rows, err := h.DB.Query(query, userID, postID)
	if err != nil {
		log.Println("Error fetching comments:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var comment models.Comment
		err := rows.Scan(
			&comment.ID, &comment.PostID, &comment.UserID, &comment.Nickname,
			&comment.Content, &comment.CreatedAt, &comment.Likes, &comment.Dislikes, &comment.UserReaction,
		)
		if err != nil {
			log.Println("Error scanning comment:", err)
			continue
		}
		comments = append(comments, comment)
	}

	if err := rows.Err(); err != nil {
		log.Println("Error iterating comments:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
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
	userID := middlewares.GetUserIDFromContext(r)
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

// ReactToComment adds or toggles a comment reaction
func (h *CommentHandler) ReactToComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var input struct {
		CommentID string `json:"comment_id"`
		Type      string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if input.CommentID == "" || input.Type == "" {
		http.Error(w, "Comment ID and reaction type required", http.StatusBadRequest)
		return
	}

	var existingType string
	err := h.DB.QueryRow(
		"SELECT type FROM comment_reactions WHERE user_id = ? AND comment_id = ?",
		userID, input.CommentID,
	).Scan(&existingType)

	if err == sql.ErrNoRows {
		reactionID := utils.GenerateUUID()
		_, err = h.DB.Exec(
			`INSERT INTO comment_reactions (id, user_id, comment_id, type) VALUES (?, ?, ?, ?)`,
			reactionID, userID, input.CommentID, input.Type,
		)
	} else if existingType == input.Type {
		_, err = h.DB.Exec(
			`DELETE FROM comment_reactions WHERE user_id = ? AND comment_id = ?`,
			userID, input.CommentID,
		)
	} else {
		_, err = h.DB.Exec(
			`UPDATE comment_reactions SET type = ? WHERE user_id = ? AND comment_id = ?`,
			input.Type, userID, input.CommentID,
		)
	}

	if err != nil {
		log.Println("Error modifying comment reaction:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Comment reaction updated",
	})
}
