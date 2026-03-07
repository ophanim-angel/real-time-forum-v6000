package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"toolKit/backend/utils"

	"github.com/gorilla/websocket"
)

// Define Upgrader
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// IN PRODUCTION: Check origin
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Manager holds all connected clients
type Manager struct {
	clients map[*Client]bool
	sync.RWMutex
	DB *sql.DB
}

// NewManager creates a new websocket manager
func NewManager(db *sql.DB) *Manager {
	return &Manager{
		clients: make(map[*Client]bool),
		DB:      db,
	}
}

// ServeWS upgrades the HTTP connection to a WebSocket connection
func (m *Manager) ServeWS(w http.ResponseWriter, r *http.Request) {
	// Upgrade connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading to websocket:", err)
		return
	}

	// 1. Get token from URL query params
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		log.Println("WebSocket connection rejected: No token")
		conn.Close()
		return
	}

	// 2. Validate token format & signature
	claims, err := utils.ValidateToken(tokenString)
	if err != nil {
		log.Println("WebSocket connection rejected: Invalid token:", err)
		conn.Close()
		return
	}

	// 3. Create a new client wrapper
	client := &Client{
		Manager: m,
		Conn:    conn,
		UserID:  claims.UserID,
		Send:    make(chan []byte, 256),
	}

	// 4. Register client
	m.addClient(client)

	// 5. Start read/write pumps
	go client.readPump()
	go client.writePump()

	// 6. Broadcast online status
	m.broadcastUserStatus(claims.UserID, true)

	// Keep user online in DB
	m.DB.Exec("UPDATE users SET is_online = 1 WHERE id = ?", claims.UserID)
}

func (m *Manager) addClient(c *Client) {
	m.Lock()
	defer m.Unlock()
	m.clients[c] = true
	log.Printf("Client added. Total: %d", len(m.clients))
}

func (m *Manager) removeClient(c *Client) {
	m.Lock()
	defer m.Unlock()

	if _, ok := m.clients[c]; ok {
		delete(m.clients, c)
		close(c.Send)
		log.Printf("Client removed. Total: %d", len(m.clients))

		// Check if user has other active connections
		userOnline := false
		for client := range m.clients {
			if client.UserID == c.UserID {
				userOnline = true
				break
			}
		}

		if !userOnline {
			m.broadcastUserStatus(c.UserID, false)
			m.DB.Exec("UPDATE users SET is_online = 0 WHERE id = ?", c.UserID)
		}
	}
}

// Broadcasts an event to all connected clients
func (m *Manager) Broadcast(message []byte) {
	m.RLock()
	defer m.RUnlock()

	for client := range m.clients {
		select {
		case client.Send <- message:
		default:
			log.Println("Error sending to client, buffer full")
			client.Conn.Close()
		}
	}
}

// Broadcasts an event to a SPECIFIC user
func (m *Manager) SendToUser(userID string, message []byte) {
	m.RLock()
	defer m.RUnlock()

	for client := range m.clients {
		if client.UserID == userID {
			select {
			case client.Send <- message:
			default:
				log.Println("Error sending to specific user, buffer full")
				client.Conn.Close()
			}
		}
	}
}

func (m *Manager) broadcastUserStatus(userID string, isOnline bool) {
	statusMsg := map[string]interface{}{
		"type":      "user_status",
		"user_id":   userID,
		"is_online": isOnline,
	}
	payload, _ := json.Marshal(statusMsg)
	m.Broadcast(payload)
}
