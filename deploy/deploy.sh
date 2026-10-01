#!/usr/bin/env bash
# Sets up and (re)deploys the app on an Ubuntu 22.04 OCI instance.
# Run it from inside the project folder on the VM:  bash deploy/deploy.sh
# Safe to run again after every `git pull`.
set -euo pipefail

APP_NAME="oracle-test-app"
APP_PORT=3000
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APT="sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get"

echo "==> [1/6] Installing system packages (Node.js 22, Nginx)"
$APT update -y
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  $APT install -y nodejs
fi
$APT install -y nginx git
echo "    node $(node -v), npm $(npm -v)"

echo "==> [2/6] Installing app dependencies"
cd "$APP_DIR"
npm install --omit=dev

echo "==> [3/6] Starting the app with pm2"
command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  PORT=$APP_PORT pm2 start server.js --name "$APP_NAME"
fi
pm2 save
# Makes pm2 (and the app) start automatically when the VM reboots
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null

echo "==> [4/6] Configuring Nginx (port 80 -> $APP_PORT)"
sudo tee /etc/nginx/sites-available/$APP_NAME >/dev/null <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

echo "==> [5/6] Opening port 80 in the VM firewall (iptables)"
# Oracle's Ubuntu images end the INPUT chain with a REJECT rule,
# so the ACCEPT rule has to be inserted before it.
if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport 80 -j ACCEPT 2>/dev/null; then
  REJECT_LINE=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
  if [[ -n "$REJECT_LINE" ]]; then
    sudo iptables -I INPUT "$REJECT_LINE" -p tcp -m state --state NEW --dport 80 -j ACCEPT
  else
    sudo iptables -A INPUT -p tcp -m state --state NEW --dport 80 -j ACCEPT
  fi
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
fi

echo "==> [6/6] Checking that everything answers"
sleep 2
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" && echo "   <- app OK"
curl -fsS "http://127.0.0.1/api/health" && echo "   <- nginx OK"

PUBLIC_IP=$(curl -fsS --max-time 3 https://ifconfig.me 2>/dev/null || echo "<your-public-ip>")
echo
echo "Done. Open http://$PUBLIC_IP in your browser."
echo "If it doesn't load, add an ingress rule for TCP port 80 in the subnet's Security List (OCI Console)."
