# Air3Client

`Air3Client` is the typed HTTP client used by the Vue SPA to communicate with the elizaOS backend. It is located in `src/lib/air3-client/client.ts` and instantiated via the factory in `src/lib/air3.ts`.

---

## Instantiation

```typescript
// src/lib/air3.ts
import { createAir3Client } from './air3-client'

const client = createAir3Client(AppConfig, session)
```

The factory merges the app config with the current wallet session to build the client config:

```typescript
interface Air3ClientConfig {
  runtimeBaseUrl: string       // e.g., '' (same-origin) or 'http://127.0.0.1:5173'
  serviceApiBaseUrl: string    // e.g., '/api' or 'http://127.0.0.1:5173/api'
  headers?: Record<string, string>  // session headers (X-Session-Identity, Authorization)
  token?: string               // JWT token
  timeoutMs?: number           // default: 20000 (20s)
}
```

---

## Methods

### `createSession()`

Create or restore a conversation session.

```typescript
async createSession(): Promise<Air3SessionResponse>

interface Air3SessionResponse {
  ok: boolean
  conversationId: string
  userId: string
  roomId: string
}
```

**Endpoint:** `POST /api/airi3/session`

---

### `sendMessage(text, conversationId?)`

Send a user message and get an AI response.

```typescript
async sendMessage(
  text: string,
  conversationId?: string
): Promise<Air3MessageEnvelope>

interface Air3MessageEnvelope {
  ok: boolean
  conversationId: string
  message: Air3MessageContent
  error?: string
}

interface Air3MessageContent {
  text: string
  image?: string
  action?: string
  proposal?: Air3TradeProposal
  meta?: Air3MessageMeta
}
```

**Endpoint:** `POST /api/airi3/message`

**Body:**
```json
{
  "text": "What's the setup on SOL?",
  "conversationId": "abc123"
}
```

---

### `getHistory(conversationId)`

Retrieve conversation history.

```typescript
async getHistory(conversationId: string): Promise<Air3HistoryResponse>

interface Air3HistoryResponse {
  ok: boolean
  history: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }>
}
```

**Endpoint:** `GET /api/airi3/history?conversationId=<id>`

---

### `getMarketContext(symbol, tf?)`

Fetch current market data.

```typescript
async getMarketContext(
  symbol: string,
  tf?: string  // default: '15m'
): Promise<Air3MarketContext>
```

**Endpoint:** `GET /api/airi3/market-context?symbol=SOL&tf=15m`

---

### `getProposal(conversationId?)`

Get the latest trade proposal.

```typescript
async getProposal(conversationId?: string): Promise<Air3ProposalResponse>

interface Air3ProposalResponse {
  ok: boolean
  proposal: Air3TradeProposal | null
}
```

**Endpoint:** `GET /api/airi3/proposal`

---

### `getPacificaOverview()`

Fetch the user's Pacifica account status and positions.

```typescript
async getPacificaOverview(): Promise<Air3PacificaOverview>
```

**Endpoint:** `GET /api/airi3/pacifica/overview`
**Requires:** `Authorization: Bearer <token>`

---

### `executeTrade(params)`

Submit a trade order to Pacifica.

```typescript
async executeTrade(params: {
  symbol: string
  side: 'long' | 'short'
  size: number          // USD size
  leverage: number
  orderType: 'market' | 'limit'
  limitPrice?: number
  takeProfitPrice?: number
  stopLossPrice?: number
}): Promise<{ ok: boolean; orderId: string }>
```

**Endpoint:** `POST /api/airi3/pacifica/execute`
**Requires:** `Authorization: Bearer <token>`

---

### `requestWalletChallenge(address)`

Get a challenge message to sign with the wallet.

```typescript
async requestWalletChallenge(address: string): Promise<Air3WalletChallengeResponse>

interface Air3WalletChallengeResponse {
  message: string  // "Sign this message to authenticate..."
}
```

**Endpoint:** `POST /api/auth/challenge`

---

### `verifyWalletSignature(address, signature, message)`

Verify a wallet signature and get a JWT.

```typescript
async verifyWalletSignature(
  address: string,
  signature: string,  // Base58-encoded
  message: string
): Promise<Air3AuthVerifyResponse>

interface Air3AuthVerifyResponse {
  token: string
  user: {
    id: string
    address: string
    isAdmin: boolean
  }
}
```

**Endpoint:** `POST /api/auth/verify`

---

## HTTP Internals

All requests go through `requestJson<T>()` in `src/lib/air3-client/http.ts`:

```typescript
async function requestJson<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T>
```

### Features

- **Request ID**: Every request gets a unique `x-request-id` (`air3_<uuid>`)
- **Timeout**: AbortController with configurable timeout (default 20s)
- **Bearer token**: Automatically injected from client config
- **Error normalization**: HTTP errors, network errors, and JSON parse errors all return consistent error objects
- **Retry**: No automatic retry — callers handle errors

### Error Format

```typescript
interface Air3Error {
  ok: false
  error: string       // human-readable message
  requestId: string   // for log correlation
  status?: number     // HTTP status code (if applicable)
}
```

---

## URL Resolution

`src/lib/air3-client/config.ts` provides URL normalization:

```typescript
// normalizeUrl handles:
// - Trailing slash removal
// - Loopback URL detection
// - sameOriginFallback: if the value is a loopback URL and the
//   app is running on a non-loopback origin, use the fallback instead
normalizeUrl(
  value: string,
  fallback: string,
  options?: { sameOriginFallback?: string }
): string
```

**Example:**
```typescript
// In production (served from https://app.eeess.cyou):
normalizeUrl('http://127.0.0.1:5173', '', { sameOriginFallback: '/' })
// → '' (same-origin: use relative paths)

// In development (served from localhost):
normalizeUrl('http://127.0.0.1:5173', '', { sameOriginFallback: '/' })
// → 'http://127.0.0.1:5173' (keep explicit host)
```
