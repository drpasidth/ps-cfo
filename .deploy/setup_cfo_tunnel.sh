#!/bin/bash
# Publish the CFO app at https://cfo.biz-flow.org through a Cloudflare Tunnel.
# Run ON THE CFO DROPLET (129.212.234.187) as root:
#   bash setup_cfo_tunnel.sh
# Optional: ORIGIN=http://127.0.0.1:3001 bash setup_cfo_tunnel.sh   (see step 0)
set -euo pipefail

HOSTNAME_PUBLIC="cfo.biz-flow.org"
TUNNEL_NAME="cfo-saas"
ORIGIN="${ORIGIN:-http://127.0.0.1:80}"

echo "== 0. Which local ports are listening (pick the one that serves the app)"
ss -ltnp | grep -E ':(80|443|3001)\s' || echo "(nothing on 80/443/3001)"
echo "Origin used: $ORIGIN"

echo "== 1. Install cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb
fi
cloudflared --version

echo "== 2. Log in to Cloudflare (one time; opens a URL - authorize the biz-flow.org zone)"
if [ ! -f /root/.cloudflared/cert.pem ]; then
  cloudflared tunnel login
fi

echo "== 3. Create the tunnel if it does not exist"
if ! cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$TUNNEL_NAME"; then
  cloudflared tunnel create "$TUNNEL_NAME"
fi
TUNNEL_ID="$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')"
echo "Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"

echo "== 4. Point the DNS name at the tunnel (creates the CNAME in Cloudflare)"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME_PUBLIC" || \
  echo "DNS route already exists or failed - check the Cloudflare DNS page for $HOSTNAME_PUBLIC"

echo "== 5. Write /etc/cloudflared/config.yml"
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $HOSTNAME_PUBLIC
    service: $ORIGIN
  - service: http_status:404
EOF
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate

echo "== 6. Install and start the systemd service"
cloudflared --config /etc/cloudflared/config.yml service install || true
systemctl enable --now cloudflared
sleep 3
systemctl is-active cloudflared

echo "== 7. Test"
curl -sI "https://$HOSTNAME_PUBLIC/" | head -n 5
echo "Done. Open https://$HOSTNAME_PUBLIC"
