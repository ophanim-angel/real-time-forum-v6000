package database

import "database/sql"

// CreateTables creates all tables if they don't exist
func CreateTables(db *sql.DB) error {

	// 1. Users Table
	createUsers := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		nickname TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		first_name TEXT NOT NULL,
		last_name TEXT NOT NULL,
		age INTEGER NOT NULL,
		gender TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		is_active BOOLEAN DEFAULT 1
	);`

	// 2. Posts Table
	createPosts := `
	CREATE TABLE IF NOT EXISTS posts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		category TEXT DEFAULT 'general',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);`

	// 3. Comments Table
	createComments := `
	CREATE TABLE IF NOT EXISTS comments (
		id TEXT PRIMARY KEY,
		post_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);`

	// 4. Private Messages Table
	createMessages := `
	CREATE TABLE IF NOT EXISTS private_messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL,
		receiver_id TEXT NOT NULL,
		content TEXT NOT NULL,
		is_read BOOLEAN DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
	);`

	// 5. Post Reactions Table
	createPostReactions := `
	CREATE TABLE IF NOT EXISTS post_reactions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		post_id TEXT NOT NULL,
		type TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
		UNIQUE(user_id, post_id)
	);`

	// 6. Comment Reactions Table
	createCommentReactions := `
	CREATE TABLE IF NOT EXISTS comment_reactions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		comment_id TEXT NOT NULL,
		type TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
		UNIQUE(user_id, comment_id)
	);`

	// 7. Sessions Table
	createSessions := `
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		token_hash TEXT UNIQUE NOT NULL,
		csrf_token TEXT NOT NULL,
		expires_at DATETIME NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);`

	// Execute all queries
	queries := []string{
		createUsers,
		createPosts,
		createComments,
		createMessages,
		createPostReactions,
		createCommentReactions,
		createSessions,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return err
		}
	}

	return nil
}
