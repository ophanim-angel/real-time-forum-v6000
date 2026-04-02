package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// SocketMessage defines our communication protocol
type SocketMessage struct {
	Type     string `json:"type"` // "message" or "typing"
	Nickname string `json:"nickname"`
	Content  string `json:"content,omitempty"`
	Time     string `json:"time,omitempty"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	clients   map[*websocket.Conn]bool
	broadcast chan SocketMessage
	mu        sync.Mutex
}

var hub = Hub{
	clients:   make(map[*websocket.Conn]bool),
	broadcast: make(chan SocketMessage),
}

func main() {
	// Hub worker: Broadcasts messages to all connected clients
	go func() {
		for {
			msg := <-hub.broadcast
			hub.mu.Lock()
			for client := range hub.clients {
				err := client.WriteJSON(msg)
				if err != nil {
					client.Close()
					delete(hub.clients, client)
				}
			}
			hub.mu.Unlock()
		}
	}()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})

	http.HandleFunc("/ws", handleWebSocket)

	fmt.Println("Server locked and loaded at :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	hub.mu.Lock()
	hub.clients[conn] = true
	hub.mu.Unlock()

	defer func() {
		hub.mu.Lock()
		delete(hub.clients, conn)
		hub.mu.Unlock()
		conn.Close()
	}()

	for {
		var msg SocketMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			break
		}
		// Send the message to the broadcast channel
		hub.broadcast <- msg
	}
}
