# Environment Configuration

All configuration is driven by environment variables. In development, use `.env.local`. In production, the elizaOS backend reads server-side env vars directly; the Vue SPA reads only `VITE_*` prefixed variables (baked into the build at compile time).

> **Important:** Never commit `.env.local` — it is in `.gitignore`. Use `.env.example` as the template.

---

## Runtime URLs

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_ELIZA_BASE_URL` | _(empty)_ | AIR3 runtime host. Leave empty in production so calls use same-origin (`/api/...`). Set to `http://127.0.0.1:5173` only when intentionally testing through the local gateway. |
| `VITE_AIR3_SERVICE_API_URL` | _(same as above)_ | Explicit API base URL override. Usually left empty in production. |
| `VITE_AIR3_RUNTIME_BASE_URL` | _(same as above)_ | Legacy alias for `VITE_AIR3_ELIZA_BASE_URL` |

> **Why leave it empty?** In production behind Cloudflare Tunnel, the frontend is served at `https://app.eeess.cyou` by the port-bridge. When `VITE_AIR3_ELIZA_BASE_URL` is empty, `normalizeUrl()` triggers `sameOriginFallback: '/'`, resulting in relative paths (`/api/...`) — fully same-origin, no CORS needed.

---

## Market

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_DEFAULT_MARKET` | `BTC` | Initial market symbol loaded on startup |

---

## Pacifica Integration

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_PACIFICA_TRADE_BASE_URL` | `https://app.pacifica.fi/trade` | Deep-link base for trade page |
| `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL` | `https://app.pacifica.fi/portfolio` | Deep-link for portfolio |
| `VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL` | `https://app.pacifica.fi/portfolio` | Deep-link for deposits |
| `VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL` | `https://app.pacifica.fi/portfolio` | Deep-link for withdrawals |
| `VITE_AIR3_PACIFICA_BUILDER_CODE` | `AIRewardrop` | Builder code injected into all Pacifica orders |
| `VITE_AIR3_PACIFICA_REFERRAL_CODE` | `AIRewardrop` | Referral code for new user registration |
| `VITE_AIR3_PACIFICA_BUILDER_MAX_FEE_RATE` | `0.001` | Maximum fee rate the builder charges (0.1%) |

---

## Text-to-Speech (TTS)

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_TTS_PROVIDER` | `openai-compatible` | `browser` \| `openai-compatible` — selects speech engine |
| `VITE_AIR3_TTS_BASE_URL` | _(empty)_ | TTS service base URL (required for `openai-compatible`) |
| `VITE_AIR3_TTS_DEV_PROXY_URL` | `http://127.0.0.1:4041` | Dev proxy target (used by tts-proxy.mjs) |
| `VITE_AIR3_TTS_SPEECH_PATH` | `/api/tts` | Path for basic TTS requests |
| `VITE_AIR3_TTS_CAPTION_PATH` | `/api/tts/captioned` | Path for captioned speech (word timestamps) |
| `VITE_AIR3_TTS_PHONEME_PATH` | `/api/tts/phonemes` | Path for phoneme extraction (lip-sync) |
| `VITE_AIR3_TTS_MODEL` | `tts-1` | Model name sent to TTS backend |
| `VITE_AIR3_TTS_VOICE` | `af_heart` | Voice preset (Kokoro voice ID) |
| `VITE_AIR3_TTS_VOICE_MODE` | `predefined` | `predefined` \| custom |
| `VITE_AIR3_TTS_RESPONSE_FORMAT` | `wav` | Audio format: `wav` \| `pcm` \| `mp3` |
| `VITE_AIR3_TTS_STREAM_ENABLED` | `true` | Enable PCM audio streaming |
| `VITE_AIR3_TTS_STREAM_FORMAT` | `pcm` | Streaming format (must be `pcm`) |
| `VITE_AIR3_TTS_STREAM_SAMPLE_RATE` | `24000` | PCM sample rate in Hz |
| `VITE_AIR3_TTS_STREAM_CHUNK_MS` | `180` | Chunk duration in milliseconds |
| `VITE_AIR3_TTS_SPLIT_TEXT` | `true` | Split long text before sending to TTS |
| `VITE_AIR3_TTS_CHUNK_SIZE` | `120` | Max characters per TTS chunk |
| `VITE_AIR3_TTS_SPEED_FACTOR` | `1` | Playback speed (1.0 = normal) |
| `VITE_AIR3_TTS_PHONEME_LANGUAGE` | `a` | Phoneme language code (`a` = auto) |

---

