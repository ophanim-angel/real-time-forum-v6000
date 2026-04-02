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
}

func (m *Manager) addClient(c *Client) {
	m.Lock()
	m.clients[c] = true
	total := len(m.clients)
	m.Unlock()

	log.Printf("Client added. Total: %d", total)
	m.broadcastPresence(c.UserID, true)
}

func (m *Manager) removeClient(c *Client) {
	m.Lock()

	if _, ok := m.clients[c]; ok {
		delete(m.clients, c)
		close(c.Send)
		total := len(m.clients)
		m.Unlock()

		log.Printf("Client removed. Total: %d", total)
		m.broadcastPresence(c.UserID, false)
		return
	}

	m.Unlock()
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

func (m *Manager) IsUserOnline(userID string) bool {
	m.RLock()
	defer m.RUnlock()

	for client := range m.clients {
		if client.UserID == userID {
			return true
		}
	}

	return false
}

func (m *Manager) broadcastPresence(userID string, isOnline bool) {
	message, err := json.Marshal(map[string]interface{}{
		"type": "presence_update",
		"payload": map[string]interface{}{
			"user_id":   userID,
			"is_online": isOnline,
		},
	})
	if err != nil {
		log.Println("Error marshaling presence update:", err)
		return
	}

	m.Broadcast(message)
}
