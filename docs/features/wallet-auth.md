# Solana Wallet Authentication

AIR3 Agent uses Solana wallet signing for authentication. This is passwordless — the user proves ownership of a wallet address by signing a server-issued challenge message.

---

## Supported Wallets

| Wallet | Provider key |
|---|---|
| Phantom | `window.phantom.solana` or `window.solana` |
| Backpack | `window.backpack` |
| Generic | Any `window.solana` compatible provider |

Detection is handled by `src/lib/solana.ts`:

```typescript
function detectSolanaProvider(): SolanaProvider | null {
  if (typeof window === 'undefined') return null
  const p = (window as any)
  return p.phantom?.solana ?? p.backpack ?? p.solana ?? null
}
```

On mobile browsers, Phantom is not usually injected into Chrome / Edge / Opera the same way it is on desktop. AIR3 therefore falls back to an `Open in Phantom` button state when the user taps `Connect` and no injected provider is available.

---

## Authentication Flow

```
1. User clicks "Connect Wallet" (WalletConnectButton.vue)
   └─ detectSolanaProvider() → finds Phantom/Backpack

2. Wallet connection
   └─ provider.connect() → { publicKey }
   └─ address stored in localStorage

3. Challenge request
   POST /api/auth/challenge
   Body: { address: "Ehq7...3BYB" }
   Response: { message: "Sign this message to authenticate with AIR3:\nNonce: abc123\nTimestamp: 2026-03-21T..." }

4. User signs challenge
   └─ provider.signMessage(Buffer.from(message, 'utf8'))
   └─ Returns: Uint8Array signature

5. Signature verification
   POST /api/auth/verify
   Body: {
     address: "Ehq7...3BYB",
     signature: "<base58-encoded-signature>",
     message: "<original-challenge-message>"
   }
   Response: {
     token: "eyJ...",
     user: { id: "...", address: "Ehq7...3BYB", isAdmin: false }
   }

6. Token storage
   └─ token stored in sessionStorage (cleared on tab close)
   └─ All subsequent API requests include: Authorization: Bearer <token>

7. Wallet disconnect
   └─ Clears address (localStorage) + token (sessionStorage)
```

### Mobile Fallback

```
1. User taps "Connect"
2. No injected provider responds
3. Button switches state to "Open in Phantom"
4. User reopens the same URL inside Phantom's in-app browser
5. Phantom injects the Solana provider
6. Standard connect + sign flow resumes
```

---

## Session State

`src/modules/wallet/session.ts` — `useWalletSession()`:

```typescript
const {
  address,            // string | null — wallet public key (localStorage)
  token,              // string | null — JWT (sessionStorage)
  guestId,            // string — UUID for unauthenticated users (localStorage)
  sessionIdentity,    // address || guestId
  shortAddress,       // "Ehq7...3BYB" (truncated display)
  isConnected,        // !!address
  isAuthenticated,    // !!address && !!token
  hasWalletProvider,  // solana provider detected
  requestHeaders,     // { 'X-Session-Identity': ..., 'Authorization': ... }
} = useWalletSession()
```

---

## Guest Mode

Users without a Solana wallet (or who prefer not to connect) get a **guest session**:

- A UUID is generated and stored in localStorage as `guestId`
- Sent as `X-Session-Identity` header in all requests
- Allows full AI conversation
- **Cannot** execute trades (trade execution requires authentication)
- Session persists across page reloads (localStorage)

---

## Request Headers

Every API request from `Air3Client` includes:

```http
X-Session-Identity: <address or guestId>
X-Wallet-Address: <address>       # only if connected
Authorization: Bearer <token>     # only if authenticated
```

---

## Embedded Mode: External Session Injection

When AIR3 Agent is embedded in an iframe, the parent page can inject wallet session data via `postMessage`:

```javascript
// Parent page
iframe.contentWindow.postMessage({
  type: 'AIRI3_BOOTSTRAP',
  address: '0xABC...',
  token: 'eyJ...',
  guestId: 'uuid-...'
}, 'https://airi.airewardrop.xyz')
```

`App.vue` listens for this event and hydrates the wallet session without requiring the user to connect their wallet again inside the iframe.

The `VITE_AIR3_EMBED_ALLOWED_ORIGIN` environment variable restricts which parent origins are trusted:

```bash
VITE_AIR3_EMBED_ALLOWED_ORIGIN=https://airewardrop.xyz
```

---

## Encoding Utilities

`src/lib/solana.ts` provides encoding helpers:

```typescript
// Convert Uint8Array signature to Base58 (standard Solana format)
signatureToBase58(sig: Uint8Array): string

// Convert to Base64 (alternative format)
signatureToBase64(sig: Uint8Array): string

// Sign a message and return Base58 signature
signMessageBase58(message: string): Promise<string>

// Normalize an object to canonical JSON for signing
normalizeSignedPayload(obj: Record<string, unknown>): string
```

---

## JWT Token

The JWT issued by elizaOS:
- Signed with `AIRI3_AUTH_SECRET`
- Contains: `{ userId, address, isAdmin, iat, exp }`
- Stored in `sessionStorage` — cleared when the browser tab closes
- Not persistent across sessions (user must re-authenticate after browser restart)

This is intentional: a fresh signature proves current wallet control, not just historical access.
