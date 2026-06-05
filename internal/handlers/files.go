package handlers

import (
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/labstack/echo/v4"
)

// proxyUser is the single File Browser account this proxy authenticates as.
//
// Access control lives entirely in liveoaks: JWTAuth + the board+ section gate
// decide who may reach /files. By the time a request arrives here it is already
// authorized, so File Browser does not need per-member identity — it just needs
// to skip its own login. We therefore map every authorized liveoaks user onto
// one fixed File Browser admin account via the proxy-auth header. This avoids
// per-user provisioning and the auto-create behaviour covered by GHSA-7526.
const proxyUser = "liveoaks"

// FilesHandler reverse-proxies the /files path to a locally-running File
// Browser (github.com/filebrowser/filebrowser) instance.
//
// File Browser runs as a separate process bound to 127.0.0.1 and is configured
// for proxy authentication: it trusts the X-Forwarded-User header this handler
// sets, and skips its own login screen. It must never be reachable except
// through this proxy — anything that can hit it directly could spoof that
// header and gain admin access.
type FilesHandler struct {
	proxy *httputil.ReverseProxy
}

// NewFilesHandler builds a reverse proxy to the File Browser upstream
// (e.g. http://127.0.0.1:8090).
func NewFilesHandler(upstream string) (*FilesHandler, error) {
	u, err := url.Parse(upstream)
	if err != nil {
		return nil, err
	}
	return &FilesHandler{proxy: httputil.NewSingleHostReverseProxy(u)}, nil
}

// Proxy forwards the request to File Browser as the fixed proxyUser. JWTAuth
// must run before this handler so that an unauthenticated request never reaches
// it. The proxy-auth header is always overwritten (never trusted from the
// client) so a client cannot supply its own identity. The real liveoaks user id
// is forwarded separately for log correlation only.
func (h *FilesHandler) Proxy(c echo.Context) error {
	req := c.Request()
	userID, _ := c.Get("user_id").(string)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	req.Header.Set("X-Forwarded-User", proxyUser)
	req.Header.Set("X-Liveoaks-User", userID)
	h.proxy.ServeHTTP(c.Response().Writer, req)
	return nil
}
