# Frontend (Vue 3 SPA)

## Overview

The frontend is a Vue 3 Single Page Application built with Vite. It renders entirely in the browser — there is no server-side rendering (SSR). All state is managed with Vue's Composition API; there is no Vuex or Pinia.

---

## Directory Structure

```
src/
├── App.vue                     # Root component — layout, bootstrap, embedded mode
├── main.ts                     # Vue app entry point
├── env.d.ts                    # TypeScript declarations for import.meta.env
│
├── config/
│   └── app.ts                  # AppConfig — single source of truth for env vars
│
├── lib/
│   ├── air3-client/            # Typed HTTP client for the AIR3 API
│   │   ├── index.ts            # Barrel export
│   │   ├── config.ts           # URL resolution (normalizeUrl, resolveRuntimeBaseUrl)
│   │   ├── types.ts            # All API request/response types
│   │   ├── client.ts           # Air3Client class
│   │   └── http.ts             # requestJson<T>() — timeout, request IDs, error norm
│   ├── air3.ts                 # Factory: createAir3Client(config, session)
│   ├── solana.ts               # Solana wallet detection, signing, encoding
│   ├── storage.ts              # Safe localStorage/sessionStorage wrappers
│   ├── format.ts               # Number/date/price formatting utilities
│   └── ids.ts                  # Guest identity generation (UUID-based)
│
├── modules/                    # Feature modules (composables + state)
│   ├── wallet/session.ts       # useWalletSession() — address, token, identity, headers
│   ├── conversation/
│   │   ├── state.ts            # useConversation() — messages, send, history
│   │   ├── types.ts            # ConversationMessage interface
│   │   ├── composer.ts         # Message text composition helpers
│   │   └── examples.ts         # Example prompt suggestions
│   ├── avatar/
│   │   ├── presence.ts         # Avatar positioning, camera
│   │   ├── vrma.ts             # VRM animation loading & playback
│   │   ├── lighting.ts         # Three.js lighting rig
│   │   └── emoteDebug.ts       # Dev-only expression debugger
│   ├── speech/
│   │   ├── runtime.ts          # TTS synthesis, audio queue, PCM streaming
│   │   ├── visemes.ts          # Phoneme → VRM blendshape mapping
│   │   └── assets/lip-sync-profile.json
│   ├── audio/session.ts        # AudioContext lifecycle management
│   ├── hearing/pipeline.ts     # VAD (Voice Activity Detection) pipeline
│   ├── market/context.ts       # Market data composable (price, candles, meta)
│   ├── pacifica/account.ts     # Pacifica account overview + polling
│   ├── product/execution.ts    # Trade execution (submit order via API)
│   └── trade/
│       ├── proposalFallback.ts # Fallback trade setup generation (no LLM)
│       └── proposalMetrics.ts  # R/R ratio, pip distance, sizing logic
│
├── components/
│   ├── AvatarStageCard.vue     # Three.js scene + VRM rendering
│   ├── ConversationCard.vue    # Chat interface + input
│   ├── ConversationMessageItem.vue  # Single message bubble
│   ├── MarketContextCard.vue   # Price card + mini-chart
│   ├── PacificaAccountCard.vue # Account balance + positions
│   ├── StageBackdrop.vue       # Background image/canvas
│   ├── StrategySummaryCard.vue # AI strategy context display
│   ├── TradeProposalCard.vue   # Trade proposal + Execute button
│   └── layout/
│       ├── StageHeader.vue     # Top header (branding, market, wallet)
│       ├── StageFooter.vue     # Bottom controls (voice input toggle)
│       ├── InteractiveArea.vue # Right-side panel layout
│       ├── WalletConnectButton.vue    # Phantom/Backpack connect flow
│       ├── PacificaTradeButton.vue    # Open Pacifica deep-link
│       ├── CommandGuideOverlay.vue    # Keyboard shortcut / help overlay
│       └── HeaderLink.vue      # Navigation anchor
│
└── workers/
    └── vad/process.worklet.ts  # AudioWorklet for VAD processing
```