## Speech-to-Text (STT)

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_STT_PROVIDER` | `auto` | `auto` \| `browser` \| `server` |
| `VITE_AIR3_STT_WS_URL` | `/api/stt/ws` | Browser-facing websocket URL for server STT |
| `VITE_AIR3_STT_CONNECT_TIMEOUT_MS` | `8000` | WebSocket connection timeout |
| `VITE_AIR3_STT_RESPONSE_TIMEOUT_MS` | `20000` | Per-utterance transcription timeout |
| `AIRIFICA_STT_PROXY_TARGET_WS_URL` | _(empty)_ | Bridge/dev upstream target for sherpa-onnx websocket, e.g. `ws://192.168.178.87:6006` |

### Recommended mode

For production behind HTTPS, prefer:

```bash
VITE_AIR3_STT_PROVIDER=auto
VITE_AIR3_STT_WS_URL=/api/stt/ws
AIRIFICA_STT_PROXY_TARGET_WS_URL=ws://192.168.178.87:6006
```

This keeps the browser same-origin while the local bridge proxies websocket traffic to the LAN STT server.

---

## Stage Lighting (Three.js)

Fine-tune the avatar's visual appearance. These are passed to the Three.js lighting rig at runtime.

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_STAGE_BRIGHTNESS` | `0.80` | Overall brightness (post-process) |
| `VITE_AIR3_STAGE_CONTRAST` | `1.05` | Contrast multiplier |
| `VITE_AIR3_STAGE_SATURATION` | `1.50` | Color saturation |
| `VITE_AIR3_STAGE_EXPOSURE` | `0.80` | Renderer exposure |
| `VITE_AIR3_STAGE_AMBIENT_INTENSITY` | `0.00` | Ambient light strength |
| `VITE_AIR3_STAGE_HEMISPHERE_INTENSITY` | `0.50` | Hemisphere sky/ground light |
| `VITE_AIR3_STAGE_KEY_INTENSITY` | `2.60` | Main key light (front) |
| `VITE_AIR3_STAGE_RIM_INTENSITY` | `0.00` | Rim/back light |
| `VITE_AIR3_STAGE_FILL_INTENSITY` | `1.20` | Fill light (side) |

---

## Avatar

| Variable | Default | Description |
|---|---|---|
| `VITE_AIRIFICA_AVATAR_MODEL_URL` | `/brand/AIR3_Dress_Final.vrm` | URL to a custom VRM model |

---

## Branding

| Variable | Default | Description |
|---|---|---|
| `VITE_AIRIFICA_BRAND_NAME` | `Airifica` | Brand name shown in UI |
| `VITE_AIRIFICA_PRODUCT_NAME` | _(empty)_ | Product name override |

---

## Embed Mode

| Variable | Default | Description |
|---|---|---|
| `VITE_AIR3_EMBED_ALLOWED_ORIGIN` | _(empty)_ | The origin allowed to send `postMessage` bootstrap events. Required when embedding in an iframe. |

---

## Backend-Only Variables

These are read by the elizaOS server process, **not** the Vue SPA (no `VITE_` prefix):

| Variable | Description |
|---|---|
| `AIRI3_AUTH_SECRET` | JWT signing secret for wallet authentication |
| `AIRI3_ENCRYPTION_KEY` | Encryption key for sensitive data |
| `AIRI3_CORS_ORIGIN` | Allowed CORS origin(s) for the elizaOS API |
| `PACIFICA_BUILDER_CODE` | Server-side builder code for Pacifica API calls |
| `PACIFICA_API_BASE` | `https://api.pacifica.fi` |
| `AIRI3_PACIFICA_PUBLIC_API_BASE` | `https://api.pacifica.fi/api/v1` |
| `AUTO_PACIFICA_API_KEY` | Optional API key for automated Pacifica operations |

---

## Minimal Production `.env.local`

```bash
# SPA (baked at build time)
VITE_AIR3_ELIZA_BASE_URL=
VITE_AIR3_DEFAULT_MARKET=SOL
VITE_AIR3_PACIFICA_BUILDER_CODE=AIRewardrop
VITE_AIR3_PACIFICA_REFERRAL_CODE=AIRewardrop
VITE_AIR3_TTS_PROVIDER=openai-compatible

# Backend (elizaOS reads these at runtime)
AIRI3_AUTH_SECRET=change-me
AIRI3_CORS_ORIGIN=https://app.eeess.cyou
PACIFICA_API_BASE=https://api.pacifica.fi
AIRI3_PACIFICA_PUBLIC_API_BASE=https://api.pacifica.fi/api/v1
```
