package ws

import (
	"encoding/json"
	"log"
	"time"

	"toolKit/backend/utils"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 10000
)

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	Manager   *Manager
	Conn      *websocket.Conn
	UserID    string
	SessionID string
	Send      chan []byte
}

// Event structure for incoming WS messages
type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// SendMessagePayload structure for private messages
type SendMessagePayload struct {
	ReceiverID string `json:"receiver_id"`
	Content    string `json:"content"`
}

type TypingPayload struct {
	ReceiverID string `json:"receiver_id"`
}

// readPump pumps messages from the websocket connection to the hub.
func (c *Client) readPump() {
	defer func() {
		c.Manager.removeClient(c)
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error { c.Conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(
				err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				websocket.CloseNoStatusReceived,
				websocket.CloseAbnormalClosure,
			) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Parse Event
		var event Event
		if err := json.Unmarshal(message, &event); err != nil {
			log.Println("Invalid event format:", err)
			continue
		}

		// Handle Events based on type
		switch event.Type {
		case "send_message":
			c.handleSendMessage(event.Payload)
		case "typing":
			c.handleTyping(event.Payload)
		case "stop_typing":
			c.handleStopTyping(event.Payload)
		default:
			log.Println("Unknown event type:", event.Type)
		}
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message.
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleSendMessage(payload json.RawMessage) {
	var data SendMessagePayload
	if err := json.Unmarshal(payload, &data); err != nil {
		log.Println("Invalid send_message payload:", err)
		return
	}

	if err := utils.ValidateMessageContent(data.Content); err != nil {
		log.Println("Message validation failed:", err)
		return
	}

	// 1. Generate message ID
	msgID := utils.GenerateUUID()
	timestamp := time.Now().UTC().Format(time.RFC3339)

	// 2. Save to database
	query := `
		INSERT INTO private_messages (id, sender_id, receiver_id, content, created_at)
		VALUES (?, ?, ?, ?, ?)
	`
	result, err := c.Manager.DB.Exec(query, msgID, c.UserID, data.ReceiverID, data.Content, timestamp)
	if err != nil {
		log.Println("Error saving message context:", err)
		return
	}

	requestID, err := result.LastInsertId()
	if err != nil {
		log.Println("Error getting message request id:", err)
		return
	}

	// 3. Send back to Sender (for local confirmation)
	outMsg := map[string]interface{}{
		"type": "new_message",
		"payload": map[string]interface{}{
			"request_id":  requestID,
			"id":          msgID,
			"sender_id":   c.UserID,
			"receiver_id": data.ReceiverID,
			"content":     data.Content,
			"created_at":  timestamp,
		},
	}
	outMsgBytes, _ := json.Marshal(outMsg)
	c.Manager.SendToConversation(c.UserID, data.ReceiverID, outMsgBytes)
}

func (c *Client) handleTyping(payload json.RawMessage) {
	var data TypingPayload
	if err := json.Unmarshal(payload, &data); err != nil {
		return
	}

	outMsgBytes, _ := json.Marshal(map[string]interface{}{
		"type": "typing",
		"payload": map[string]interface{}{
			"sender_id": c.UserID,
		},
	})
	c.Manager.SendToUser(data.ReceiverID, outMsgBytes)
}

func (c *Client) handleStopTyping(payload json.RawMessage) {
	var data TypingPayload
	if err := json.Unmarshal(payload, &data); err != nil {
		return
	}

	outMsgBytes, _ := json.Marshal(map[string]interface{}{
		"type": "stop_typing",
		"payload": map[string]interface{}{
			"sender_id": c.UserID,
		},
	})
	c.Manager.SendToUser(data.ReceiverID, outMsgBytes)
}
