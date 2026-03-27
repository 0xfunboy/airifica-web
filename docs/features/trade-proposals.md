# Trade Proposals

A trade proposal is a structured, AI-generated trade setup that includes all the parameters needed to place an order on Pacifica: entry, take-profit, stop-loss, leverage, size, and a confidence score.

---

## What a Proposal Looks Like

```
╔══════════════════════════════════════════════════════╗
║  $SOL  1H  LONG  R/R: 1.77  CONFIDENCE: 68%         ║
║                                                      ║
║  ENTRY    TAKE PROFIT    STOP LOSS                   ║
║  90       95.5           86.9                        ║
║                                                      ║
║  SIZE (USD)              LEVERAGE                    ║
║  1                       ████████████████ 20X        ║
║                          1X         20X MAX          ║
║                                                      ║
║  0,222222 SOL            20.00 USD                   ║
║  USED 1,00 USD                                       ║
║                                                      ║
║  Pacifica SOL currently reports lot 0.01             ║
║  and minimum order 10 USD.                           ║
║                                                      ║
║              ACTION STRATEGY                         ║
║         [  Execute trade  ]                          ║
║                                                      ║
║  Order submitted (6566984148).                       ║
╚══════════════════════════════════════════════════════╝
```

---

## Data Structure

```typescript
interface Air3TradeProposal {
  symbol: string          // "SOL"
  side: 'long' | 'short'
  entry: number           // entry price
  tp: number              // take-profit price
  sl: number              // stop-loss price
  timeframe: string       // "1h", "15m", "4h"
  confidence: number      // 0–100
  thesis: string          // text rationale
  sourceAction?: string   // action tag from AI routing
}
```

---

## How Proposals Are Generated

### Primary: LLM-Generated

During message handling in elizaOS (`messageManager.ts`):

1. The LLM generates a response that includes a trade setup
2. elizaOS parses the structured proposal from the response
3. The `Air3MessageEnvelope` includes the proposal alongside the text

```
AI response text:
"SOL is testing the 90 support with bullish momentum.
A long here targets the 95.5 resistance level..."

Parsed proposal:
{ symbol: "SOL", side: "long", entry: 90, tp: 95.5, sl: 86.9,
  timeframe: "1h", confidence: 68, thesis: "..." }
```

### Fallback: Local Generation

`src/modules/trade/proposalFallback.ts` can generate a basic proposal from market context data alone (without an LLM call), used when the AI response doesn't include a proposal but the message is detected as trade-related.

---

## Metrics Calculation

`src/modules/trade/proposalMetrics.ts` computes display metrics from a proposal:

```typescript
// Risk-to-Reward ratio
const rr = Math.abs(tp - entry) / Math.abs(entry - sl)
// → 1.77 = (95.5 - 90) / (90 - 86.9)

// Position size in base asset
const sizeInAsset = sizeUsd / entry
// → 0.222222 SOL = 20 USD / 90

// Effective used margin
const usedMargin = sizeUsd / leverage
// → 1.00 USD = 20 USD / 20x
```

---

## TradeProposalCard Component

The proposal card (`src/components/TradeProposalCard.vue`) is rendered inline in the conversation when a proposal is present. It provides:

- **Symbol & timeframe badge** — quick at-a-glance info
- **Side badge** — LONG (green) or SHORT (red)
- **R/R ratio** — computed from entry/TP/SL
- **Confidence bar** — colored by confidence level (green > 70%, yellow > 50%, red < 50%)
- **Price levels** — entry, take-profit, stop-loss
- **Size calculator** — adjustable USD size with leverage slider
- **Asset quantity** — auto-calculated from size ÷ entry
- **Market constraints** — shows Pacifica's lot size and min order size
- **Execute button** — triggers order submission
- **Order confirmation** — shows order ID after successful execution

---

## Execution Requirements

The Execute button is enabled only when:

| Condition | Check |
|---|---|
| Wallet connected | `session.isConnected` |
| JWT authenticated | `session.isAuthenticated` |
| Pacifica account bound | `status.hasBinding` |
| Builder approved | `status.builderApproved` |
| Agent linked | `status.agentBound` |
| Account active | `status.isActive` |
| All conditions | `status.readyToExecute` |

If any condition fails, the button shows a descriptive disabled state with an onboarding hint.

---

## StrategySummaryCard

`src/components/StrategySummaryCard.vue` shows the broader strategic context alongside the proposal:

- Market trend summary
- AI's reasoning (the `thesis` field)
- Risk disclaimer: "This is my personal approach and is not financial advice."

---

## Proposal Lifecycle

```
1. AI generates proposal in response to user message
2. Proposal embedded in ConversationMessage
3. TradeProposalCard renders with computed metrics
4. User adjusts size/leverage (local state only)
5. User clicks Execute
   ├─ Success: orderId shown, proposal marked executed
   └─ Error: error shown, proposal remains interactive
6. Proposal stays in conversation history (read-only after execution)
```
