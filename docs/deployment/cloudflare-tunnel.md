# Cloudflare Tunnel

Cloudflare Tunnel (formerly Argo Tunnel) creates a secure outbound connection from your server to Cloudflare's edge, making your local service accessible via a public HTTPS URL — **without opening any inbound firewall ports**.

---

## How It Works

```
User Browser
    │  HTTPS (443)
    ▼
Cloudflare Edge (airi.airewardrop.xyz)
    │  Encrypted tunnel (outbound from server)
    ▼
cloudflared daemon (on your server)
    │  HTTP
    ▼
http://127.0.0.1:5173 (port-bridge)
```

The `cloudflared` daemon runs on your server and maintains a persistent outbound connection to Cloudflare. Incoming requests to `airi.airewardrop.xyz` are forwarded through this tunnel to port-bridge.

**Key benefit:** Your server never needs to open port 80/443. The only exposed port is a local `127.0.0.1:5173` — not reachable from the internet.

---

## Installation

```bash
# Ubuntu/Debian
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Or via package manager
sudo apt install cloudflared
```

---

## Authentication

```bash
cloudflared tunnel login
```

This opens a browser window to authenticate with your Cloudflare account. A certificate is saved to `~/.cloudflared/cert.pem`.

---

## Create the Tunnel

```bash
cloudflared tunnel create airi
```

This creates a tunnel and saves credentials to `~/.cloudflared/<tunnel-uuid>.json`.

Note the tunnel UUID — you'll need it for DNS configuration.

---

## Configuration File

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /home/funboy/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: airi.airewardrop.xyz
    service: http://127.0.0.1:5173
  - service: http_status:404
```

---

## DNS Setup

Route the subdomain through Cloudflare DNS to the tunnel:

```bash
cloudflared tunnel route dns airi airi.airewardrop.xyz
```

This creates a CNAME record: `airi.airewardrop.xyz → <tunnel-uuid>.cfargotunnel.com`

---

## Start the Tunnel

```bash
cloudflared tunnel run airi
```

Or run as a system service:

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

---

## Verify

```bash
# Check tunnel status
cloudflared tunnel info airi

# Test from outside
curl https://airi.airewardrop.xyz/api/airi3/health
```

---

## Security Notes

1. **TLS is handled by Cloudflare** — the port-bridge only needs to serve plain HTTP on `127.0.0.1`
2. **DDoS protection** — Cloudflare's network absorbs traffic before it reaches your server
3. **No open ports** — `ss -tlnp` should show `5173` bound to `127.0.0.1` only, not `0.0.0.0`
4. **Rate limiting** — configure rate limiting rules in Cloudflare dashboard to protect the `/api/airi3/message` endpoint

---

## Cloudflare Dashboard Settings

In the Cloudflare Zero Trust dashboard under your tunnel:

| Setting | Recommended Value |
|---|---|
| Min TLS Version | TLS 1.2 |
| HTTPS Only | Yes |
| Always Use HTTPS | Yes |
| HTTP/2 | Enabled |
| Browser Integrity Check | Enabled |

---

## Troubleshooting

**Tunnel shows offline:**
```bash
# Check cloudflared logs
journalctl -u cloudflared -f

# Restart
sudo systemctl restart cloudflared
```

**502 Bad Gateway:**
- Port-bridge is not running: `pgrep -f port-bridge`
- Start it: `node scripts/port-bridge.mjs &`

**SSL certificate errors:**
- Ensure the domain is using Cloudflare's nameservers
- Orange cloud (proxy) must be enabled on the DNS record
