package utils

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// === Regex Patterns ===
var (
	emailRegex    = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	nicknameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,20}$`)
	nameRegex     = regexp.MustCompile(`^[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ' \-]{0,48}[a-zA-ZÀ-ÿ]$`)
)

// ValidateEmail checks if email format is valid
func ValidateEmail(email string) bool {
	email = strings.TrimSpace(email)
	return emailRegex.MatchString(email) && len(email) <= 254
}

// ValidatePassword checks password strength
// Requirements: min 8 chars, 1 letter, 1 number
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	if len(password) >= 40 {
		return fmt.Errorf("password must be less than 40 characters")
	}

	hasLetter := false
	hasNumber := false
	for _, r := range password {
		if unicode.IsLetter(r) {
			hasLetter = true
		}
		if unicode.IsNumber(r) {
			hasNumber = true
		}
	}
	if !hasLetter || !hasNumber {
		return fmt.Errorf("password must contain at least one letter and one number")
	}
	return nil
}

// ValidateNickname checks nickname format
// Allows: letters, numbers, underscore; 3-20 chars
func ValidateNickname(nickname string) bool {
	nickname = strings.TrimSpace(nickname)
	return nicknameRegex.MatchString(nickname)
}

// ValidateName checks first/last name
func ValidateName(name string) bool {
	name = strings.TrimSpace(name)
	return nameRegex.MatchString(name)
}

// ValidateAge checks age is reasonable
func ValidateAge(age int) bool {
	return age >= 13 && age <= 120
}

// ValidateGender checks gender is one of allowed values
func ValidateGender(gender string) bool {
	gender = strings.ToLower(strings.TrimSpace(gender))
	return gender == "male" || gender == "female"
}

// ValidatePostTitle checks post title
func ValidatePostTitle(title string) error {
	title = strings.TrimSpace(title)
	if len(title) < 3 {
		return fmt.Errorf("title must be at least 3 characters")
	}
	if len(title) > 200 {
		return fmt.Errorf("title must be less than 200 characters")
	}
	return nil
}

// ValidatePostContent checks post content
func ValidatePostContent(content string) error {
	content = strings.TrimSpace(content)
	if len(content) < 3 {
		return fmt.Errorf("content must be at least 3 characters")
	}
	if len(content) > 2000 {
		return fmt.Errorf("content too long (max 2000 characters)")
	}
	return nil
}

func ValidatePostCategory(category string) error {
	category = strings.TrimSpace(category)
	if category == "" {
		return nil
	}

	allowedCategories := map[string]bool{
		"general": true,
		"science": true,
		"tech":    true,
		"art":     true,
		"gaming":  true,
	}

	categories := strings.Split(category, ",")

	errStr := "category must be one of the topics: general, science, tech, art, gaming"

	for _, cat := range categories {
		cleanCat := strings.ToLower(strings.TrimSpace(cat))

		if !allowedCategories[cleanCat] {
			return fmt.Errorf(errStr)
		}
	}

	return nil
}

// ValidateMessageContent checks private message content
func ValidateMessageContent(content string) error {
	content = strings.TrimSpace(content)
	if len(content) < 1 {
		return fmt.Errorf("message cannot be empty")
	}
	if len(content) > 500 {
		return fmt.Errorf("message too long (max 500 characters)")
	}
	return nil
}

// ValidateCredentials checks login credentials (email/nickname + password)
func ValidateCredentials(identifier, password string) error {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return fmt.Errorf("identifier cannot be empty")
	}
	if !ValidateEmail(identifier) && !ValidateNickname(identifier) {
		return fmt.Errorf("invalid email or nickname format")
	}
	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}
	return nil
}
