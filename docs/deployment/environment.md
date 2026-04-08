# Full Environment Reference

Complete reference for all environment variables used across the Airifica Web stack.

---

## Variable Scopes

| Prefix | Scope | Baked at build? |
|---|---|---|
| `VITE_` | Frontend (Vue SPA) | Yes — baked into JS bundle at `pnpm build` |
| _(no prefix)_ | Backend (elizaOS) | No — read at runtime |
| `AIRIFICA_BRIDGE_*` | Port-bridge script | No — read at runtime |
| `AIRIFICA_TTS_PROXY_*` | TTS proxy script | No — read at runtime |

> **Critical:** `VITE_*` variables are baked into the bundle at build time. Changing them after building has **no effect** — you must rebuild.

---

## Frontend Variables (VITE_)

### Runtime URLs

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_ELIZA_BASE_URL` | `''` | elizaOS host. **Must be empty in production** for same-origin routing. |
| `VITE_AIR3_SERVICE_API_URL` | Same as above | Explicit API base URL |
| `VITE_AIR3_RUNTIME_BASE_URL` | Same as above | Legacy alias |
| `VITE_AIRIFICA_PUBLIC_APP_URL` | `''` | Public browser origin used by wallet/deep-link flows |

### Market

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_DEFAULT_MARKET` | `BTC` | Initial market symbol |

### Avatar

| Variable | Default | Description |
|---|---|---|
| `VITE_AIRIFICA_AVATAR_MODEL_URL` | `/brand/AIR3_Dress_Final.vrm` | VRM model URL |

### Pacifica

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_PACIFICA_TRADE_BASE_URL` | `https://app.pacifica.fi/trade` | Trade page deep-link |
| `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL` | `https://app.pacifica.fi/portfolio` | Portfolio page deep-link |
| `VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL` | `https://app.pacifica.fi/portfolio` | Deposit deep-link |
| `VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL` | `https://app.pacifica.fi/portfolio` | Withdraw deep-link |
| `VITE_AIR3_PACIFICA_BUILDER_CODE` | `AIRewardrop` | Builder code for all orders |
| `VITE_AIR3_PACIFICA_REFERRAL_CODE` | `AIRewardrop` | Referral code |
| `VITE_AIR3_PACIFICA_BUILDER_MAX_FEE_RATE` | `0.001` | Max builder fee (0.1%) |

### TTS

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_TTS_PROVIDER` | `openai-compatible` | `browser` or `openai-compatible` |
| `VITE_AIR3_TTS_BASE_URL` | `''` | TTS backend base URL |
| `VITE_AIR3_TTS_DEV_PROXY_URL` | `http://127.0.0.1:4041` | Dev proxy (tts-proxy.mjs) |
| `VITE_AIR3_TTS_SPEECH_PATH` | `/api/tts` | Standard TTS endpoint |
| `VITE_AIR3_TTS_CAPTION_PATH` | `/api/tts/captioned` | Captioned speech endpoint |
| `VITE_AIR3_TTS_PHONEME_PATH` | `/api/tts/phonemes` | Phoneme extraction endpoint |
| `VITE_AIR3_TTS_MODEL` | `tts-1` | TTS model name |
| `VITE_AIR3_TTS_VOICE` | `af_heart` | Voice preset |
| `VITE_AIR3_TTS_VOICE_MODE` | `predefined` | `predefined` or custom |
| `VITE_AIR3_TTS_RESPONSE_FORMAT` | `wav` | Audio format |
| `VITE_AIR3_TTS_STREAM_ENABLED` | `true` | Enable PCM streaming |
| `VITE_AIR3_TTS_STREAM_FORMAT` | `pcm` | Stream format |
| `VITE_AIR3_TTS_STREAM_SAMPLE_RATE` | `24000` | Sample rate (Hz) |
| `VITE_AIR3_TTS_STREAM_CHUNK_MS` | `180` | Chunk duration (ms) |
| `VITE_AIR3_TTS_SPLIT_TEXT` | `true` | Split long text before TTS |
| `VITE_AIR3_TTS_CHUNK_SIZE` | `120` | Max chars per TTS chunk |
| `VITE_AIR3_TTS_SPEED_FACTOR` | `1` | Playback speed multiplier |
| `VITE_AIR3_TTS_PHONEME_LANGUAGE` | `a` | Phoneme language code |

