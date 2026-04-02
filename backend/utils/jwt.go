package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// IMPORTANT: Bddel had l key f production!
var JwtSecret = []byte("super_secret_key_change_this_later_123")

// Claims: Shno ghadi n7to jwa l token (User ID, Nickname, Expiration)
type Claims struct {
	UserID   string `json:"user_id"`
	Nickname string `json:"nickname"`
	Exp      int64  `json:"exp"` // Expiration time (Unix timestamp)
}

// Helper: Base64 encoding bla padding (JWT standard)
func base64UrlEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

// Helper: Base64 decoding b padding
func base64UrlDecode(s string) ([]byte, error) {
	// Zid padding ila kan naqes
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

// GenerateToken: Kaycrée token jdid
func GenerateToken(userID, nickname string) (string, error) {
	// 1. Header
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}
	headerJSON, _ := json.Marshal(header)
	headerEncoded := base64UrlEncode(headerJSON)

	// 2. Payload (Claims)
	claims := Claims{
		UserID:   userID,
		Nickname: nickname,
		Exp:      time.Now().Add(24 * time.Hour).Unix(), // Token ymout ba3d 24h
	}
	claimsJSON, _ := json.Marshal(claims)
	claimsEncoded := base64UrlEncode(claimsJSON)

	// 3. Signature (Protection)
	signatureInput := headerEncoded + "." + claimsEncoded
	h := hmac.New(sha256.New, JwtSecret)
	h.Write([]byte(signatureInput))
	signature := h.Sum(nil)
	signatureEncoded := base64UrlEncode(signature)

	// 4. Join them
	return headerEncoded + "." + claimsEncoded + "." + signatureEncoded, nil
}

// ValidateToken: Kaychecki wash token sahih
func ValidateToken(tokenString string) (*Claims, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}

	// 1. Verify Signature
	signatureInput := parts[0] + "." + parts[1]
	h := hmac.New(sha256.New, JwtSecret)
	h.Write([]byte(signatureInput))
	expectedSig := h.Sum(nil)

	actualSig, err := base64UrlDecode(parts[2])
	if err != nil {
		return nil, errors.New("invalid signature")
	}
	if !hmac.Equal(expectedSig, actualSig) {
		return nil, errors.New("invalid signature")
	}

	// 2. Decode Payload
	payloadBytes, err := base64UrlDecode(parts[1])
	if err != nil {
		return nil, errors.New("invalid payload")
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errors.New("invalid payload json")
	}

	// 3. Check Expiration
	if time.Now().Unix() > claims.Exp {
		return nil, errors.New("token expired")
	}

	return &claims, nil
}
