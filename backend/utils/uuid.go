package utils

import "github.com/gofrs/uuid"

// GenerateUUID creates a new UUID v4 string
func GenerateUUID() string {
	id, err := uuid.NewV4()
	if err != nil {
		return ""
	}
	return id.String()
}

// IsValidUUID checks if a string is a valid UUID format
func IsValidUUID(s string) bool {
	if s == "" {
		return false
	}
	_, err := uuid.FromString(s)
	return err == nil
}
