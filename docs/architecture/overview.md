# System Architecture

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Tunnel                           │
│          airi.airewardrop.xyz → http://127.0.0.1:5173            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Port-Bridge (Node.js, port 5173)                  │
│                   scripts/port-bridge.mjs                       │
│                                                                 │
│  GET /           →  serve dist/index.html                       │
│  GET /assets/*   →  serve dist/assets/* (immutable cache)       │
│  GET /brand/*    →  serve dist/brand/*                          │
│  POST /api/*     →  proxy → elizaOS (port 4040)                 │
│  /api/tts*       →  proxy → TTS Proxy (port 4041)               │
│  /api/stt/ws     →  proxy → sherpa websocket (optional)         │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌─────────────────────────────────────┐
│   dist/ (Vue SPA)│      │  elizaOS / AIR3 Backend (port 4040) │
│   Vite build     │      │  packages/client-airi3/src/server.ts │
│                  │      │                                      │
│  Three.js        │      │  Express.js + elizaOS runtime        │
│  VRM Avatar      │      │  DeepSeek LLM (+ fallbacks)          │
│  Web Audio       │      │  Pacifica API client                 │
│  VAD Worker      │      │  JWT authentication                  │
└──────────────────┘      └──────────────────┬───────────────────┘
                                             │
                          ┌──────────────────┴──────────────────┐
                          │         TTS Proxy (port 4041)        │
                          │         scripts/tts-proxy.mjs        │
                          │                                      │
                          │  Forwards to Kokoro / OpenAI-compat  │
                          │  Supports: speech, captioned, phoneme│
                          └─────────────────────────────────────┘
```

---

## Why This Architecture

### Single Entrypoint

The **port-bridge** is the single HTTP entrypoint for everything. The browser never makes cross-origin requests in production:

- All pages are served from `https://airi.airewardrop.xyz` (via port-bridge)
- All API calls go to `https://airi.airewardrop.xyz/api/*` (same origin)
- No CORS preflight is ever needed

This was a deliberate design decision to eliminate the CORS complexity that arises when a SPA and its API live on different ports/domains.

### No Vite Preview in Production

In earlier versions, port-bridge proxied static file requests to a `vite preview` process on port 4173 (two-port setup). The current implementation serves `dist/` directly with a native Node.js static file server, so:

- One fewer process to manage
- No port 4173 to keep alive
- Correct `Cache-Control` headers (`immutable` for hashed assets, `no-cache` for HTML)
- Path traversal protection built-in

### elizaOS Isolation

elizaOS on port 4040 is never exposed to the public internet. It only accepts connections from the port-bridge (localhost). The CORS configuration on the elizaOS side permits `!origin` requests (no Origin header), which is exactly what the port-bridge sends when proxying.

---

## Process Map

| Process | Port | Script | Started by |
|---|---|---|---|
| Port-Bridge | 5173 | `scripts/port-bridge.mjs` | systemd / manual |
| elizaOS backend | 4040 | `eliza-air3/...` | systemd / manual |
| TTS Proxy | 4041 | `scripts/tts-proxy.mjs` | systemd / manual |
| sherpa STT upstream | external WS | proxied via `/api/stt/ws` | optional |
| Vite dev server | 5173 | `pnpm dev` | dev only |

---

## Request Flow: Message Submission

```
1. User types message → ConversationCard.vue
   └─ useConversation() adds optimistic message

2. Air3Client.sendMessage(text, conversationId)
   └─ POST /api/airi3/message
   └─ Headers: X-Session-Identity, Authorization (if auth'd)

3. port-bridge receives POST /api/airi3/message
   └─ Validates path against ALLOWED_API_PATHS whitelist
   └─ Strips sensitive headers (cookie, host, x-forwarded-*)
   └─ Forwards to http://127.0.0.1:4040/api/airi3/message

4. elizaOS server.ts handles message
   ├─ Verifies JWT token (if present)
   ├─ Loads conversation history from memory
   ├─ Fetches market context (price, candles, funding rate)
   ├─ Fetches Pacifica account snapshot (balance, positions)
   ├─ Builds prompt from bairbi.character.json + context
   ├─ Routes to DeepSeek LLM (25s timeout)
   │   ├─ Generates text response
   │   └─ Optionally generates trade proposal
   └─ Returns Air3MessageEnvelope JSON

5. port-bridge streams response back to browser

6. Vue frontend:
   ├─ Renders text response in ConversationCard
   ├─ Renders TradeProposalCard if proposal present
   └─ Triggers TTS synthesis → avatar lip-sync + audio
```

---

## Security Boundaries

| Boundary | Mechanism |
|---|---|
| Public → Port-Bridge | Cloudflare Tunnel (TLS termination, DDoS protection) |
| Port-Bridge → elizaOS | localhost only, header stripping |
| API endpoint whitelist | `ALLOWED_API_PATHS` set in port-bridge |
| Auth | JWT signed with `AIRI3_AUTH_SECRET` |
| Wallet verification | Solana message signing (ed25519) |
| Static assets | Path traversal prevention (`path.normalize` + strip `../`) |
| STT transport | same-origin websocket proxy or explicitly configured secure websocket URL |
