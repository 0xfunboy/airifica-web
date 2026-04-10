# API Endpoints

All endpoints are served through the port-bridge at `https://airi.airewardrop.xyz` (production) or `http://127.0.0.1:5173` (local). The elizaOS backend handles them on port 4040.

---

## Authentication

Most endpoints accept an optional `Authorization: Bearer <token>` header. Without it, the request is treated as a guest session (identified by `X-Session-Identity`).

Trade execution endpoints **require** authentication.

### Common Request Headers

```http
X-Session-Identity: <wallet-address or guest-uuid>
X-Wallet-Address: <wallet-address>         # if connected
Authorization: Bearer <jwt-token>          # if authenticated
Content-Type: application/json
```

---

## Health

### `GET /api/airi3/health`

Returns server status.

**Response:**
```json
{ "ok": true }
```

No authentication required.

---

## Session

### `POST /api/airi3/session`

Create or restore a conversation session.

**Request body:** _(empty or `{}`)_

**Response:**
```json
{
  "ok": true,
  "conversationId": "abc123",
  "userId": "user-uuid",
  "roomId": "room-uuid"
}
```

---

## Messaging

### `POST /api/airi3/message`

Send a user message and receive an AI response. This is the primary endpoint.

**Request body:**
```json
{
  "text": "What's the setup on SOL today?",
  "conversationId": "abc123"
}
```

**Response:**
```json
{
  "ok": true,
  "conversationId": "abc123",
  "message": {
    "text": "SOL is testing the 90 support...",
    "action": "TRADE_PROPOSAL",
    "proposal": {
      "symbol": "SOL",
      "side": "long",
      "entry": 90,
      "tp": 95.5,
      "sl": 86.9,
      "timeframe": "1h",
      "confidence": 68,
      "thesis": "Bullish flag with volume breakout..."
    },
    "meta": {
      "source": "elizaos",
      "provider": "deepseek"
    }
  }
}
```

**Typical latency:** 5–30 seconds (depends on LLM response time).

---

### `GET /api/airi3/history`

Retrieve conversation history.

**Query params:**

| Param | Required | Description |
|---|---|---|
| `conversationId` | Yes | Conversation ID from session |

**Response:**
```json
{
  "ok": true,
  "history": [
    { "role": "user", "content": "What's the setup?", "timestamp": 1711017600000 },
    { "role": "assistant", "content": "SOL is testing...", "timestamp": 1711017615000 }
  ]
}
```

---

## Market Data

### `GET /api/airi3/market-context`

Fetch live market data for a symbol.

**Query params:**

| Param | Required | Default | Description |
|---|---|---|---|
| `symbol` | Yes | — | Market symbol (e.g., `SOL`, `BTC`) |
| `tf` | No | `15m` | Timeframe (`5m`, `15m`, `1h`, `4h`) |

**Response:**
```json
{
  "symbol": "SOL",
  "tf": "15m",
  "provider": "pacifica",
  "venue": "perp",
  "marketSymbol": "SOL-PERP",
  "quote": "USDC",
  "price": 90.12,
  "changePct": 1.27,
  "high": 90.73,
  "low": 88.10,
  "updatedAt": "2026-03-21T10:00:00Z",
  "funding": 0.0012,
  "openInterest": 142000000,
  "supportedOnPacifica": true,
  "supportedOnJupiter": false,
  "executionVenue": "pacifica",
  "chainId": null,
  "baseTokenAddress": null,
  "pairAddress": null,
  "liquidityUsd": null,
  "volume24h": 421000000,
  "tickSize": 0.001,
  "lotSize": 0.01,
  "minOrderSize": 10,
  "maxLeverage": 20,
  "data": [
    { "open": 89.5, "high": 90.0, "low": 89.1, "close": 89.8, "volume": 12500, "timestamp": 1711015200000, "time": 1711015200 },
    ...
  ]
}
```

For non-Pacifica assets, the same endpoint can return external context instead of an error:

```json
{
  "symbol": "AIR3",
  "tf": "15m",
  "provider": "geckoterminal",
  "venue": "spot",
  "marketSymbol": "AIR3",
  "quote": "SOL",
  "price": 0.0001433,
  "changePct": -0.05,
  "high": 0.0001466,
  "low": 0.0001366,
  "updatedAt": 1775801776899,
  "funding": null,
  "openInterest": null,
  "supportedOnPacifica": false,
  "supportedOnJupiter": true,
  "executionVenue": "jupiter",
  "chainId": "solana",
  "baseTokenAddress": "2jvsWRkT17ofmv9pkW7ofqAFWSCNyJYdykJ7kPKbmoon",
  "pairAddress": "52utUc1BdCp8iYtNfHTj2UUBrAWEkrDuVVR2vGgcoRJE",
  "liquidityUsd": 28177.32,
  "volume24h": 357.53,
  "tickSize": null,
  "lotSize": null,
  "minOrderSize": null,
  "maxLeverage": null,
  "data": [
    { "open": 0.000143, "high": 0.000145, "low": 0.000142, "close": 0.000144, "volume": 54.01, "time": 1775674800000 }
  ]
}
```

