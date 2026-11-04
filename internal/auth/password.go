// Package auth implements the single administrator and opaque session lifecycle.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// OWASP's Argon2id minimum: 19 MiB memory, two iterations, one lane.
const passwordParameters = "m=19456,t=2,p=1"

func validPassword(password string) bool {
	length := utf8.RuneCountInString(password)
	return utf8.ValidString(password) && length >= 12 && length <= 128
}

func hashPassword(password string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(password), salt, 2, 19*1024, 1, 32)
	return "$argon2id$v=19$" + passwordParameters + "$" + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key)
}

func verifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" || parts[3] != passwordParameters {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != 16 {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) != 32 {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, 2, 19*1024, 1, 32)
	return subtle.ConstantTimeCompare(got, want) == 1
}

func randomToken() string {
	var token [32]byte
	_, _ = rand.Read(token[:])
	return base64.RawURLEncoding.EncodeToString(token[:])
}

func digest(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func csrfToken(sessionToken string) string {
	mac := hmac.New(sha256.New, []byte(sessionToken))
	_, _ = mac.Write([]byte("nexa-home/csrf/v1"))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func tokenValid(token string) bool {
	bytes, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil && len(bytes) == 32 && len(token) == 43
}
