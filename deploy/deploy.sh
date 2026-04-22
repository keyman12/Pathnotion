#!/bin/bash
# deploy.sh — pull, install, build and restart PathNotion on a target host.
#
# Works on both the Pi (test) and EC2 (prod) because the repo layout is identical.
# Run from the app directory — e.g. /opt/path/pathnotion on the Pi, or
# /home/ec2-user/pathnotion on EC2.

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="${PATHNOTION_SERVICE:-path-pathnotion}"

cd "$APP_DIR"

echo "──────────────────────────────────────────"
echo "  PathNotion — deploy"
echo "  dir:      $APP_DIR"
echo "  service:  $SERVICE_NAME"
echo "──────────────────────────────────────────"

# ── Load nvm if present so we pick up the Node version the service uses ─────
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
fi

# ── Pull latest code ────────────────────────────────────────────────────────
echo "→ git pull"
git fetch --prune origin
git checkout main
git reset --hard origin/main

# ── Install + build both workspaces ─────────────────────────────────────────
echo "→ npm ci (root + workspaces)"
npm ci

echo "→ build api"
npm --workspace api run build

echo "→ build web"
npm --workspace web run build

# ── Restart the service ──────────────────────────────────────────────────────
# systemd first, pm2 second. If the service user doesn't have sudo, we skip the
# restart and print the command for a human — building + pulling is still done.
restart_note=""
if command -v systemctl >/dev/null 2>&1 && sudo -n true 2>/dev/null && systemctl list-unit-files 2>/dev/null | grep -q "^$SERVICE_NAME.service"; then
  echo "→ systemctl restart $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl status "$SERVICE_NAME" --no-pager | head -8
elif command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "→ pm2 restart $SERVICE_NAME"
  pm2 restart "$SERVICE_NAME"
  pm2 save
else
  restart_note="Build done. Restart the service to pick up the new code:
    sudo systemctl restart $SERVICE_NAME    # (systemd hosts)
    pm2 restart $SERVICE_NAME                # (pm2 hosts)"
fi

echo ""
echo "✓ Deploy complete."
if [ -n "$restart_note" ]; then
  echo ""
  echo "$restart_note"
fi
echo "  Health:  curl -s http://127.0.0.1:\${PORT:-4000}/api/health"
