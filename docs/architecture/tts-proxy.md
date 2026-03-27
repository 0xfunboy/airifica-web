# TTS Proxy

**File:** `scripts/tts-proxy.mjs`

The TTS proxy is a small Node.js HTTP server that forwards text-to-speech requests from the browser to an external TTS backend (Kokoro, OpenAI-compatible, or custom FastAPI).

---

## Why a Separate TTS Proxy?

The TTS backend (typically Kokoro running locally or on a GPU server) may require API keys and doesn't need to be exposed to the browser directly. The proxy:

1. **Hides credentials** — API keys live on the server, never in the browser
2. **Handles CORS** — adds permissive CORS headers so browser can call it from any origin
3. **Maps paths** — `/api/tts` → `/v1/audio/speech`, `/api/tts/captioned` → `/dev/captioned_speech`, etc.
4. **Logs requests** — all TTS calls are logged to `.logs/tts-proxy.log`
5. **Tracks request IDs** — correlates browser requests with backend calls

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AIRIFICA_TTS_PROXY_PORT` | `4041` | Port to listen on |
| `AIRIFICA_TTS_PROXY_TARGET_URL` | _(required)_ | Base URL of the TTS backend |
| `AIRIFICA_TTS_PROXY_TARGET_PATH` | `/v1/audio/speech` | Path for standard TTS requests |
| `AIRIFICA_TTS_PROXY_CAPTION_PATH` | `/dev/captioned_speech` | Path for captioned speech |
| `AIRIFICA_TTS_PROXY_PHONEME_PATH` | `/dev/phonemize` | Path for phoneme extraction |

---

## Path Mapping

| Browser calls | TTS Proxy forwards to |
|---|---|
| `POST /api/tts` | `POST {TARGET_URL}/v1/audio/speech` |
| `POST /api/tts/captioned` | `POST {TARGET_URL}/dev/captioned_speech` |
| `POST /api/tts/phonemes` | `POST {TARGET_URL}/dev/phonemize` |

---

## Request Flow

```
Browser
  POST /api/tts (through port-bridge → port 4041)
       │
       ▼
  tts-proxy.mjs
       ├─ Adds x-request-id
       ├─ Logs request details
       ├─ Maps path (/api/tts → /v1/audio/speech)
       ├─ Forwards body + headers to backend
       └─ Streams response back (audio/wav, audio/pcm, etc.)
       │
       ▼
  Kokoro / OpenAI-compatible TTS backend
```

---

## Supported Response Formats

The proxy streams responses as-is from the backend. Supported formats depend on the backend, but Airifica is configured for:

| Format | Use case |
|---|---|
| `wav` | Standard audio file |
| `pcm` | Raw PCM stream for Web Audio API (24kHz, 16-bit) |
| `mp3` | Compressed audio |

For streaming lip-sync, `pcm` is preferred — the browser decodes chunks in real-time as they arrive.

---

## Starting the TTS Proxy

```bash
# Development (from project root)
AIRIFICA_TTS_PROXY_TARGET_URL=http://localhost:8880 node scripts/tts-proxy.mjs

# Or via pnpm dev (starts automatically alongside Vite)
pnpm dev
```

---

## Logs

Requests are logged to `.logs/tts-proxy.log`:

```
[2026-03-21T10:00:00Z] [air3_abc123] POST /api/tts → /v1/audio/speech (200, 1.2s)
```

The `.logs/` directory is in `.gitignore`.

---

## Dev vs Production

| Mode | TTS Request Path |
|---|---|
| Development | Browser → Vite proxy `/api/tts` → tts-proxy.mjs (port 4041) |
| Production | Browser → port-bridge `/api/tts` → tts-proxy.mjs (port 4041) |

In both cases, port 4041 handles TTS. In production, port-bridge routes `/api/tts*` paths to 4041 before they would hit elizaOS on 4040.
