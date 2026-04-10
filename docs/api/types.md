# TypeScript Types Reference

All types are defined in `src/lib/air3-client/types.ts`.

---

## Client Configuration

```typescript
interface Air3ClientConfig {
  runtimeBaseUrl: string        // elizaOS host (empty = same-origin)
  serviceApiBaseUrl: string     // API base URL
  headers?: Record<string, string>
  token?: string                // JWT token
  timeoutMs?: number            // default: 20000ms
}
```

---

## Conversation

```typescript
interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number             // Unix ms
  conversationId?: string
  action?: string               // AI action tag
  image?: string                // image URL
  proposal?: Air3TradeProposal
  proposalPending?: boolean
  meta?: Air3MessageMeta
  pending?: boolean             // optimistic state
  statusNote?: string
}

interface Air3MessageMeta {
  source: string                // e.g., 'elizaos'
  provider: string              // e.g., 'deepseek'
}

interface Air3MessageContent {
  text: string
  image?: string
  action?: string
  proposal?: Air3TradeProposal
  meta?: Air3MessageMeta
}

interface Air3MessageEnvelope {
  ok: boolean
  conversationId: string
  message: Air3MessageContent
  error?: string
}
```

---

## Session

```typescript
interface Air3SessionResponse {
  ok: boolean
  conversationId: string
  userId: string
  roomId: string
}

interface Air3HistoryResponse {
  ok: boolean
  history: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }>
}
```

---

## Trade Proposals

```typescript
interface Air3TradeProposal {
  symbol: string                // e.g., 'SOL'
  side: 'long' | 'short'
  entry: number                 // entry price
  tp: number                    // take-profit price
  sl: number                    // stop-loss price
  timeframe: string             // e.g., '1h', '15m'
  confidence: number            // 0–100
  thesis: string                // AI reasoning text
  sourceAction?: string
}

interface Air3ProposalResponse {
  ok: boolean
  proposal: Air3TradeProposal | null
}
```

---

## Market Data

```typescript
interface Air3MarketContext {
  symbol: string
  tf: string
  provider: string
  venue: string
  marketSymbol: string          // e.g., 'SOL-PERP'
  quote: string                 // e.g., 'USDC'
  price: number
  changePct: number             // 24h change %
  high: number                  // session high
  low: number                   // session low
  updatedAt: number             // Unix ms
  funding?: number              // funding rate
  openInterest?: number         // USD
  supportedOnPacifica: boolean
  supportedOnJupiter?: boolean
  executionVenue?: 'pacifica' | 'jupiter' | null
  chainId?: string | null
  baseTokenAddress?: string | null
  baseTokenName?: string | null
  pairAddress?: string | null
  liquidityUsd?: number | null
  volume24h?: number | null
  requestQuery?: string | null
  tickSize?: number | null
  lotSize?: number | null
  minOrderSize?: number | null
  maxLeverage?: number | null
  data: Air3MarketContextCandle[]
}

interface Air3MarketContextCandle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number             // Unix ms
  time: number                  // Unix seconds
}
```

---

## Authentication

```typescript
interface Air3WalletChallengeResponse {
  message: string               // message to sign
}

interface Air3AuthVerifyResponse {
  token: string                 // JWT
  user: {
    id: string
    address: string             // Solana wallet address
    isAdmin: boolean
  }
}
```

---

## Pacifica

```typescript
interface Air3PacificaStatus {
  hasBinding: boolean           // account created on Pacifica
  builderApproved: boolean      // AIRewardrop builder approved
  agentBound: boolean           // AI agent wallet linked
  isActive: boolean
  readyToExecute: boolean       // all conditions met
  agentWalletPublicKey: string
  pacificaAccount: string
  builderCode: string           // 'AIRewardrop'
}

interface Air3PacificaAccountSnapshot {
  balance: number               // total balance (USDC)
  equity: number                // equity = balance + unrealized PnL
  availableToSpend: number      // free margin
  availableToWithdraw: number
  pendingBalance: number
  totalMarginUsed: number
  positionsCount: number
  ordersCount: number
  stopOrdersCount: number
  updatedAt: string
  raw: unknown                  // raw Pacifica API response
}

interface Air3PacificaPosition {
  symbol: string
  side: 'long' | 'short'
  amount: number                // base asset quantity
  entryPrice: number
  markPrice: number
  liquidationPrice: number
  takeProfitPrice: number | null
  stopLossPrice: number | null
  notionalUsd: number           // position value in USD
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  funding: number               // accumulated funding
  margin: number                // allocated margin
  isolated: boolean
  openOrderCount: number
  createdAt: string
  updatedAt: string
  raw: unknown
}

interface Air3PacificaOverview {
  ok: boolean
  status: Air3PacificaStatus
  account: Air3PacificaAccountSnapshot | null
  positions: Air3PacificaPosition[]
  accountMissing: boolean
  minimumDepositUsd: number
  onboardingHint: string | null
}
```

---

## AppConfig (Frontend)

The full shape of `AppConfig` exported from `src/config/app.ts`:

```typescript
interface AppConfig {
  brandName: string
  productName: string
  logoUrl: string
  iconUrl: string
  siteUrl: string

  runtimeBaseUrl: string        // '' in production (same-origin)
  serviceApiBaseUrl: string

  defaultMarket: string

  avatarModelUrl: string

  pacifica: {
    tradeBaseUrl: string
    portfolioBaseUrl: string
    depositBaseUrl: string
    withdrawBaseUrl: string
    builderCode: string
    referralCode: string
    builderMaxFeeRate: number
  }

  tts: {
    provider: 'browser' | 'openai-compatible'
    baseUrl: string
    speechUrl: string           // full URL for /api/tts
    captionUrl: string          // full URL for /api/tts/captioned
    phonemeUrl: string          // full URL for /api/tts/phonemes
    model: string
    voice: string
    voiceMode: string
    responseFormat: string
    streamEnabled: boolean
    streamFormat: string
    streamSampleRate: number
    streamChunkMs: number
    splitText: boolean
    chunkSize: number
    speedFactor: number
    phonemeLanguage: string
  }

  stage: {
    brightness: number
    contrast: number
    saturation: number
    exposure: number
    ambientIntensity: number
    hemisphereIntensity: number
    keyIntensity: number
    rimIntensity: number
    fillIntensity: number
  }

  embedAllowedOrigin: string
}
```
