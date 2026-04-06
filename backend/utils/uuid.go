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
