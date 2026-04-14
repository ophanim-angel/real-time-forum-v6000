package ws

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Define Upgrader
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}

		parsedOrigin, err := url.Parse(origin)
		if err != nil {
			return false
		}

		return parsedOrigin.Host == r.Host
	},
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
	session, err := AuthenticateRequest(r, m.DB)
	if err != nil {
		log.Println("WebSocket connection rejected:", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Upgrade connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading to websocket:", err)
		return
	}

	// 1. Create a new client wrapper
	client := &Client{
		Manager:   m,
		Conn:      conn,
		UserID:    session.UserID,
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
	}

	// 2. Register client
	m.addClient(client)

	// 3. Start read/write pumps
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

func (m *Manager) DisconnectUserSessions(userID, excludeSessionID string) {
	m.RLock()
	var targets []*Client
	for client := range m.clients {
		if client.UserID == userID && client.SessionID != excludeSessionID {
			targets = append(targets, client)
		}
	}
	m.RUnlock()

	if len(targets) == 0 {
		return
	}

	payload, err := json.Marshal(map[string]interface{}{
		"type": "session_revoked",
		"payload": map[string]interface{}{
			"message": "Your session was replaced by a new login.",
		},
	})
	if err != nil {
		log.Println("Error marshaling session revoked message:", err)
	}

	for _, client := range targets {
		if payload != nil {
			select {
			case client.Send <- payload:
			default:
			}
		}
		_ = client.Conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "session revoked"), time.Now().Add(writeWait))
		_ = client.Conn.Close()
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

func (m *Manager) BroadcastUserRegistered(userID, nickname string) {
	message, err := json.Marshal(map[string]interface{}{
		"type": "user_registered",
		"payload": map[string]interface{}{
			"id":            userID,
			"nickname":      nickname,
			"last_msg_time": "",
			"last_msg":      "",
			"is_online":     false,
		},
	})
	if err != nil {
		log.Println("Error marshaling user registered message:", err)
		return
	}

	m.Broadcast(message)
}

// SendToConversation sends message to ALL active sessions of both participants
func (m *Manager) SendToConversation(senderID, receiverID string, message []byte) {
	m.RLock()
	defer m.RUnlock()

	for client := range m.clients {
		if client.UserID == senderID || client.UserID == receiverID {
			select {
			case client.Send <- message:
			default:
				log.Printf("Channel full for client %s, closing connection", client.UserID)
				client.Conn.Close()
			}
		}
	}
}
