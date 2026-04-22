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

# tsc + vite together can blow the default V8 old-space (~512MB) on small instances
# like the EC2 t3.micro. 1.5GB is ample for our build and harmless on bigger boxes.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

echo "→ build api"
npm --workspace api run build

echo "→ build web"
npm --workspace web run build

# ── Restart the service ──────────────────────────────────────────────────────
# Try systemd (Pi pattern) first, then PM2 (EC2 pattern). Try a passwordless sudo
# restart — if sudoers.d/path-pathnotion grants it, this just works. If not, fall
# through and print the command for a human.
restart_note=""
if command -v systemctl >/dev/null 2>&1 && systemctl cat "$SERVICE_NAME.service" >/dev/null 2>&1 && sudo -n systemctl restart "$SERVICE_NAME" 2>/dev/null; then
  echo "→ systemctl restart $SERVICE_NAME"
  sudo -n systemctl status "$SERVICE_NAME" --no-pager 2>/dev/null | head -8 || true
elif command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "→ pm2 restart $SERVICE_NAME --update-env"
  pm2 restart "$SERVICE_NAME" --update-env
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
