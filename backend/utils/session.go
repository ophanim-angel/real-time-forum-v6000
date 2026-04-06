package utils

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"time"
)

const (
	SessionCookieName = "agora_session"
	SessionDuration   = 24 * time.Hour
)

type Session struct {
	ID        string
	UserID    string
	Nickname  string
	CSRFToken string
	ExpiresAt time.Time
}

func GenerateSessionToken() (string, error) {
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(randomBytes), nil
}

func HashSessionToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

func CreateSession(ctx context.Context, db *sql.DB, userID, nickname string) (*Session, string, error) {
	sessionToken, err := GenerateSessionToken()
	if err != nil {
		return nil, "", err
	}

	csrfToken, err := GenerateSessionToken()
	if err != nil {
		return nil, "", err
	}

	session := &Session{
		ID:        GenerateUUID(),
		UserID:    userID,
		Nickname:  nickname,
		CSRFToken: csrfToken,
		ExpiresAt: time.Now().UTC().Add(SessionDuration),
	}

	query := `
		INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at)
		VALUES (?, ?, ?, ?, ?)
	`
	_, err = db.ExecContext(ctx, query, session.ID, userID, HashSessionToken(sessionToken), csrfToken, session.ExpiresAt.Format(time.RFC3339))
	if err != nil {
		return nil, "", err
	}

	return session, sessionToken, nil
}

func DeleteSessionsByUserID(ctx context.Context, db *sql.DB, userID string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

func DeleteSessionByID(ctx context.Context, db *sql.DB, sessionID string) error {
	if sessionID == "" {
		return nil
	}

	_, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

func GetSessionFromRequest(ctx context.Context, db *sql.DB, r *http.Request) (*Session, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		if errors.Is(err, http.ErrNoCookie) {
			return nil, errors.New("missing session")
		}
		return nil, err
	}

	query := `
		SELECT s.id, s.user_id, u.nickname, s.csrf_token, s.expires_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND u.is_active = 1
		LIMIT 1
	`

	var session Session
	var expiresAt string
	err = db.QueryRowContext(ctx, query, HashSessionToken(cookie.Value)).Scan(
		&session.ID,
		&session.UserID,
		&session.Nickname,
		&session.CSRFToken,
		&expiresAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("invalid session")
		}
		return nil, err
	}

	session.ExpiresAt, err = time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return nil, err
	}

	if time.Now().UTC().After(session.ExpiresAt) {
		_ = DeleteSessionByID(ctx, db, session.ID)
		return nil, errors.New("session expired")
	}

	return &session, nil
}

func SetSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
	})
}

func ClearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}