### STT

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_STT_PROVIDER` | `auto` | `auto`, `browser`, or `server` |
| `VITE_AIR3_STT_WS_URL` | `/api/stt/ws` | Browser-facing websocket URL for sherpa fallback |
| `VITE_AIR3_STT_CONNECT_TIMEOUT_MS` | `8000` | STT websocket connect timeout |
| `VITE_AIR3_STT_RESPONSE_TIMEOUT_MS` | `20000` | Per-utterance STT response timeout |
| `VITE_AIR3_STT_MIN_UTTERANCE_MS` | `200` | Minimum utterance duration before the client sends audio to sherpa |
| `AIRIFICA_STT_PROXY_TARGET_WS_URL` | `''` | Upstream sherpa websocket for bridge/dev proxying |

### Stage Lighting

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_STAGE_BRIGHTNESS` | `0.80` | Post-process brightness |
| `VITE_AIR3_STAGE_CONTRAST` | `1.05` | Contrast |
| `VITE_AIR3_STAGE_SATURATION` | `1.50` | Saturation |
| `VITE_AIR3_STAGE_EXPOSURE` | `0.80` | Renderer exposure |
| `VITE_AIR3_STAGE_AMBIENT_INTENSITY` | `0.00` | Ambient light |
| `VITE_AIR3_STAGE_HEMISPHERE_INTENSITY` | `0.50` | Hemisphere light |
| `VITE_AIR3_STAGE_KEY_INTENSITY` | `2.60` | Key (main) light |
| `VITE_AIR3_STAGE_RIM_INTENSITY` | `0.00` | Rim (back) light |
| `VITE_AIR3_STAGE_FILL_INTENSITY` | `1.20` | Fill (side) light |

### Branding

| Variable | Default | Description |
|---|---|---|
| `VITE_AIRIFICA_BRAND_NAME` | `Airifica` | Brand name in UI |
| `VITE_AIRIFICA_PRODUCT_NAME` | `''` | Product name override |

### Embed

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_EMBED_ALLOWED_ORIGIN` | `''` | Origin allowed for postMessage bootstrap |

---

## Backend Variables (elizaOS, no VITE_ prefix)

| Variable | Description |
|---|---|
| `AIRI3_AUTH_SECRET` | JWT signing secret (min 32 chars) |
| `AIRI3_ENCRYPTION_KEY` | Encryption key for sensitive data |
| `AIRI3_CORS_ORIGIN` | Public origin for CORS (e.g., `https://airi.airewardrop.xyz`) |
| `PACIFICA_BUILDER_CODE` | Server-side builder code for Pacifica API |
| `PACIFICA_API_BASE` | Pacifica REST API base (`https://api.pacifica.fi`) |
| `AIRI3_PACIFICA_PUBLIC_API_BASE` | Public API base (`https://api.pacifica.fi/api/v1`) |
| `AUTO_PACIFICA_API_KEY` | API key for automated Pacifica operations |
| `LLM_PROVIDER` | Primary LLM (`deepseek`, `openai`, `anthropic`, `ollama`) |
| `LLM_FALLBACK_PROVIDER` | Fallback LLM provider |
| `NODE_ENV` | `development` or `production` |

---

## Port-Bridge Variables

