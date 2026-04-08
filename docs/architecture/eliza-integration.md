# ElizaOS / AIR3 Backend

The AI backend is built on [elizaOS](https://elizaos.ai) and lives in the `eliza-air3` repository. The `client-airi3` package exposes an Express.js HTTP API that the frontend communicates with.

---

## Overview

```
eliza-air3/
└── packages/
    └── client-airi3/
        └── src/
            ├── server.ts         # Express app, all HTTP endpoints, CORS, auth
            ├── messageManager.ts # LLM orchestration, prompt building, context injection
            └── characters/
                └── bairbi.character.json  # Bairbi persona definition
```

---

## Start Command

```bash
cd /home/funboy/air3-stack/eliza-air3
source ~/.nvm/nvm.sh
nvm use 23.3.0
pnpm start dev --character='characters/bairbi.character.json'
```

Listens on **port 4040**.

---

## CORS Configuration

elizaOS accepts requests from:
- Origins matching `isAllowedCorsOrigin()` (private networks, configured origins)
- Requests with **no Origin header** — this is how port-bridge requests arrive, since the proxy strips the `Origin` header before forwarding

The `AIRI3_CORS_ORIGIN` environment variable sets the allowed public origin (e.g., `https://airi.airewardrop.xyz`).

---

## Key Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/airi3/health` | Health check — returns `{ ok: true }` |
| `POST` | `/api/airi3/session` | Create or restore conversation session |
| `POST` | `/api/airi3/message` | Send a message, get AI response |
| `GET` | `/api/airi3/history` | Get conversation history |
| `GET` | `/api/airi3/market-context` | Get current market data (price, candles) |
| `GET/POST` | `/api/airi3/proposal` | Get/generate trade proposal |
| `GET` | `/api/airi3/pacifica/overview` | Pacifica account status + positions |
| `POST` | `/api/airi3/pacifica/execute` | Submit a trade order to Pacifica |
| `POST` | `/api/auth/challenge` | Get wallet sign challenge |
| `POST` | `/api/auth/verify` | Verify signature, get JWT |

---

## Message Handling Pipeline

When `POST /api/airi3/message` is received:

```
1. Validate request (JWT or guest session)
2. Load conversation history from in-memory store
3. Build Pacifica context block:
   └─ fetchPacificaAccountSnapshot() → balance, equity, positions
   └─ buildPacificaContextBlock() → markdown block for prompt
4. Fetch market context:
   └─ Current price, 15m candles (96 periods), funding rate
5. Build LLM prompt:
   └─ bairbi.character.json system prompt
   └─ Per-market context (symbol, price, candles)
   └─ Pacifica account context (balance, open positions)
   └─ Conversation history
   └─ User message
6. Route message for actions:
   └─ routeMessageForActions() → DeepSeek call (25s timeout)
   └─ Determines if message is trade-related
7. Generate response:
   └─ generateResponseContent() → DeepSeek call (25s timeout)
   └─ Returns text + optional trade proposal
8. Persist message + response to conversation store
9. Return Air3MessageEnvelope to client
```

---

## Context Injection: Pacifica Account

Recent commits added rich account context to every message:

```typescript
// messageManager.ts
function buildPacificaContextBlock(account: PacificaSnapshot): string {
  return `
# PRIVATE PACIFICA ACCOUNT CONTEXT
- Equity: ${account.equity}
- Available: ${account.availableToSpend}
- Open positions: ${account.positionsCount}
${account.positions.map(p => `  - ${p.symbol} ${p.side} @ ${p.entryPrice}`).join('\n')}
`
}
```

This data is injected into every LLM prompt so the AI always knows the user's current exposure before suggesting a trade.

---

## LLM Configuration

| Setting | Value |
|---|---|
| Default provider | DeepSeek (via `LLM_PROVIDER=deepseek`) |
| Fallback providers | OpenAI → Anthropic → template string |
| Timeout per call | 25 seconds |
| Total max latency | ~75s (routing call + response call) |
| Graceful degradation | If all LLMs fail, returns a template-based response |

---

## Authentication Flow

```
1. Frontend detects Solana wallet (Phantom/Backpack)
2. POST /api/auth/challenge → { message: "Sign this nonce: xyz" }
3. User signs with wallet (ed25519)
4. POST /api/auth/verify { address, signature }
   └─ Server verifies signature
   └─ Returns { token: "jwt...", user: { id, address } }
5. Frontend stores token in sessionStorage
6. All subsequent requests include: Authorization: Bearer <token>
```

Without a wallet, the user is assigned a `guestId` (UUID, stored in localStorage). Guest sessions have limited access (no trade execution, no account binding).

---

## Bairbi Character

The AI persona is defined in `bairbi.character.json`. Key fields:

| Field | Description |
|---|---|
| `name` | "Bairbi" |
| `bio` | Background and personality traits |
| `lore` | World context, AIR3 ecosystem lore |
| `topics` | Domains she's knowledgeable about (crypto, DeFi, trading) |
| `style` | Communication style (concise, analytical, encouraging) |
| `postExamples` | Example responses to calibrate tone |
| `messageExamples` | Few-shot conversation examples |

The character file is loaded at elizaOS startup via the `--character` flag.
