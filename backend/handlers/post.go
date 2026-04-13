package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"toolKit/backend/middlewares"
	"toolKit/backend/models"
	"toolKit/backend/utils"
)

// PostHandler holds the DB connection
type PostHandler struct {
	DB *sql.DB
}

// GetPosts returns all posts (with user info)
func (h *PostHandler) GetPosts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user_id from context (set by middleware)
	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	topicFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("topic")))
	likedOnly := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("liked")), "true")

	// Fetch posts with user nickname and reaction data
	query := `
		SELECT 
			p.id, p.user_id, u.nickname, p.title, p.content, p.category, p.created_at,
			(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments,
			(SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id AND type = 'like') AS likes,
			(SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id AND type = 'dislike') AS dislikes,
			IFNULL((SELECT type FROM post_reactions WHERE post_id = p.id AND user_id = ?), '') AS user_reaction
		FROM posts p
		JOIN users u ON p.user_id = u.id
	`

	args := []interface{}{userID}
	conditions := make([]string, 0, 2)

	if topicFilter != "" && topicFilter != "all" {
		topics := strings.Split(topicFilter, ",")
		topicConditions := make([]string, 0, len(topics))
		for _, topic := range topics {
			topic = strings.TrimSpace(topic)
			if topic == "" {
				continue
			}
			topicConditions = append(topicConditions, "LOWER(p.category) LIKE ?")
			args = append(args, "%"+topic+"%")
		}
		if len(topicConditions) > 0 {
			conditions = append(conditions, "("+strings.Join(topicConditions, " OR ")+")")
		}
	}

	if likedOnly {
		conditions = append(conditions, "EXISTS (SELECT 1 FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? AND pr.type = 'like')")
		args = append(args, userID)
	}

	if len(conditions) > 0 {
		query += "\n\t\tWHERE " + strings.Join(conditions, " AND ")
	}

	query += `
		ORDER BY p.created_at DESC
		LIMIT 50
	`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		log.Println("Error fetching posts:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		err := rows.Scan(
			&post.ID, &post.UserID, &post.Nickname, &post.Title,
			&post.Content, &post.Category, &post.CreatedAt, &post.Comments,
			&post.Likes, &post.Dislikes, &post.UserReaction,
		)
		if err != nil {
			log.Println("Error scanning post:", err)
			continue
		}
		posts = append(posts, post)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}

// CreatePost creates a new post
func (h *PostHandler) CreatePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user_id from context (set by middleware)
	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Decode input
	var input models.CreatePostInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate input
	if err := utils.ValidatePostTitle(input.Title); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := utils.ValidatePostContent(input.Content); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := utils.ValidatePostCategory(input.Category); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Generate UUID
	postID := utils.GenerateUUID()

	// Set default category if empty
	if input.Category == "" {
		input.Category = "general"
	}

	// Insert post
	query := `
		INSERT INTO posts (id, user_id, title, content, category)
		VALUES (?, ?, ?, ?, ?)
	`
	_, err := h.DB.Exec(query, postID, userID, input.Title, input.Content, input.Category)
	if err != nil {
		log.Println("Error creating post:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Post created successfully",
		"post_id": postID,
	})
}

// DeletePost deletes a post (only by owner)
func (h *PostHandler) DeletePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user_id from context
	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get post_id from URL query
	postID := r.URL.Query().Get("id")
	if postID == "" {
		http.Error(w, "Post ID required", http.StatusBadRequest)
		return
	}

	// Delete only if user owns the post
	query := `DELETE FROM posts WHERE id = ? AND user_id = ?`
	result, err := h.DB.Exec(query, postID, userID)
	if err != nil {
		log.Println("Error deleting post:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Post not found or not authorized", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Post deleted successfully",
	})
}

// ReactToPost adds a reaction (like, love, etc.)
func (h *PostHandler) ReactToPost(w http.ResponseWriter, r *http.Request) {
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
		PostID string `json:"post_id"`
		Type   string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if input.PostID == "" || input.Type == "" {
		http.Error(w, "Post ID and reaction type required", http.StatusBadRequest)
		return
	}

	// Check if reaction already exists
	var existingType string
	err := h.DB.QueryRow("SELECT type FROM post_reactions WHERE user_id = ? AND post_id = ?", userID, input.PostID).Scan(&existingType)

	if err == sql.ErrNoRows {
		// Insert new reaction
		reactionID := utils.GenerateUUID()
		query := `INSERT INTO post_reactions (id, user_id, post_id, type) VALUES (?, ?, ?, ?)`
		_, err = h.DB.Exec(query, reactionID, userID, input.PostID, input.Type)
	} else if existingType == input.Type {
		// Same type -> Remove reaction (toggle)
		query := `DELETE FROM post_reactions WHERE user_id = ? AND post_id = ?`
		_, err = h.DB.Exec(query, userID, input.PostID)
	} else {
		// Different type -> Update reaction
		query := `UPDATE post_reactions SET type = ? WHERE user_id = ? AND post_id = ?`
		_, err = h.DB.Exec(query, input.Type, userID, input.PostID)
	}

	if err != nil {
		log.Println("Error modifying reaction:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Reaction added",
	})
}

// GetPostReactions returns reaction count for a post
func (h *PostHandler) GetPostReactions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	postID := r.URL.Query().Get("id")
	if postID == "" {
		http.Error(w, "Post ID required", http.StatusBadRequest)
		return
	}

	// Count reactions by type
	query := `
		SELECT type, COUNT(*) as count
		FROM post_reactions
		WHERE post_id = ?
		GROUP BY type
	`
	rows, err := h.DB.Query(query, postID)
	if err != nil {
		log.Println("Error fetching reactions:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	reactions := make(map[string]int)
	for rows.Next() {
		var reactionType string
		var count int
		rows.Scan(&reactionType, &count)
		reactions[reactionType] = count
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reactions)
}
