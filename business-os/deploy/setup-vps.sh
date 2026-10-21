#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 24.04 VPS (run as root):
#   curl -fsSL https://raw.githubusercontent.com/imranhossainalif/niha/claude/nice-wright-ngqxec/business-os/deploy/setup-vps.sh -o setup.sh
#   bash setup.sh os.example.com you@example.com
# Safe to run again: keeps an existing .env, re-pulls the code and restarts.
set -euo pipefail

DOMAIN="${1:?usage: bash setup.sh <domain> <admin-email>}"
ADMIN_EMAIL="${2:?usage: bash setup.sh <domain> <admin-email>}"
REPO="${REPO:-https://github.com/imranhossainalif/niha.git}"
BRANCH="${BRANCH:-claude/nice-wright-ngqxec}"
DIR=/opt/business-os
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }

step() { echo; echo "==> $*"; }

step "Swap (2 GB) so the build fits in 2 GB RAM"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

step "System packages, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y git curl unzip ufw ca-certificates >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

step "Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null
systemctl enable --now docker >/dev/null

step "Code ($BRANCH)"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else git clone -q --depth 1 -b "$BRANCH" "$REPO" "$DIR"; fi
APP="$DIR/business-os"
cd "$APP"

step ".env"
if [ ! -f .env ]; then
  cp .env.example .env
  rnd() { openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40; }
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|; s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rnd)|; s|^AUTH_SECRET=.*|AUTH_SECRET=$(rnd)|" .env
  chmod 600 .env
  echo "Created .env (add API keys later: nano $APP/.env, then: docker compose up -d)"
else echo "Keeping existing .env"; fi

step "Data folder"
mkdir -p data backups && chmod 777 backups
# If the handoff zip was uploaded to /root, take data/ from it
ZIP=$(ls /root/*business-os*.zip 2>/dev/null | head -1 || true)
if [ -n "$ZIP" ] && [ -z "$(ls -A data 2>/dev/null)" ]; then
  T=$(mktemp -d); unzip -q "$ZIP" -d "$T"
  SRC=$(find "$T" -maxdepth 3 -type d -name data | head -1)
  [ -n "$SRC" ] && cp -r "$SRC"/. data/ && echo "Copied data from $ZIP"
  rm -rf "$T"
fi
echo "data/ has $(find data -name '*.json' | wc -l) json files"

step "Build and start (first build takes 5-10 minutes)"
docker compose up -d --build

step "Wait for the web app"
for i in $(seq 1 60); do docker compose exec -T web wget -qO- http://localhost:3000/login >/dev/null 2>&1 && break; sleep 5; done

if [ -n "$(find data -name '*.json' | head -1)" ]; then
  step "Import data (safe to re-run)"
  docker compose exec -T web npx tsx scripts/import_data.ts data
fi

step "Done"
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
cat <<MSG
Server IP: $IP
1. DNS: A record  $DOMAIN  ->  $IP   (HTTPS starts automatically once it resolves)
2. Open https://$DOMAIN/setup and create the owner account with $ADMIN_EMAIL
3. Keys: nano $APP/.env   then   cd $APP && docker compose up -d
Logs: cd $APP && docker compose logs -f web worker
MSG
