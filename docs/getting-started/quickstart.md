# Quickstart

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | v24.9.0 | Managed via nvm |
| pnpm | 10.30.3 | Auto-installed via corepack |
| elizaOS backend | — | Running on port 4040 |
| TTS backend | — | Optional, on port 4041 |

Install nvm if not already available:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 24.9.0
nvm use 24.9.0
```

---

## 1. Clone & Install

```bash
cd /home/funboy/airifica-stack
git clone <repo-url> airifica-web
cd airifica-web

# Install dependencies (pnpm handles the workspace automatically)
pnpm install
```

---

## 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with the minimum required values:

```bash
# Point to your elizaOS backend (leave empty for same-origin in production)
VITE_AIR3_ELIZA_BASE_URL=

# Pacifica builder code (provided by AIRewardrop)
VITE_AIR3_PACIFICA_BUILDER_CODE=AIRewardrop
VITE_AIR3_PACIFICA_REFERRAL_CODE=AIRewardrop

# TTS provider: 'browser' (free) or 'openai-compatible' (needs backend)
VITE_AIR3_TTS_PROVIDER=browser
```

See [Environment Configuration](./configuration.md) for the full reference.

---

## 3. Start the elizaOS Backend

The AI backend must be running before starting the frontend.

```bash
cd /home/funboy/air3-stack/eliza-air3
source ~/.nvm/nvm.sh
nvm use 23.3.0
pnpm start dev --character='characters/bairbi.character.json'
```

ElizaOS will listen on **port 4040**.

---

## 4. Development Mode

Start the Vite dev server with the TTS proxy:

```bash
cd /home/funboy/airifica-stack/airifica-web
source ~/.nvm/nvm.sh
nvm use 24.9.0
pnpm dev
```

This spawns two processes in parallel:
- **Vite dev server** on port `5173` (with HMR)
- **TTS proxy** on port `4041`

Open [http://localhost:5173](http://localhost:5173) in your browser.

> **Note:** In dev mode, `/api/*` requests are proxied by Vite's built-in proxy to `http://127.0.0.1:4040`. The TTS proxy is handled by `scripts/tts-proxy.mjs` on port 4041.

---

## 5. Production Build

```bash
pnpm build
```

This runs `vue-tsc --noEmit` (type check) then `vite build`. The output is in `dist/`.

---

## 6. Production Mode (Port-Bridge)

Start the unified gateway:

```bash
node scripts/port-bridge.mjs
```

The port-bridge listens on **port 5173** and:
- Serves `dist/` static files directly (no Vite preview needed)
- Proxies `/api/*` to elizaOS on port 4040
- Proxies `/api/tts*` to TTS proxy on port 4041

If you also need TTS:

```bash
# In a separate terminal
AIRIFICA_TTS_PROXY_TARGET_URL=http://your-tts-host node scripts/tts-proxy.mjs
```

---

## Summary: Start Sequence

```bash
# Terminal 1: elizaOS backend
cd /home/funboy/air3-stack/eliza-air3 && nvm use 23.3.0 && pnpm start dev --character='characters/bairbi.character.json'

# Terminal 2: (optional) TTS proxy
cd /home/funboy/airifica-stack/airifica-web && node scripts/tts-proxy.mjs

# Terminal 3: port-bridge (production) OR pnpm dev (development)
cd /home/funboy/airifica-stack/airifica-web && node scripts/port-bridge.mjs
```

---

## Verify Everything Is Running

```bash
# Port-bridge health
curl http://127.0.0.1:5173/

# elizaOS health (via port-bridge)
curl http://127.0.0.1:5173/api/airi3/health

# elizaOS health (direct)
curl http://127.0.0.1:4040/api/airi3/health
```

All three should return `200 OK`.
