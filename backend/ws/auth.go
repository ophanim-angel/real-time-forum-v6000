package ws

import (
	"database/sql"
	"net/http"
	"toolKit/backend/utils"
)

func AuthenticateRequest(r *http.Request, db *sql.DB) (*utils.Session, error) {
	return utils.GetSessionFromRequest(r.Context(), db, r)
}
