package handlers

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
)

const defaultCameraURL = "rtsp://admin:spruce2600@67.49.101.121/h264Preview_01_sub"

const restartCooldown = 10 * time.Minute
const emailAlertCooldown = 4 * time.Hour

type CameraHandler struct {
	DB          *pgxpool.Pool
	CameraToken string
	HLSDir      string
	SiteURL     string
	Mailer      interface {
		Send(to, subject, body string) error
	}

	mu              sync.Mutex
	url             string
	isUp            bool
	lastRestart     time.Time
	lastEmailAlert  time.Time
}

// Init loads the saved URL from DB and starts the background health monitor.
func (h *CameraHandler) Init() {
	h.url = defaultCameraURL
	h.isUp = true // assume up on start to avoid false alert on restart
	if saved, err := h.loadURLFromDB(); err == nil && saved != "" {
		h.url = saved
	}
	go h.runMonitor()
}

func (h *CameraHandler) checkToken(c echo.Context) bool {
	if h.CameraToken == "" {
		return true
	}
	return c.QueryParam("token") == h.CameraToken
}

func (h *CameraHandler) Status(c echo.Context) error {
	if !h.checkToken(c) {
		return c.NoContent(http.StatusForbidden)
	}
	h.mu.Lock()
	up := h.isUp
	u := h.url
	h.mu.Unlock()
	return c.JSON(http.StatusOK, map[string]interface{}{"online": up, "url": u})
}

// AdminStatus returns camera state for authenticated board/admin users.
func (h *CameraHandler) AdminStatus(c echo.Context) error {
	h.mu.Lock()
	up := h.isUp
	u := h.url
	lr := h.lastRestart
	h.mu.Unlock()
	return c.JSON(http.StatusOK, map[string]interface{}{
		"online":       up,
		"url":          u,
		"last_restart": lr,
	})
}

func (h *CameraHandler) Page(c echo.Context) error {
	if !h.checkToken(c) {
		return c.NoContent(http.StatusForbidden)
	}
	token := c.QueryParam("token")
	html := strings.ReplaceAll(cameraPageHTML, "%%TOKEN%%", token)
	return c.HTML(http.StatusOK, html)
}

func (h *CameraHandler) Proxy(c echo.Context) error {
	name := filepath.Base(c.Param("*"))
	fp := filepath.Join(h.HLSDir, name)
	switch filepath.Ext(name) {
	case ".m3u8":
		c.Response().Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		c.Response().Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	case ".ts":
		c.Response().Header().Set("Content-Type", "video/mp2t")
	}
	http.ServeFile(c.Response().Writer, c.Request(), fp)
	return nil
}

// EmbedURL returns the camera page URL (with token if configured) for
// authenticated members to use in iframes or direct links.
func (h *CameraHandler) EmbedURL(c echo.Context) error {
	h.mu.Lock()
	token := h.CameraToken
	h.mu.Unlock()
	u := "/camera"
	if token != "" {
		u += "?token=" + token
	}
	return c.JSON(http.StatusOK, map[string]string{"url": u})
}

// CameraStatus returns a human-readable status string (used by admin pages).
func (h *CameraHandler) CameraStatus() string {
	h.mu.Lock()
	u := h.url
	up := h.isUp
	h.mu.Unlock()
	state := "OFFLINE"
	if up {
		state = "ONLINE"
	}
	return fmt.Sprintf("Camera %s — %s", state, u)
}

// UpdateURL is the admin endpoint to change the RTSP stream URL at runtime.
func (h *CameraHandler) UpdateURL(c echo.Context) error {
	var req struct {
		URL string `json:"url"`
	}
	if err := c.Bind(&req); err != nil || req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url required")
	}
	if err := h.SetURL(req.URL); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]string{"url": req.URL})
}