| Variable | Default | Description |
|---|---|---|
| `AIRIFICA_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `AIRIFICA_BRIDGE_PORT` | `5173` | Listen port |

---

## TTS Proxy Variables

| Variable | Default | Description |
|---|---|---|
| `AIRIFICA_TTS_PROXY_PORT` | `4041` | Listen port |
| `AIRIFICA_TTS_PROXY_TARGET_URL` | _(required)_ | TTS backend base URL |
| `AIRIFICA_TTS_PROXY_TARGET_PATH` | `/v1/audio/speech` | Standard speech path |
| `AIRIFICA_TTS_PROXY_CAPTION_PATH` | `/dev/captioned_speech` | Captioned speech path |
| `AIRIFICA_TTS_PROXY_PHONEME_PATH` | `/dev/phonemize` | Phoneme extraction path |

---

## Complete `.env.local` Template

```bash
# ─── FRONTEND (baked at build time) ─────────────────────────

# Runtime — leave empty in production for same-origin routing
VITE_AIR3_ELIZA_BASE_URL=
VITE_AIRIFICA_PUBLIC_APP_URL=https://airi.airewardrop.xyz

# Market
VITE_AIR3_DEFAULT_MARKET=SOL

# Pacifica
VITE_AIR3_PACIFICA_TRADE_BASE_URL=https://app.pacifica.fi/trade
VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL=https://app.pacifica.fi/portfolio
VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL=https://app.pacifica.fi/portfolio
VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL=https://app.pacifica.fi/portfolio
VITE_AIR3_PACIFICA_BUILDER_CODE=AIRewardrop
VITE_AIR3_PACIFICA_REFERRAL_CODE=AIRewardrop
VITE_AIR3_PACIFICA_BUILDER_MAX_FEE_RATE=0.001

# TTS
VITE_AIR3_TTS_PROVIDER=openai-compatible
VITE_AIR3_TTS_VOICE=af_heart
VITE_AIR3_TTS_MODEL=tts-1
VITE_AIR3_TTS_RESPONSE_FORMAT=wav
VITE_AIR3_TTS_STREAM_ENABLED=true
VITE_AIR3_TTS_STREAM_FORMAT=pcm
VITE_AIR3_TTS_STREAM_SAMPLE_RATE=24000
VITE_AIR3_TTS_STREAM_CHUNK_MS=180
VITE_AIR3_TTS_SPLIT_TEXT=true
VITE_AIR3_TTS_CHUNK_SIZE=120
VITE_AIR3_TTS_SPEED_FACTOR=1
VITE_AIR3_TTS_PHONEME_LANGUAGE=a

# STT
VITE_AIR3_STT_PROVIDER=auto
VITE_AIR3_STT_WS_URL=/api/stt/ws
VITE_AIR3_STT_CONNECT_TIMEOUT_MS=8000
VITE_AIR3_STT_RESPONSE_TIMEOUT_MS=20000
VITE_AIR3_STT_MIN_UTTERANCE_MS=200
AIRIFICA_STT_PROXY_TARGET_WS_URL=ws://192.168.178.87:6006

# Stage lighting
VITE_AIR3_STAGE_BRIGHTNESS=0.80
VITE_AIR3_STAGE_CONTRAST=1.05
VITE_AIR3_STAGE_SATURATION=1.50
VITE_AIR3_STAGE_EXPOSURE=0.80
VITE_AIR3_STAGE_AMBIENT_INTENSITY=0.00
VITE_AIR3_STAGE_HEMISPHERE_INTENSITY=0.50
VITE_AIR3_STAGE_KEY_INTENSITY=2.60
VITE_AIR3_STAGE_RIM_INTENSITY=0.00
VITE_AIR3_STAGE_FILL_INTENSITY=1.20

# Branding
VITE_AIRIFICA_BRAND_NAME=Airifica

# ─── BACKEND (elizaOS reads at runtime) ─────────────────────

AIRI3_AUTH_SECRET=your-secret-here-min-32-chars
AIRI3_CORS_ORIGIN=https://airi.airewardrop.xyz
PACIFICA_API_BASE=https://api.pacifica.fi
AIRI3_PACIFICA_PUBLIC_API_BASE=https://api.pacifica.fi/api/v1
AUTO_PACIFICA_API_KEY=your-pacifica-api-key
LLM_PROVIDER=deepseek
```