---

## App Layout

The layout is entirely in `App.vue` and uses CSS Grid:

```
┌──────────────────────────────────────────────────────────┐
│                      StageHeader                         │
├─────────────────────────┬────────────────────────────────┤
│                         │  MarketContextCard             │
│   AvatarStageCard       │  PacificaAccountCard           │
│   (Three.js scene)      │  TradeProposalCard             │
│                         │  ConversationCard              │
│   StageBackdrop         ├────────────────────────────────┤
│                         │  StageFooter                   │
└─────────────────────────┴────────────────────────────────┘

Mobile (≤ 980px): stacked vertically
```

---

## Configuration System

All environment variables are centralized in `src/config/app.ts` which exports a single `AppConfig` object. This is the only place where `import.meta.env.*` is read.

```typescript
// src/config/app.ts
export const AppConfig = {
  brandName: normalizeString(import.meta.env.VITE_AIRIFICA_BRAND_NAME, 'Airifica'),

  runtimeBaseUrl: normalizeUrl(
    import.meta.env.VITE_AIR3_ELIZA_BASE_URL || import.meta.env.VITE_AIR3_RUNTIME_BASE_URL || '',
    '',
    { sameOriginFallback: '/' }   // ← critical: '/' is truthy, triggers same-origin logic
  ),

  pacifica: {
    tradeBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_PACIFICA_TRADE_BASE_URL, 'https://app.pacifica.fi/trade'),
    builderCode: normalizeString(import.meta.env.VITE_AIR3_PACIFICA_BUILDER_CODE, 'AIRewardrop'),
    // ...
  },

  tts: {
    provider: normalizeTtsProvider(import.meta.env.VITE_AIR3_TTS_PROVIDER),
    streamEnabled: normalizeBoolean(import.meta.env.VITE_AIR3_TTS_STREAM_ENABLED, true),
    // ...
  },
  // ...
}
```

> **Key insight:** `sameOriginFallback: '/'` ensures that when `VITE_AIR3_ELIZA_BASE_URL` is empty (production), `runtimeBaseUrl` resolves to `''` (empty string), and all API calls use relative paths like `/api/airi3/message`. This is the same-origin trick that eliminates CORS.

---

## State Management

The app uses Vue 3's Composition API exclusively. Each feature module exports a composable:

| Composable | State | Persistence |
|---|---|---|
| `useWalletSession()` | address, token, guestId | localStorage / sessionStorage |
| `useConversation()` | messages[], isPending | in-memory |
| Market context | price, candles, meta | in-memory, auto-refreshed |
| Pacifica account | balance, positions | in-memory, polled |
| Avatar presence | VRM scene state | Three.js scene |
| Speech runtime | audio queue, viseme state | Web Audio context |

---

## Build Chunks (Code Splitting)

Vite splits the bundle into named chunks to optimize first-load performance:

| Chunk | Contents | Size |
|---|---|---|
| `vrm-runtime` | @pixiv/three-vrm + @pixiv/three-vrm-animation | ~2MB |
| `three-examples` | Three.js example utilities | ~500KB |
| `three-runtime` | Three.js core | ~800KB |
| `vue-core` | Vue 3 + @vue/* | ~150KB |
| `app-storage` | idb-keyval | ~15KB |
| `index` | App code | ~200KB |

The VRM chunk is loaded lazily — avatar rendering doesn't block the initial chat UI.

---

## TypeScript Configuration

- **Target**: ES2022 (native `async/await`, `??`, `?.`)
- **Module resolution**: `bundler` (Vite-aware)
- **Strict mode**: enabled (all strict flags)
- **Path alias**: `@/*` → `./src/*`

The workspace package `@airifica/avatar3d` is resolved via its `exports` field (`./src/index.ts`) without a build step — Vite handles TypeScript directly.