### `GET /api/airi3/market-universe`

Returns the Pacifica-listed market universe used by the market selector.

**Response:**
```json
{
  "ok": true,
  "markets": [
    {
      "symbol": "BTC",
      "price": 70487.94,
      "changePct": -0.29,
      "volume24h": 421000000,
      "funding": 0.0001,
      "openInterest": 182000000,
      "lotSize": 0.001,
      "minOrderSize": 10,
      "maxLeverage": 50
    }
  ]
}
```

---

## Trade Proposals

### `GET /api/airi3/proposal`

Get the latest trade proposal for a conversation.

**Query params:**

| Param | Required | Description |
|---|---|---|
| `conversationId` | No | Filter by conversation |

**Response:**
```json
{
  "ok": true,
  "proposal": {
    "symbol": "SOL",
    "side": "long",
    "entry": 90,
    "tp": 95.5,
    "sl": 86.9,
    "timeframe": "1h",
    "confidence": 68,
    "thesis": "..."
  }
}
```

---

## Pacifica Integration

### `GET /api/airi3/pacifica/overview`

Get the user's Pacifica account status and positions.

**Requires:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "ok": true,
  "status": {
    "hasBinding": true,
    "builderApproved": true,
    "agentBound": true,
    "isActive": true,
    "readyToExecute": true,
    "agentWalletPublicKey": "...",
    "pacificaAccount": "...",
    "builderCode": "AIRewardrop"
  },
  "account": {
    "balance": 10.5,
    "equity": 10.3954,
    "availableToSpend": 9.4033,
    "availableToWithdraw": 8.4113,
    "pendingBalance": 0,
    "totalMarginUsed": 1.0,
    "positionsCount": 1,
    "ordersCount": 0,
    "stopOrdersCount": 0,
    "updatedAt": "2026-03-21T10:00:00Z"
  },
  "positions": [
    {
      "symbol": "SOL",
      "side": "long",
      "amount": 0.2222,
      "entryPrice": 90.0,
      "markPrice": 90.12,
      "liquidationPrice": 72.5,
      "takeProfitPrice": 95.5,
      "stopLossPrice": 86.9,
      "notionalUsd": 20.03,
      "unrealizedPnlUsd": 0.0197,
      "unrealizedPnlPct": 0.0010,
      "funding": -0.001,
      "margin": 1.0,
      "isolated": false,
      "openOrderCount": 0,
      "createdAt": "2026-03-21T09:00:00Z",
      "updatedAt": "2026-03-21T10:00:00Z"
    }
  ],
  "accountMissing": false,
  "minimumDepositUsd": 10,
  "onboardingHint": null
}
```

If the account has not redeemed Pacifica beta access yet, trade execution routes return a structured error with `requiresBetaAccess = true` and the UI shows a `Redeem beta code` CTA instead of a raw transport error.

---

### `POST /api/airi3/pacifica/execute`

Submit a trade order to Pacifica DEX.

**Requires:** `Authorization: Bearer <token>`

**Request body:**
```json
{
  "symbol": "SOL",
  "side": "long",
  "size": 20,
  "leverage": 20,
  "orderType": "market",
  "takeProfitPrice": 95.5,
  "stopLossPrice": 86.9
}
```

**Response (success):**
```json
{
  "ok": true,
  "orderId": "6566984148"
}
```

**Response (error):**
```json
{
  "ok": false,
  "error": "Insufficient margin available"
}
```

---

## Authentication

### `POST /api/auth/challenge`

Request a message to sign with a Solana wallet.

**Request body:**
```json
{ "address": "Ehq7...3BYB" }
```

**Response:**
```json
{
  "message": "Sign this message to authenticate with AIR3 Agent:\nNonce: a1b2c3\nTimestamp: 2026-03-21T10:00:00Z"
}
```

---

### `POST /api/auth/verify`

Verify a wallet signature and receive a JWT.

**Request body:**
```json
{
  "address": "Ehq7...3BYB",
  "signature": "<base58-encoded-signature>",
  "message": "<original-challenge-message>"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "address": "Ehq7...3BYB",
    "isAdmin": false
  }
}
```

---

## Error Responses

All endpoints return consistent error envelopes:

```json
{
  "ok": false,
  "error": "Human-readable error description",
  "requestId": "air3_abc123"  // for log correlation
}
```

| HTTP Status | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (invalid parameters) |
| `401` | Unauthorized (missing or invalid token) |
| `403` | Forbidden (path not in whitelist, or insufficient permissions) |
| `429` | Rate limited |
| `502` | elizaOS backend unreachable |
| `504` | elizaOS timeout (LLM call exceeded 25s) |
