# Production Deployment

This guide covers deploying Airifica Web to a Linux server using Cloudflare Tunnel as the public HTTPS endpoint.

---

## Stack in Production

```
Internet
  └─ Cloudflare (TLS, DDoS, CDN)
       └─ Cloudflare Tunnel
            └─ https://app.eeess.cyou → http://127.0.0.1:5173
                 └─ port-bridge.mjs (port 5173)
                      ├─ dist/        (Vue SPA static files)
                      ├─ :4040        (elizaOS backend)
                      └─ :4041        (TTS proxy, optional)
```

---

## Step-by-Step Deployment

### 1. Build the Frontend

```bash
cd /home/funboy/airifica-stack/airifica-web

# Ensure correct Node version
source ~/.nvm/nvm.sh
nvm use 24.9.0

# Set production env
cp .env.example .env.local
# Edit .env.local:
#   VITE_AIR3_ELIZA_BASE_URL=  (empty — same-origin)
#   VITE_AIR3_PACIFICA_BUILDER_CODE=AIRewardrop
#   VITE_AIR3_TTS_PROVIDER=openai-compatible

# Install deps
pnpm install

# Build
pnpm build
```

Output: `dist/` directory.

### 2. Start elizaOS Backend

```bash
cd /home/funboy/air3-stack/eliza-air3
source ~/.nvm/nvm.sh && nvm use 23.3.0
pnpm start dev --character='characters/bairbi.character.json'
```

Verify: `curl http://127.0.0.1:4040/api/airi3/health`

### 3. Start TTS Proxy (optional)

```bash
cd /home/funboy/airifica-stack/airifica-web
AIRIFICA_TTS_PROXY_TARGET_URL=http://your-tts-host:8880 \
node scripts/tts-proxy.mjs
```

### 4. Start Port-Bridge

```bash
cd /home/funboy/airifica-stack/airifica-web
node scripts/port-bridge.mjs
```

Verify:
```bash
curl http://127.0.0.1:5173/
curl http://127.0.0.1:5173/api/airi3/health
```

### 5. Configure Cloudflare Tunnel

See [Cloudflare Tunnel](./cloudflare-tunnel.md).

---

## Process Management with PM2

Install PM2:

```bash
npm install -g pm2
```

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'airifica-bridge',
      script: '/home/funboy/airifica-stack/airifica-web/scripts/port-bridge.mjs',
      interpreter: '/home/funboy/.nvm/versions/node/v24.9.0/bin/node',
      env: {
        AIRIFICA_BRIDGE_PORT: '5173',
        AIRIFICA_BRIDGE_HOST: '127.0.0.1',
      },
    },
    {
      name: 'airifica-tts',
      script: '/home/funboy/airifica-stack/airifica-web/scripts/tts-proxy.mjs',
      interpreter: '/home/funboy/.nvm/versions/node/v24.9.0/bin/node',
      env: {
        AIRIFICA_TTS_PROXY_PORT: '4041',
        AIRIFICA_TTS_PROXY_TARGET_URL: 'http://127.0.0.1:8880',
      },
    },
  ],
}
```

Start all services:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # auto-start on system boot
```

---

## Deployment Checklist

Before each production deployment:

- [ ] `.env.local` has `VITE_AIR3_ELIZA_BASE_URL=` (empty — not localhost!)
- [ ] `pnpm build` completed without TypeScript errors
- [ ] `dist/` directory exists and contains `index.html`
- [ ] elizaOS is running on port 4040 (`curl :4040/api/airi3/health → 200`)
- [ ] port-bridge restarted after build (`kill <old-pid> && node scripts/port-bridge.mjs &`)
- [ ] Cloudflare Tunnel is connected (green in dashboard)
- [ ] Production smoke test: visit `https://app.eeess.cyou`, send a test message

---

## Zero-Downtime Redeploy

```bash
# 1. Build new dist (port-bridge still serves old dist)
pnpm build

# 2. Restart port-bridge (< 1s downtime)
kill $(pgrep -f port-bridge)
node /home/funboy/airifica-stack/airifica-web/scripts/port-bridge.mjs &

# 3. Verify
curl http://127.0.0.1:5173/api/airi3/health
```

Since port-bridge reads static files from `dist/` on every request, the new files are served immediately after restart. The Cloudflare Tunnel reconnects automatically within seconds.

---

## Logs

```bash
# port-bridge stdout (if started in background)
# → redirect to a log file:
node scripts/port-bridge.mjs >> /home/funboy/airifica-stack/airifica-web/.logs/bridge.log 2>&1 &

# TTS proxy logs
tail -f /home/funboy/airifica-stack/airifica-web/.logs/tts-proxy.log

# elizaOS logs
# → depends on elizaOS logging configuration
```

---

## Health Checks

| Check | Command | Expected |
|---|---|---|
| Port-bridge up | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/` | `200` |
| API proxy | `curl -s http://127.0.0.1:5173/api/airi3/health` | `{"ok":true}` |
| elizaOS direct | `curl -s http://127.0.0.1:4040/api/airi3/health` | `{"ok":true}` |
| TTS proxy | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4041/` | `200` |
| Public URL | `curl -s https://app.eeess.cyou/api/airi3/health` | `{"ok":true}` |
