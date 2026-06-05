#!/usr/bin/env bash
# Idempotent installer for File Browser, the file manager served behind /files.
#
# Safe to run on every deploy: each step is guarded so nothing is reinstalled,
# re-initialised, or overwritten with user data once it already exists. It never
# touches the users database after first creation, so member files and accounts
# are preserved across deploys.
#
# Run as root on 172.236.228.11 (the deploy workflow calls this for you).
set -euo pipefail

FB_BIN=/usr/local/bin/filebrowser
FB_DIR=/etc/filebrowser
FB_CONFIG="$FB_DIR/filebrowser.json"
FB_DB="$FB_DIR/filebrowser.db"
FILES_ROOT=/opt/liveoaks/files
UNIT=/etc/systemd/system/filebrowser.service

mkdir -p "$FB_DIR" "$FILES_ROOT"

# 1. Install the binary only if it is missing. Pinning the version here (rather
#    than always pulling latest) keeps deploys reproducible and avoids an
#    unexpected upgrade breaking the service. Bump this deliberately.
FB_VERSION="v2.31.2"
if [ ! -x "$FB_BIN" ]; then
  echo "Installing File Browser $FB_VERSION..."
  curl -fsSL "https://github.com/filebrowser/filebrowser/releases/download/${FB_VERSION}/linux-amd64-filebrowser.tar.gz" \
    | tar -xz -C /tmp filebrowser
  install -m 0755 /tmp/filebrowser "$FB_BIN"
  rm -f /tmp/filebrowser
else
  echo "File Browser already installed ($($FB_BIN version 2>/dev/null || echo unknown)); skipping download."
fi

# 2. Server config (port/address/root/baseURL). Copied from the repo each deploy
#    — this file holds no user data, so refreshing it is safe.
install -m 0644 /opt/liveoaks/scripts/filebrowser.json "$FB_CONFIG"

# 3. Initialise the users/settings DB once (no user data is touched after this).
if [ ! -f "$FB_DB" ]; then
  echo "Initialising File Browser database..."
  "$FB_BIN" config init -d "$FB_DB"
fi

# 4. Ensure the single proxy account exists. liveoaks authenticates as this one
#    fixed user (see internal/handlers/files.go); its password is irrelevant
#    because proxy auth never uses it. Created once, then left alone.
if ! "$FB_BIN" users ls -d "$FB_DB" 2>/dev/null | grep -qw liveoaks; then
  echo "Creating proxy user 'liveoaks'..."
  "$FB_BIN" users add liveoaks "$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
    --perm.admin -d "$FB_DB"
fi

# 5. Enforce proxy authentication on EVERY deploy. This is just a settings write
#    (no user data), so running it each time is safe — and necessary: applying
#    it only at DB-creation time means an existing database keeps showing File
#    Browser's own login page instead of trusting the liveoaks proxy header.
"$FB_BIN" config set -d "$FB_DB" \
  --auth.method=proxy \
  --auth.header=X-Forwarded-User \
  --branding.name="Live Oaks Files"

# 6. systemd unit (refreshed each deploy; contains no state).
install -m 0644 /opt/liveoaks/scripts/filebrowser.service "$UNIT"
systemctl daemon-reload
systemctl enable filebrowser >/dev/null 2>&1 || true
systemctl restart filebrowser
echo "File Browser is running on 127.0.0.1:8090, served at /files."
