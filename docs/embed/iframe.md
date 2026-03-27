# Iframe Embedding

AIR3 Agent can be embedded in any website via an `<iframe>`. A `postMessage` protocol allows the parent page to pass wallet session data into the iframe, enabling seamless authentication without requiring the user to reconnect their wallet inside the embed.

---

## Basic Embed

```html
<iframe
  src="https://app.eeess.cyou"
  width="400"
  height="700"
  allow="microphone; autoplay"
  style="border: none; border-radius: 12px;"
></iframe>
```

The `allow="microphone"` attribute is required for voice input. `autoplay` is required for TTS audio.

---

## Session Bootstrap via postMessage

When embedding AIR3 Agent inside a parent application that manages wallet authentication, the parent can inject the session directly:

### Parent Page (sends)

```javascript
const iframe = document.getElementById('air3-iframe')

// Wait for iframe to be ready
iframe.addEventListener('load', () => {
  iframe.contentWindow.postMessage(
    {
      type: 'AIRI3_BOOTSTRAP',
      address: '0xABC...',      // wallet address (optional)
      token: 'eyJ...',          // JWT token (optional)
      guestId: 'uuid-...',      // guest ID (optional)
    },
    'https://app.eeess.cyou'    // target origin — must match VITE_AIR3_EMBED_ALLOWED_ORIGIN
  )
})
```

### What happens inside the iframe

`App.vue` listens for `AIRI3_BOOTSTRAP` messages:

```typescript
window.addEventListener('message', (event) => {
  // Validate origin
  if (event.origin !== AppConfig.embedAllowedOrigin) return
  if (event.data?.type !== 'AIRI3_BOOTSTRAP') return

  // Hydrate wallet session
  const { address, token, guestId } = event.data
  session.hydrateFromExternal({ address, token, guestId })
})
```

The session is immediately available to all composables — the user appears authenticated without going through the wallet connect flow.

---

## Configuration

### Required: Allow the parent origin

In `.env.local` before building:

```bash
VITE_AIR3_EMBED_ALLOWED_ORIGIN=https://airewardrop.xyz
```

If this is empty, the iframe still works but `postMessage` bootstrap is disabled.

### Security: Target origin verification

The `postMessage` handler always checks `event.origin === AppConfig.embedAllowedOrigin` before processing. Never use `'*'` as the target origin in production.

---

## Responsive Sizing

AIR3 Agent has a responsive layout:

| Viewport | Layout |
|---|---|
| ≥ 980px | Two-column: avatar left, chat right |
| < 980px | Single column: stacked |

For a sidebar embed (narrow):

```html
<iframe
  src="https://app.eeess.cyou"
  width="380"
  height="800"
  allow="microphone; autoplay"
  style="border: none;"
></iframe>
```

For a full-page embed:

```html
<iframe
  src="https://app.eeess.cyou"
  style="width: 100%; height: 100vh; border: none;"
  allow="microphone; autoplay"
></iframe>
```

---

## Permissions Policy

Some browsers require explicit Permissions-Policy headers to allow microphone access in iframes. On your parent page's server, add:

```http
Permissions-Policy: microphone=(self "https://app.eeess.cyou")
```

---

## Partner Integration Example

If you are building a partner integration (e.g., embedding AIR3 Agent in your DEX frontend):

```javascript
// 1. User connects their wallet on your site
const address = wallet.publicKey.toString()

// 2. Get a token from your own AIR3 Agent instance (or use eeess.cyou)
//    This step requires your own elizaOS backend with the user's address
const { token } = await fetch('https://app.eeess.cyou/api/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address, signature, message }),
}).then(r => r.json())

// 3. Inject into iframe
iframe.contentWindow.postMessage(
  { type: 'AIRI3_BOOTSTRAP', address, token },
  'https://app.eeess.cyou'
)
```

---

## Content Security Policy (CSP)

If your parent site uses CSP, add the iframe origin to `frame-src`:

```http
Content-Security-Policy: frame-src https://app.eeess.cyou
```

---

## Known Limitations

| Feature | In iframe | Notes |
|---|---|---|
| Wallet connect (in-iframe) | Limited | Phantom/Backpack may not inject into cross-origin iframes |
| Voice input | Works | Requires `allow="microphone"` on iframe |
| TTS audio | Works | Requires `allow="autoplay"` on iframe |
| Fullscreen avatar | Works | |
| Deep links to Pacifica | Works | Open in new tab |
| postMessage bootstrap | Works | Most reliable auth method for embeds |

> **Recommendation:** Always use `postMessage` bootstrap for embedding. Do not rely on the in-iframe wallet connect flow, as wallet browser extensions may not inject their `window.solana` provider in cross-origin iframes.