// SetURL updates the in-memory URL and persists it to the DB.
func (h *CameraHandler) SetURL(newURL string) error {
	newURL = strings.TrimSpace(newURL)
	if !strings.HasPrefix(newURL, "rtsp://") {
		return fmt.Errorf("URL must start with rtsp://")
	}
	h.mu.Lock()
	h.url = newURL
	h.isUp = true
	h.mu.Unlock()
	h.saveURLToDB(newURL)
	return nil
}

// ---- internal ---------------------------------------------------------------

func (h *CameraHandler) runMonitor() {
	time.Sleep(2 * time.Minute)
	for range time.NewTicker(5 * time.Minute).C {
		h.checkHealth()
	}
}

func (h *CameraHandler) checkHealth() {
	h.mu.Lock()
	rtspURL := h.url
	wasUp := h.isUp
	h.mu.Unlock()

	addr := rtspTCPAddr(rtspURL)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	isUp := err == nil
	if isUp {
		conn.Close()
	}

	h.mu.Lock()
	h.isUp = isUp
	h.mu.Unlock()

	if !isUp && wasUp {
		log.Printf("[camera] offline: %s", addr)
		go h.emailAdmins("camera_down")
	} else if isUp && !wasUp {
		log.Printf("[camera] back online: %s", addr)
		go h.emailAdmins("camera_up")
	}

	if !isUp {
		h.mu.Lock()
		canRestart := time.Since(h.lastRestart) >= restartCooldown
		if canRestart {
			h.lastRestart = time.Now()
		}
		h.mu.Unlock()

		if canRestart {
			log.Printf("[camera] restarting camera-hls service")
			out, err := exec.Command("systemctl", "restart", "camera-hls").CombinedOutput()
			if err != nil {
				log.Printf("[camera] restart failed: %v — %s", err, out)
			} else {
				log.Printf("[camera] restart issued")
			}
		}
	}
}

func (h *CameraHandler) emailAdmins(event string) {
	if h.Mailer == nil {
		return
	}

	// Rate-limit "camera down" alerts; always send "back online".
	if event == "camera_down" {
		h.mu.Lock()
		canEmail := time.Since(h.lastEmailAlert) >= emailAlertCooldown
		if canEmail {
			h.lastEmailAlert = time.Now()
		}
		h.mu.Unlock()
		if !canEmail {
			return
		}
	}

	rows, err := h.DB.Query(context.Background(),
		`SELECT email FROM users
		 WHERE role IN ('admin','board') AND status = 'active' AND email != ''`)
	if err != nil {
		return
	}
	defer rows.Close()
	var emails []string
	for rows.Next() {
		var e string
		rows.Scan(&e)
		emails = append(emails, e)
	}

	var subject, body string
	if event == "camera_down" {
		subject = "Court camera is offline — Liveoaks Tennis Club"
		body = fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#dc2626">Court Camera Offline</h2>
  <p>The court camera has gone offline. The server has automatically attempted to restart the streaming service.</p>
  <p style="color:#6b7280;font-size:14px">You will receive another email when the camera comes back online.</p>
  <p style="margin-top:20px">
    <a href="%s/dashboard" style="background:#15803d;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px">View Dashboard →</a>
  </p>
</div>`, h.SiteURL)
	} else {
		subject = "Court camera is back online — Liveoaks Tennis Club"
		body = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
  <h2 style="color:#15803d">Court Camera Back Online</h2>
  <p>The court camera is back online and streaming normally.</p>
</div>`
	}

	for _, email := range emails {
		e := email
		go h.Mailer.Send(e, subject, body)
	}
}

func rtspTCPAddr(rtspURL string) string {
	u, err := url.Parse(rtspURL)
	if err != nil {
		return "unknown:554"
	}
	port := u.Port()
	if port == "" {
		port = "554"
	}
	return u.Hostname() + ":" + port
}

func (h *CameraHandler) loadURLFromDB() (string, error) {
	var val string
	err := h.DB.QueryRow(context.Background(),
		`SELECT value FROM settings WHERE key = 'camera_url'`).Scan(&val)
	return val, err
}

