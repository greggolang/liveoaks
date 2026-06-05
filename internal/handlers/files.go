package handlers

import (
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/labstack/echo/v4"
)

// FilesHandler reverse-proxies the /files path to a locally-running File
// Browser (github.com/filebrowser/filebrowser) instance.
//
// File Browser runs as a separate process bound to 127.0.0.1 and is configured
// for proxy authentication: it trusts the X-Forwarded-User header that this
// handler sets from the authenticated JWT, and skips its own login screen. It
// must never be reachable except through this proxy — anything that can hit it
// directly could spoof that header and impersonate any user.
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

// Proxy forwards the request to File Browser, injecting the authenticated user
// id as the proxy-auth header. JWTAuth must run before this handler so that
// user_id is populated. The header is always overwritten (never trusted from
// the client) to prevent impersonation.
func (h *FilesHandler) Proxy(c echo.Context) error {
	req := c.Request()
	userID, _ := c.Get("user_id").(string)
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	req.Header.Set("X-Forwarded-User", userID)
	h.proxy.ServeHTTP(c.Response().Writer, req)
	return nil
}
