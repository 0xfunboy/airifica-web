# Pacifica DEX Integration

[Pacifica](https://app.pacifica.fi) is the on-chain perpetuals DEX where AIR3 Agent executes trades. The integration covers account binding, position monitoring, and automated order submission.

---

## Overview

```
AIR3 Agent <──────────────────────> Pacifica DEX
                Builder Integration
                Code: AIRewardrop
                Max fee: 0.1%
```

The **builder integration** model means:
1. Users connect their Pacifica account to the AIRewardrop builder
2. The builder code is embedded in all orders placed through AIR3 Agent
3. AIRewardrop earns a share of trading fees (up to `VITE_AIR3_PACIFICA_BUILDER_MAX_FEE_RATE = 0.001`)
4. Users get access to AI-assisted trading

Pacifica metadata is split into two cache paths:
- market universe and pair metadata: long-lived cache, refreshed on a multi-hour interval
- account, position and order state: short-lived cache, refreshed frequently while the wallet is active

---

## Account Status

The `PacificaAccountCard` component displays a live snapshot of the user's account:

```
┌────────────────────────────────────────┐
│  PACIFICA ACCOUNT                      │
│  Ready to trade                        │
│  AIRewardrop builder linked.           │
│  AIRewardrop builder is linked.        │
│                            [Portfolio] │
│                                        │
│  ACCOUNT EQUITY    AVAILABLE           │
│  $10.3954          $9.4033             │
│                                        │
│  WITHDRAWABLE      OPEN POSITIONS      │
│  $8.4113           1                   │
│                                        │
│  [Open portfolio]                      │
│                                        │
│  CURRENT MARKET POSITION               │
│  ● LONG                 [Market close] │
│                                        │
│  TICKER  VALUE $  PNL %   PNL $        │
│  SOL     $19.84   +0.10%  +$0.0197    │
│  [Hide details]                        │
└────────────────────────────────────────┘
```

---

## API Types

### Account Overview

```typescript
interface Air3PacificaOverview {
  ok: boolean
  status: Air3PacificaStatus
  account: Air3PacificaAccountSnapshot | null
  positions: Air3PacificaPosition[]
  accountMissing: boolean           // user hasn't created Pacifica account yet
  minimumDepositUsd: number         // minimum to start trading
  onboardingHint: string | null     // hint text for new users
}
```

### Account Snapshot

```typescript
interface Air3PacificaAccountSnapshot {
  balance: number               // total balance in USDC
  equity: number                // equity (balance + unrealized PnL)
  availableToSpend: number      // available margin
  availableToWithdraw: number   // withdrawable amount
  pendingBalance: number        // pending deposits
  totalMarginUsed: number       // margin in use across positions
  positionsCount: number
  ordersCount: number
  stopOrdersCount: number
  updatedAt: string
  raw: unknown                  // raw Pacifica API response
}
```

### Position

```typescript
interface Air3PacificaPosition {
  symbol: string           // "SOL"
  side: 'long' | 'short'
  amount: number           // position size in base asset
  entryPrice: number
  markPrice: number
  liquidationPrice: number
  takeProfitPrice: number | null
  stopLossPrice: number | null
  notionalUsd: number      // position value in USD
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  funding: number          // accumulated funding costs
  margin: number           // allocated margin
  isolated: boolean        // isolated vs cross margin
  openOrderCount: number
  createdAt: string
  updatedAt: string
  raw: unknown
}
```

### Builder Status

```typescript
interface Air3PacificaStatus {
  hasBinding: boolean          // Pacifica account created
  builderApproved: boolean     // AIRewardrop builder approved
  agentBound: boolean          // AI agent wallet linked
  isActive: boolean            // account is active
  readyToExecute: boolean      // all conditions met for trading
  agentWalletPublicKey: string // agent's Solana public key
  pacificaAccount: string      // user's Pacifica account address
  builderCode: string          // "AIRewardrop"
}
```

---

## Endpoints

### Market Universe

```
GET /api/airi3/market-universe
```

Returns the Pacifica-listed markets sorted by `volume_24h`, including `symbol`, `price`, `changePct`, `volume24h`, `funding`, `openInterest`, `lotSize`, `minOrderSize` and `maxLeverage`.

### Get Account Overview

```
GET /api/airi3/pacifica/overview
Authorization: Bearer <jwt>
```

Returns `Air3PacificaOverview`. Polled on a short interval while the tab is visible and refreshed after trade actions.

### Execute Trade

```
POST /api/airi3/pacifica/execute
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "symbol": "SOL",
  "side": "long",
  "size": 1,          // USD size
  "leverage": 20,
  "orderType": "market",
  "takeProfitPrice": 95.5,
  "stopLossPrice": 86.9
}
```

Returns `{ ok: true, orderId: "6566984148" }` on success.

---

## Trade Execution Flow

```
User clicks "Execute trade" in TradeProposalCard
       │
       ▼
product/execution.ts
       │  Validates: wallet connected, token present, status.readyToExecute
       ▼
POST /api/airi3/pacifica/execute
       │
       ▼
elizaOS → Pacifica API (with builder code)
       │
       ▼
{ ok: true, orderId: "6566984148" }
       │
       ▼
UI shows "Order submitted (6566984148)"
```

---

## Deep Links

| Action | URL |
|---|---|
| View trade | `https://app.pacifica.fi/trade?market=SOL-PERP&builder=AIRewardrop` |
| Portfolio | `https://app.pacifica.fi/portfolio?ref=AIRewardrop` |
| Deposit | `https://app.pacifica.fi/portfolio?action=deposit&ref=AIRewardrop` |
| Withdraw | `https://app.pacifica.fi/portfolio?action=withdraw&ref=AIRewardrop` |

The builder/referral code is appended automatically using `VITE_AIR3_PACIFICA_BUILDER_CODE` and `VITE_AIR3_PACIFICA_REFERRAL_CODE`.

---

## Onboarding Flow (New Users)

If `accountMissing = true`:

```
1. Show "Create Pacifica Account" prompt
2. Deep-link to https://app.pacifica.fi?ref=AIRewardrop
3. User creates account and deposits funds
4. User returns to AIR3 Agent
5. Status polling detects hasBinding = true
6. UI transitions to "Ready to trade"
```

Minimum deposit is shown from `minimumDepositUsd` (typically $10 USDC).

If Pacifica returns `403 Beta access required`, AIR3 shows a `Redeem beta code` CTA instead of attempting to submit the order again.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_AIR3_PACIFICA_BUILDER_CODE` | Builder code embedded in all orders |
| `VITE_AIR3_PACIFICA_REFERRAL_CODE` | Referral code for new registrations |
| `VITE_AIR3_PACIFICA_BUILDER_MAX_FEE_RATE` | Max fee rate (0.001 = 0.1%) |
| `VITE_AIR3_PACIFICA_TRADE_BASE_URL` | Trade deep-link base |
| `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL` | Portfolio deep-link base |
| `PACIFICA_API_BASE` | Backend: Pacifica REST API base |
| `AIRI3_PACIFICA_PUBLIC_API_BASE` | Backend: Public API base |
| `AUTO_PACIFICA_API_KEY` | Backend: API key for automated calls |
