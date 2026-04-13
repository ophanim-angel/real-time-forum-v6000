package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"toolKit/backend/middlewares"
	"toolKit/backend/utils"
	"toolKit/backend/ws"
)

// ChatHandler holds the DB connection
type ChatHandler struct {
	DB      *sql.DB
	Manager *ws.Manager
}

// GetOnlineStatus returns users with their online status and last message snippet
func (h *ChatHandler) GetUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// This query:
	// 1. Gets all active users except the current one.
	// 2. Joins the private_messages table to find the most recent message exchanged between them.
	// 3. Orders by the date of that last message (descending), and then alphabetically by nickname.
	query := `
		SELECT u.id, u.nickname,
               MAX(pm.created_at) as last_msg_time,
               (SELECT content FROM private_messages 
				WHERE (sender_id = u.id AND receiver_id = ?) 
				   OR (sender_id = ? AND receiver_id = u.id)
                ORDER BY rowid DESC LIMIT 1) as last_msg
		FROM users u
		LEFT JOIN private_messages pm 
			ON (pm.sender_id = u.id AND pm.receiver_id = ?) 
			OR (pm.sender_id = ? AND pm.receiver_id = u.id)
		WHERE u.id != ? AND u.is_active = 1
		GROUP BY u.id
		ORDER BY 
			CASE WHEN last_msg_time IS NULL THEN 1 ELSE 0 END, 
			last_msg_time DESC, 
			u.nickname ASC
	`
	rows, err := h.DB.Query(query, userID, userID, userID, userID, userID)
	if err != nil {
		log.Println("Error fetching users:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []map[string]interface{}
	for rows.Next() {
		var id, nickname string
		var lastMsgTime, lastMsg sql.NullString

		if err := rows.Scan(&id, &nickname, &lastMsgTime, &lastMsg); err != nil {
			log.Println("Error scanning user:", err)
			continue
		}

		users = append(users, map[string]interface{}{
			"id":            id,
			"nickname":      nickname,
			"last_msg_time": lastMsgTime.String,
			"last_msg":      lastMsg.String,
			"is_online":     h.Manager != nil && h.Manager.IsUserOnline(id),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// GetChatHistory returns messages between current user and a target, 10 at a time.
func (h *ChatHandler) GetChatHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetUserID := r.URL.Query().Get("target_id")
	if targetUserID == "" {
		http.Error(w, "Target ID required", http.StatusBadRequest)
		return
	}

	beforeStr := r.URL.Query().Get("before")
	beforeRowID, err := strconv.ParseInt(beforeStr, 10, 64)
	if err != nil || beforeRowID < 0 {
		beforeRowID = 0
	}
	limit := 10

	query := `
		SELECT rowid, id, sender_id, receiver_id, content, created_at
		FROM private_messages
		WHERE (
			(sender_id = ? AND receiver_id = ?) 
			OR (sender_id = ? AND receiver_id = ?)
		)
		AND (? = 0 OR rowid < ?)
		ORDER BY rowid DESC
		LIMIT ?
	`
	rows, err := h.DB.Query(query, userID, targetUserID, targetUserID, userID, beforeRowID, beforeRowID, limit)
	if err != nil {
		log.Println("Error fetching chat history:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var rowID int64
		var id, senderID, receiverID, content, createdAt string
		if err := rows.Scan(&rowID, &id, &senderID, &receiverID, &content, &createdAt); err != nil {
			log.Println("Error scanning message:", err)
			continue
		}
		messages = append(messages, map[string]interface{}{
			"request_id":  rowID,
			"id":          id,
			"sender_id":   senderID,
			"receiver_id": receiverID,
			"content":     content,
			"created_at":  createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// SendMessage handles HTTP fallback for sending a message
func (h *ChatHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middlewares.GetUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var input ws.SendMessagePayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if err := utils.ValidateMessageContent(input.Content); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	msgID := utils.GenerateUUID()
	timestamp := time.Now().UTC().Format(time.RFC3339)

	query := `
		INSERT INTO private_messages (id, sender_id, receiver_id, content, created_at)
		VALUES (?, ?, ?, ?, ?)
	`
	result, err := h.DB.Exec(query, msgID, userID, input.ReceiverID, input.Content, timestamp)
	if err != nil {
		log.Println("Error saving message:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	requestID, err := result.LastInsertId()
	if err != nil {
		log.Println("Error getting message request id:", err)
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	// Prepare output
	outMsgBytes, _ := json.Marshal(map[string]interface{}{
		"type": "new_message",
		"payload": map[string]interface{}{
			"request_id":  requestID,
			"id":          msgID,
			"sender_id":   userID,
			"receiver_id": input.ReceiverID,
			"content":     input.Content,
			"created_at":  timestamp,
		},
	})

	// Broadcast to Receiver if online (via WebSocket manager)
	if h.Manager != nil {
		h.Manager.SendToUser(input.ReceiverID, outMsgBytes)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	w.Write(outMsgBytes)
}
