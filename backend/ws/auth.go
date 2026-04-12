package ws

import (
	"database/sql"
	"net/http"
	"toolKit/backend/utils"
)

// AuthenticateRequest authenticates the incoming HTTP request by retrieving the session from the database.
func AuthenticateRequest(r *http.Request, db *sql.DB) (*utils.Session, error) {
	return utils.GetSessionFromRequest(r.Context(), db, r)
}