func (h *CameraHandler) saveURLToDB(u string) {
	_, err := h.DB.Exec(context.Background(),
		`INSERT INTO settings (key, value) VALUES ('camera_url', $1)
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, u)
	if err != nil {
		log.Printf("[camera] save URL to DB: %v", err)
	}
}

const cameraPageHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Live Camera</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #111; color: #eee;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 20px;
  }
  .topbar {
    width: 100%; max-width: 960px;
    display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
  }
  .topbar a { color: #555; text-decoration: none; font-size: 0.85rem; }
  .topbar a:hover { color: #aaa; }
  h1 {
    font-size: 1rem; font-weight: 500;
    letter-spacing: 0.05em; text-transform: uppercase; color: #888; flex: 1;
  }
  #wrap {
    position: relative; width: 100%; max-width: 960px;
    background: #000; border-radius: 8px; overflow: hidden;
    aspect-ratio: 16/9;
  }
  video { width: 100%; height: 100%; display: block; object-fit: contain; }
  #overlay {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
  }
  #overlay.hidden { display: none; }
  .off-icon { font-size: 2.5rem; opacity: 0.3; }
  .off-msg  { color: #666; font-size: 0.95rem; }
  .off-sub  { color: #444; font-size: 0.75rem; }
  #status {
    position: absolute; top: 12px; left: 12px;
    background: rgba(0,0,0,0.65); color: #eee;
    font-size: 0.75rem; padding: 4px 10px; border-radius: 4px;
  }
  #status.live { color: #4ade80; }
  #status.recovering { color: #fbbf24; }
  #fullbtn {
    position: absolute; top: 12px; right: 12px;
    background: rgba(0,0,0,0.65); border: none; color: #aaa;
    cursor: pointer; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem;
  }
  #fullbtn:hover { background: rgba(255,255,255,0.15); color: #fff; }
  #playbtn {
    display: none; position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    background: rgba(0,0,0,0.75); color: #fff;
    border: 2px solid rgba(255,255,255,0.7); border-radius: 50%;
    width: 72px; height: 72px; font-size: 1.8rem;
    cursor: pointer; transition: background 0.15s;
  }
  #playbtn:hover { background: rgba(255,255,255,0.2); }
</style>
</head>
<body>
<div class="topbar">
  <a href="/dashboard">&#8592; Dashboard</a>
  <h1>Live Camera</h1>
</div>
<div id="wrap">
  <video id="video" autoplay muted playsinline controls></video>
  <div id="overlay">
    <div class="off-icon">&#128247;</div>
    <div class="off-msg" id="off-msg">Camera offline</div>
    <div class="off-sub" id="off-sub">Checking&#8230;</div>
  </div>
  <span id="status" style="display:none">Connecting&#8230;</span>
  <button id="fullbtn" onclick="document.getElementById('wrap').requestFullscreen()">&#x26f6; Full</button>
  <button id="playbtn" onclick="video.play(); this.style.display='none'">&#9654;</button>
</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js"></script>
<script>
const video   = document.getElementById('video');
const status  = document.getElementById('status');
const overlay = document.getElementById('overlay');
const offMsg  = document.getElementById('off-msg');
const offSub  = document.getElementById('off-sub');
const playbtn = document.getElementById('playbtn');

video.addEventListener('error', (e) => {
  const err = video.error;
  console.error('video element error:', err && err.code, err && err.message);
});

if (new URLSearchParams(window.location.search).get('embed') === '1') {
  document.querySelector('.topbar').style.display = 'none';
}

const TOKEN = '%%TOKEN%%';
const SRC = '/camera/api/playlist.m3u8' + (TOKEN ? '?token=' + TOKEN : '');
const MAX_RECOVER = 6;

let hlsInst     = null;
let retryTimer  = null;
let recoverN    = 0;
let stallTimer  = null;
let lastTime    = -1;
let stallTicks  = 0;

async function checkOnline() {
  try {
    const r = await fetch('/camera/status' + (TOKEN ? '?token=' + TOKEN : ''));
    const j = await r.json();
    return j.online;
  } catch { return false; }
}

function startHls() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  overlay.classList.add('hidden');
  status.style.display = '';
  status.textContent   = 'Connecting…';
  status.className     = '';
  recoverN = 0;

  if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

  if (Hls.isSupported()) {
    hlsInst = new Hls({
      lowLatencyMode:           false,
      maxBufferLength:          4,
      maxMaxBufferLength:       8,
      backBufferLength:         4,
      enableWorker:             true,
      fragLoadingTimeOut:       20000,
      manifestLoadingTimeOut:   15000,
      levelLoadingTimeOut:      15000,
      fragLoadingMaxRetry:      8,
      manifestLoadingMaxRetry:  5,
      levelLoadingMaxRetry:     5,
    });
    hlsInst.loadSource(SRC);
    hlsInst.attachMedia(video);

    hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
      status.textContent = '● LIVE';
      status.className   = 'live';
      recoverN = 0;
      playbtn.style.display = 'none';
      video.play().catch(e => {
        console.warn('autoplay blocked:', e.name, e.message);
        playbtn.style.display = '';
      });
    });

    video.addEventListener('timeupdate', function onFirstPlay() {
      video.removeEventListener('timeupdate', onFirstPlay);
      startStallWatch();
    }, { once: true });

    hlsInst.on(Hls.Events.ERROR, (_, d) => {
      console.warn('hls error:', d.type, d.details, d.fatal);
      if (!d.fatal) return;
      recoverN++;
      if (recoverN <= MAX_RECOVER) {
        status.textContent = 'Reconnecting… (' + recoverN + '/' + MAX_RECOVER + ')';
        status.className   = 'recovering';
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setTimeout(() => { if (hlsInst) hlsInst.startLoad(); }, 1000 * recoverN);
        } else {
          hlsInst.recoverMediaError();
        }
      } else {
        stopStallWatch();
        hlsInst.destroy(); hlsInst = null;
        recoverN = 0;
        showOffline('Stream lost');
        scheduleRetry(10);
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = SRC;
    video.addEventListener('loadeddata', () => {
      status.textContent = '● LIVE'; status.className = 'live';
      startStallWatch();
    }, { once: true });
    video.play().catch(e => {
      console.warn('autoplay blocked (native):', e.name, e.message);
      playbtn.style.display = '';
    });
  } else {
    showOffline('HLS not supported in this browser');
  }
}

function startStallWatch() {
  stopStallWatch();
  lastTime = -1; stallTicks = 0;
  stallTimer = setInterval(() => {
    if (video.paused || !overlay.classList.contains('hidden')) return;
    if (video.readyState < 3) return;
    if (video.currentTime === lastTime) {
      stallTicks++;
      if (stallTicks >= 6) {
        stallTicks = 0;
        status.textContent = 'Reconnecting…';
        status.className   = 'recovering';
        startHls();
      }
    } else {
      stallTicks = 0;
      lastTime = video.currentTime;
    }
  }, 3000);
}

function stopStallWatch() {
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
}

function showOffline(msg) {
  stopStallWatch();
  playbtn.style.display = 'none';
  overlay.classList.remove('hidden');
  status.style.display = 'none';
  offMsg.textContent = 'Camera offline';
  offSub.textContent = msg || '';
}

function scheduleRetry(secs) {
  if (retryTimer) clearInterval(retryTimer);
  offSub.textContent = 'Retrying in ' + secs + 's…';
  let remaining = secs;
  retryTimer = setInterval(async () => {
    remaining--;
    if (remaining > 0) { offSub.textContent = 'Retrying in ' + remaining + 's…'; return; }
    clearInterval(retryTimer); retryTimer = null;
    offSub.textContent = 'Checking…';
    if (await checkOnline()) { startHls(); }
    else { showOffline('Camera is offline'); scheduleRetry(20); }
  }, 1000);
}

(async () => {
  if (await checkOnline()) { startHls(); }
  else { showOffline('Camera is currently offline'); scheduleRetry(15); }
})();
</script>
</body>
</html>`
