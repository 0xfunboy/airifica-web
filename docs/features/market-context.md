# Market Context

The market context system fetches live price data and injects it into every AI conversation. The stage surface can resolve both Pacifica-listed perp markets and assets that only exist off-Pacifica through contract address or ticker lookup.

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

## Coverage Rules

- If the symbol is listed on Pacifica, AIR3 uses Pacifica price and candle data and marks the asset as `Perp available on Pacifica`.
- If the symbol or contract address is not listed on Pacifica, AIR3 resolves market data through DexScreener and GeckoTerminal instead of throwing a surface error.
- If the resolved asset is a Solana spot token with a valid mint, AIR3 marks it as `Spot available on Jupiter`.

## Data Structure

```typescript
interface Air3MarketContext {
  symbol: string          // e.g., "SOL"
  tf: string              // timeframe: "15m", "1h", "4h"
  provider: string        // "pacifica" | "geckoterminal" | "dexscreener"
  venue: string           // "perp" | "spot"
  marketSymbol: string    // e.g., "SOL-PERP" or "AIR3"
  quote: string           // quote currency ("USD", "SOL")
  price: number           // current mark price
  changePct: number       // 24h change percentage
  high: number            // session high
  low: number             // session low
  updatedAt: number       // Unix ms
  funding?: number        // funding rate (perps)
  openInterest?: number   // open interest in USD
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

`symbol` accepts:
- Pacifica ticker, e.g. `BTC`
- off-Pacifica ticker, e.g. `AIR3`
- contract address, e.g. a Solana mint or EVM token address

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

This gives the LLM the same data the user sees, enabling accurate technical analysis even when the asset is not supported for Pacifica execution.

---

## Chart Rendering

The mini chart in `MarketContextCard` is a lightweight candlestick renderer built directly on Canvas API (no charting library dependency). It renders:

- OHLC candles (green/red)
- Volume bars (semi-transparent, bottom)
- Price line overlay
- Auto-scaling Y-axis

For off-Pacifica assets, candles are sourced from GeckoTerminal where possible. If a pool resolves but OHLCV is unavailable, AIR3 falls back to a synthetic flat series so the surface still renders context instead of an error state.

The chart width adapts to the card container. On mobile, it collapses to a single-line price display.
