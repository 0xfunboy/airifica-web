# Port-Bridge Gateway

**File:** `scripts/port-bridge.mjs`

The port-bridge is a lightweight Node.js HTTP server that acts as the single entrypoint for the production deployment. It serves the built SPA directly from `dist/` and proxies only the allowed backend routes to downstream services.

---

## Why It Exists

In a typical Vite project, you'd run `vite preview` for production and rely on an Nginx or Caddy reverse proxy to split `/api/*` from static requests. The port-bridge replaces that setup with a single Node.js process that handles everything — no Nginx and no production dependency on `vite preview`.

Benefits:
- **One process** — easier to manage with systemd or PM2
- **Same-origin** — browser API calls never cross origins
- **No CORS** — eliminates preflight complexity entirely
- **Security headers** — full control over `Cache-Control`, CORS headers
- **API whitelist** — only known API paths reach the backend

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `AIRIFICA_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `AIRIFICA_BRIDGE_PORT` | `5173` | Listen port |

Hardcoded targets (internal only, not exposed):

| Target | Default |
|---|---|
| AIR3 backend | `127.0.0.1:4040` |
| TTS proxy | `127.0.0.1:4041` |

---

## Request Routing

```
Incoming request
       │
       ├─ Is it OPTIONS (CORS preflight)?
       │    └─ Local cross-origin dev helper only
       │
       ├─ Path in TTS_PROXY_PATHS (/api/tts, /api/tts/captioned, /api/tts/phonemes)?
       │    └─ proxy → http://127.0.0.1:4041
       │
       ├─ Path starts with /api/ ?
       │    ├─ Path in ALLOWED_API_PATHS whitelist? → proxy → http://127.0.0.1:4040
       │    └─ Not whitelisted? → 403 Forbidden
       │
       └─ Otherwise → serve from dist/ (static files)
            ├─ File exists? → serve with correct MIME type + cache headers
            └─ File missing? → serve dist/index.html (SPA fallback)
```

---

## API Endpoint Whitelist

The port-bridge maintains an explicit allowlist of API paths. Requests to unknown `/api/*` paths are rejected with `403 Forbidden` before they reach elizaOS.

```javascript
const ALLOWED_API_PATHS = new Set([
  '/api/auth/challenge',
  '/api/auth/verify',
  '/api/airi3/session',
  '/api/airi3/message',
  '/api/airi3/history',
  '/api/airi3/health',
  '/api/airi3/market-context',
  '/api/airi3/market-universe',
])

// Prefix-matched (startsWith):
// /api/airi3/proposal
// /api/airi3/pacifica/
```

---

## Static File Serving

The static server reads directly from `dist/` — the output of `pnpm build`.

### MIME Type Map

| Extension | MIME Type |
|---|---|
| `.html` | `text/html; charset=utf-8` |
| `.js` | `application/javascript; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.png` | `image/png` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.woff` | `font/woff` |
| `.woff2` | `font/woff2` |
| `.vrm` / `.vrma` | `application/octet-stream` |
| `.mp3` | `audio/mpeg` |
| `.wav` | `audio/wav` |
| `.webmanifest` | `application/manifest+json` |

### Cache Headers

| File type | Cache-Control |
|---|---|
| `.html` | `no-cache` (always revalidate) |
| All other assets | `public, max-age=31536000, immutable` |

Vite appends a content hash to all asset filenames (e.g., `index-DEZraGYg.js`), making them safe for immutable caching. Only `index.html` is not hashed and must be revalidated.

### SPA Fallback

If a requested path doesn't match any file in `dist/`, the server returns `dist/index.html`. This enables client-side routing — navigating directly to `/portfolio` or `/settings` will correctly load the Vue app, which then handles the route.

### Path Traversal Protection

```javascript
const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
```

Any `../` sequences are stripped after normalization, preventing directory traversal attacks.

---

## Proxy Behavior

When forwarding to elizaOS or the TTS proxy:

1. **Headers filtered:** `host`, `connection`, `cookie`, `x-forwarded-for`, `x-forwarded-proto`, `x-real-ip` are stripped
2. **Request ID added:** `x-request-id` is injected (forwarded from client or generated)
3. **Response streamed:** the proxy pipes the response stream directly back to the client without buffering
4. **Timeout:** 60 seconds (configurable)
5. **Error handling:** if the upstream is unreachable, returns `502 Bad Gateway`

In production the browser should use same-origin paths (`/api/...`) through the port-bridge. Explicit loopback URLs are only for local testing and debugging.

---

## Starting Port-Bridge

```bash
node scripts/port-bridge.mjs

# With custom port
AIRIFICA_BRIDGE_PORT=8080 node scripts/port-bridge.mjs

# In background (production)
node scripts/port-bridge.mjs &
```

Or with PM2:

```bash
pm2 start scripts/port-bridge.mjs --name airifica-bridge
```

---

## Verifying

```bash
# Static file serving
curl -I http://127.0.0.1:5173/

# API proxy
curl http://127.0.0.1:5173/api/airi3/health

# Blocked path (should return 403)
curl -X POST http://127.0.0.1:5173/api/airi3/admin
```
