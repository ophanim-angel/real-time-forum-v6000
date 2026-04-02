package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"toolKit/backend/handlers"
	"toolKit/backend/middlewares"
	"toolKit/backend/ws"
	"toolKit/database"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func serveFrontendApp(w http.ResponseWriter, r *http.Request) {
	frontendDir := http.Dir("./frontend")
	fileServer := http.FileServer(frontendDir)

	switch r.URL.Path {
	case "/", "/login", "/register":
		indexPath := filepath.Join("frontend", "index.html")
		if _, err := os.Stat(indexPath); err != nil {
			http.Error(w, "index.html not found", http.StatusInternalServerError)
			return
		}
		http.ServeFile(w, r, indexPath)
	default:
		fileServer.ServeHTTP(w, r)
	}
}

func main() {
	// 1. Database Connection
	var err error
	dsn := "./database/forum.db?_foreign_keys=on&_journal_mode=WAL&_synchronous=normal"
	db, err = sql.Open("sqlite3", dsn)
	if err != nil {
		log.Fatal("Error opening DB: ", err)
	}
	defer db.Close()

	if err = db.Ping(); err != nil {
		log.Fatal("Database not reachable: ", err)
	}
	db.SetMaxOpenConns(1)

	// 2. Initialize Tables
	if err = database.CreateTables(db); err != nil {
		log.Fatal("Problem while creating tables: ", err)
	}
	log.Println("Tables created successfully")

	// 3. Setup Handlers & Websocket
	authHandler := &handlers.AuthHandler{DB: db}
	postHandler := &handlers.PostHandler{DB: db}
	commentHandler := &handlers.CommentHandler{DB: db}
	wsManager := ws.NewManager(db)
	chatHandler := &handlers.ChatHandler{DB: db, Manager: wsManager}

	// 4. Routes Configuration
	mux := http.NewServeMux()

	// --- Public Routes ---
	mux.HandleFunc("/api/register", authHandler.Register)
	mux.HandleFunc("/api/login", authHandler.Login)

	// --- Protected Routes (JWT) ---
	mux.Handle("/api/logout", middlewares.RequireAuth(http.HandlerFunc(authHandler.Logout)))

	// Posts endpoints
	mux.Handle("/api/posts", middlewares.RequireAuth(http.HandlerFunc(postHandler.GetPosts)))
	mux.Handle("/api/posts/create", middlewares.RequireAuth(http.HandlerFunc(postHandler.CreatePost)))
	mux.Handle("/api/posts/delete", middlewares.RequireAuth(http.HandlerFunc(postHandler.DeletePost)))
	mux.Handle("/api/posts/react", middlewares.RequireAuth(http.HandlerFunc(postHandler.ReactToPost)))
	mux.Handle("/api/posts/reactions", middlewares.RequireAuth(http.HandlerFunc(postHandler.GetPostReactions)))

	// Comments endpoints
	mux.Handle("/api/comments", middlewares.RequireAuth(http.HandlerFunc(commentHandler.GetComments)))
	mux.Handle("/api/comments/create", middlewares.RequireAuth(http.HandlerFunc(commentHandler.CreateComment)))
	mux.Handle("/api/comments/react", middlewares.RequireAuth(http.HandlerFunc(commentHandler.ReactToComment)))

	// Chat endpoints
	mux.Handle("/api/chat/users", middlewares.RequireAuth(http.HandlerFunc(chatHandler.GetUsers)))
	mux.Handle("/api/chat/history", middlewares.RequireAuth(http.HandlerFunc(chatHandler.GetChatHistory)))
	mux.Handle("/api/chat/send", middlewares.RequireAuth(http.HandlerFunc(chatHandler.SendMessage)))

	// Websocket
	mux.HandleFunc("/ws", wsManager.ServeWS)

	// --- Frontend (SPA) ---
	mux.HandleFunc("/", serveFrontendApp)

	// 5. Start Server
	log.Println("Server starting on http://localhost:8080")
	// log.Println("Public Endpoints:")
	// log.Println("POST /api/register")
	// log.Println("POST /api/login")
	// log.Println("Protected Endpoints:")
	// log.Println("POST /api/logout")
	// log.Println("GET  /api/posts")
	// log.Println("POST /api/posts/create")
	// log.Println("DELETE /api/posts/delete")
	// log.Println("POST /api/posts/react")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
