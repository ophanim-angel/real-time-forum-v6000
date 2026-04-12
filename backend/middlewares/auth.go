package middlewares

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"toolKit/backend/utils"
)

type contextKey string

const (
	userContextKey    contextKey = "userID"
	sessionContextKey contextKey = "session"
)

// RequireAuth returns middleware that validates session and CSRF token, then adds auth info to request context.
func RequireAuth(db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, err := utils.GetSessionFromRequest(r.Context(), db, r)
			if err != nil {
				utils.ClearSessionCookie(w, isSecureRequest(r))
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			if requiresCSRFProtection(r.Method) {
				csrfToken := strings.TrimSpace(r.Header.Get("X-CSRF-Token"))
				if csrfToken == "" || csrfToken != session.CSRFToken {
					http.Error(w, "Invalid CSRF token", http.StatusForbidden)
					return
				}
			}

			ctx := context.WithValue(r.Context(), userContextKey, session.UserID)
			ctx = context.WithValue(ctx, sessionContextKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// requiresCSRFProtection returns true for methods that must be protected against CSRF.
func requiresCSRFProtection(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

// isSecureRequest checks whether the request is secure by TLS or forwarded HTTPS header.
func isSecureRequest(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// GetUserIDFromContext extracts the authenticated user ID from the request context.
func GetUserIDFromContext(r *http.Request) string {
	userID, ok := r.Context().Value(userContextKey).(string)
	if !ok {
		return ""
	}
	return userID
}

// GetSessionFromContext extracts the session object from the request context.
func GetSessionFromContext(r *http.Request) *utils.Session {
	session, ok := r.Context().Value(sessionContextKey).(*utils.Session)
	if !ok {
		return nil
	}
	return session
}
