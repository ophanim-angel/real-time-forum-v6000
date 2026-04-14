package middlewares

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"strings"
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

func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldSkipRateLimit(r) {
			next.ServeHTTP(w, r)
			return
		}

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

			log.Printf(
				"rate limit triggered for ip=%s method=%s path=%s retry_after=%ds",
				clientID,
				r.Method,
				r.URL.Path,
				retryAfterSeconds,
			)

			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfterSeconds))
			http.Error(
				w,
				fmt.Sprintf("Too many requests. Please wait %d second(s) and try again.", retryAfterSeconds),
				l.blockStatusCode,
			)
			return
		}

		next.ServeHTTP(w, r)
	})
}

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

func clientIdentifier(r *http.Request) string {
	forwardedFor := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}

	realIP := strings.TrimSpace(r.Header.Get("X-Real-IP"))
	if realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}

	return strings.TrimSpace(host)
}

func shouldSkipRateLimit(r *http.Request) bool {
	if isWebSocketRequest(r) {
		return true
	}

	return filepath.Ext(r.URL.Path) != ""
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("Upgrade")), "websocket")
}
