# Market Context

The market context system fetches live price data and injects it into every AI conversation. The `MarketContextCard` component displays a mini candlestick chart with key metrics.

---

## What It Shows

```
┌─────────────────────────────────────┐
│  perp · SOL                   15M   │
│                                     │
│  [candlestick chart — 96 candles]   │
│                                     │
│  PRICE      CHANGE                  │
│  $90.12     +1.27%                  │
│                                     │
│  SESSION HIGH    SESSION LOW        │
│  $90.73          $88.10             │
│                                     │
│  Data provider: pacifica            │
│  Range: 96 candles                  │
└─────────────────────────────────────┘
```

---

## Data Structure

```typescript
interface Air3MarketContext {
  symbol: string          // e.g., "SOL"
  tf: string              // timeframe: "15m", "1h", "4h"
  provider: string        // "pacifica"
  venue: string           // trading venue identifier
  marketSymbol: string    // full market symbol (e.g., "SOL-PERP")
  quote: string           // quote currency ("USDC")
  price: number           // current mark price
  changePct: number       // 24h change percentage
  high: number            // session high
  low: number             // session low
  updatedAt: string       // ISO timestamp
  funding?: number        // funding rate (perps)
  openInterest?: number   // open interest in USD
  supportedOnPacifica: boolean
  tickSize: number        // minimum price increment
  lotSize: number         // minimum quantity increment
  minOrderSize: number    // minimum order size
  maxLeverage: number     // maximum available leverage
  data: Air3MarketContextCandle[]  // OHLCV candles
}

interface Air3MarketContextCandle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number  // Unix ms
  time: number       // Unix seconds (for charting)
}
```

---

## Fetching

Market context is fetched via:

```
GET /api/airi3/market-context?symbol=SOL&tf=15m
```

Polling interval: every 30 seconds (configurable in `modules/market/context.ts`).

On symbol change (user selects a different market), the context reloads immediately.

---

## Default Market

```bash
VITE_AIR3_DEFAULT_MARKET=SOL
```

The initial market symbol is read from config on app load.

---

## Injection into LLM Prompt

Before every AI response, the current market context is formatted and prepended to the prompt:

```
# MARKET CONTEXT — SOL/USDC (Pacifica Perps)
- Current price: $90.12
- 24h change: +1.27%
- Session high: $90.73 | Session low: $88.10
- Funding rate: 0.0012%
- Open interest: $142M
- Timeframe: 15m | Candles: 96

[OHLCV data table follows...]
```

This gives the LLM the same data the user sees, enabling accurate technical analysis.

---

## Chart Rendering

The mini chart in `MarketContextCard` is a lightweight candlestick renderer built directly on Canvas API (no charting library dependency). It renders:

- OHLC candles (green/red)
- Volume bars (semi-transparent, bottom)
- Price line overlay
- Auto-scaling Y-axis

The chart width adapts to the card container. On mobile, it collapses to a single-line price display.
