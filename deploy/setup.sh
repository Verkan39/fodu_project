#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server: Docker, Node 24, Caddy and the API service.
#   ./deploy/setup.sh your.domain
set -euo pipefail

DOMAIN=${1:?usage: ./deploy/setup.sh your.domain}
REPO=$(cd "$(dirname "$0")/.." && pwd)

# The Lean container runs as uid 1000 and writes lean/.lake, so the checkout must belong to that user.
if [ "$(id -u)" != 1000 ]; then
  echo "run this as the user with uid 1000 (ubuntu on EC2), not $(whoami)" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 caddy curl
sudo usermod -aG docker "$USER"

# Ubuntu's own Node is too old: the API runs .ts files directly, which needs Node 22.18 or newer.
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo mkdir -p /var/www/tactile
sudo chown "$USER" /var/www/tactile

sed "s|@DOMAIN@|$DOMAIN|" "$REPO/deploy/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sed "s|@USER@|$USER|; s|@REPO@|$REPO|" "$REPO/deploy/tactile-api.service" \
  | sudo tee /etc/systemd/system/tactile-api.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable tactile-api
sudo systemctl reload caddy

echo
echo "Setup done. Log out and back in (so the docker group applies), then run ./deploy/deploy.sh"
