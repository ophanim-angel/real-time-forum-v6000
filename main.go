package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"toolKit/backend/handlers"
	"toolKit/backend/middlewares"
	"toolKit/backend/ws"
	"toolKit/database"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func serveSPA(w http.ResponseWriter, statusCode int) {
	indexPath := filepath.Join("frontend", "index.html")
	content, err := os.ReadFile(indexPath)
	if err != nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(statusCode)
	_, _ = w.Write(content)
}

func isStaticAssetRequest(path string) bool {
	ext := filepath.Ext(path)
	return ext != ""
}

func serveFrontendApp(w http.ResponseWriter, r *http.Request) {
	frontendDir := http.Dir("./frontend")
	fileServer := http.FileServer(frontendDir)

	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
		http.NotFound(w, r)
		return
	}

	if isStaticAssetRequest(r.URL.Path) {
		fileServer.ServeHTTP(w, r)
		return
	}

	switch r.URL.Path {
	case "/", "/login", "/register":
		serveSPA(w, http.StatusOK)
	default:
		serveSPA(w, http.StatusNotFound)
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
	wsManager := ws.NewManager(db)
	authHandler := &handlers.AuthHandler{DB: db, Manager: wsManager}
	postHandler := &handlers.PostHandler{DB: db}
	commentHandler := &handlers.CommentHandler{DB: db}
	chatHandler := &handlers.ChatHandler{DB: db, Manager: wsManager}
	requireAuth := middlewares.RequireAuth(db)
	rateLimiter := middlewares.NewRateLimiter(20, 10*time.Second)

	// 4. Routes Configuration
	mux := http.NewServeMux()

	// --- Public Routes ---
	mux.HandleFunc("/api/register", authHandler.Register)
	mux.HandleFunc("/api/login", authHandler.Login)
	mux.HandleFunc("/api/session", authHandler.GetSession)

	// --- Protected Routes (Session Cookie) ---
	mux.Handle("/api/logout", requireAuth(http.HandlerFunc(authHandler.Logout)))

	// Posts endpoints
	mux.Handle("/api/posts", requireAuth(http.HandlerFunc(postHandler.GetPosts)))
	mux.Handle("/api/posts/create", requireAuth(http.HandlerFunc(postHandler.CreatePost)))
	mux.Handle("/api/posts/delete", requireAuth(http.HandlerFunc(postHandler.DeletePost)))
	mux.Handle("/api/posts/react", requireAuth(http.HandlerFunc(postHandler.ReactToPost)))
	mux.Handle("/api/posts/reactions", requireAuth(http.HandlerFunc(postHandler.GetPostReactions)))

	// Comments endpoints
	mux.Handle("/api/comments", requireAuth(http.HandlerFunc(commentHandler.GetComments)))
	mux.Handle("/api/comments/create", requireAuth(http.HandlerFunc(commentHandler.CreateComment)))
	mux.Handle("/api/comments/react", requireAuth(http.HandlerFunc(commentHandler.ReactToComment)))

	// Chat endpoints
	mux.Handle("/api/chat/users", requireAuth(http.HandlerFunc(chatHandler.GetUsers)))
	mux.Handle("/api/chat/history", requireAuth(http.HandlerFunc(chatHandler.GetChatHistory)))
	mux.Handle("/api/chat/send", requireAuth(http.HandlerFunc(chatHandler.SendMessage)))

	// Websocket
	mux.HandleFunc("/ws", wsManager.ServeWS)

	// --- Frontend (SPA) ---
	mux.HandleFunc("/", serveFrontendApp)

	// 5. Start Server
	log.Println("Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", rateLimiter.Middleware(mux)))
}
