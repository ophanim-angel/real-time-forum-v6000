package middlewares

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

type visitor struct {
	requests []time.Time
	lastSeen time.Time
}

type RateLimiter struct {
	mu              sync.Mutex
	visitors        map[string]*visitor
	maxRequests     int
	window          time.Duration
	blockStatusCode int
}

// NewRateLimiter creates a new rate limiter with specified max requests and time window, and starts cleanup goroutine.
func NewRateLimiter(maxRequests int, window time.Duration) *RateLimiter {
	limiter := &RateLimiter{
		visitors:        make(map[string]*visitor),
		maxRequests:     maxRequests,
		window:          window,
		blockStatusCode: http.StatusTooManyRequests,
	}

	go limiter.cleanupVisitors(3 * window)

	return limiter
}

// Middleware wraps an HTTP handler to enforce rate limiting based on client ID.
func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientID := clientIdentifier(r)
		if clientID == "" {
			next.ServeHTTP(w, r)
			return
		}

		allowed, retryAfter := l.allow(clientID)
		if !allowed {
			retryAfterSeconds := int(retryAfter.Seconds())
			if retryAfterSeconds < 1 {
				retryAfterSeconds = 1
			}
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfterSeconds))
			http.Error(w, "Too many requests", l.blockStatusCode)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// allow checks if a client is allowed to make a request and returns retry duration if not.
func (l *RateLimiter) allow(clientID string) (bool, time.Duration) {
	now := time.Now()
	cutoff := now.Add(-l.window)

	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.visitors[clientID]
	if !ok {
		l.visitors[clientID] = &visitor{
			requests: []time.Time{now},
			lastSeen: now,
		}
		return true, 0
	}

	filtered := entry.requests[:0]
	for _, requestTime := range entry.requests {
		if requestTime.After(cutoff) {
			filtered = append(filtered, requestTime)
		}
	}

	entry.requests = filtered
	entry.lastSeen = now

	if len(entry.requests) >= l.maxRequests {
		retryAfter := l.window - now.Sub(entry.requests[0])
		return false, retryAfter
	}

	entry.requests = append(entry.requests, now)
	return true, 0
}

// cleanupVisitors periodically removes visitors who have been idle for longer than maxIdle.
func (l *RateLimiter) cleanupVisitors(maxIdle time.Duration) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Add(-maxIdle)

		l.mu.Lock()
		for clientID, entry := range l.visitors {
			if entry.lastSeen.Before(cutoff) {
				delete(l.visitors, clientID)
			}
		}
		l.mu.Unlock()
	}
}

// clientIdentifier extracts a unique client identifier from the request, based on user ID.
func clientIdentifier(r *http.Request) string {
	userID := GetUserIDFromContext(r)
	if userID == "" {
		return ""
	}

	return "user:" + userID
}
