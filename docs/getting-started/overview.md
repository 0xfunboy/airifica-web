# What is Airifica

## The Problem

Retail traders need two things simultaneously: **real-time market intelligence** and **fast order execution**. Switching between a charting tool, a research tool, and a DEX interface creates cognitive overhead — and missed opportunities.

## The Solution: AIR3 Agent

AIR3 Agent collapses all three into a single AI-native interface. You talk to it like you'd talk to a trading desk analyst. It reads the market, generates a structured trade setup with entry/TP/SL/leverage, and lets you execute directly on Pacifica with one click — all while a 3D avatar narrates the analysis aloud.

---

## Core Concepts

### Bairbi

**Bairbi** is the AIR3 Agent character — a VRM-based 3D avatar rendered in real-time with Three.js. She expresses emotions, lip-syncs speech, and animates in response to the conversation. The VRM model (`AIR3_Dress_Final.vrm`) and animation clips are served as static assets.

### elizaOS Runtime

The AI brain behind Bairbi is the **elizaOS** conversational runtime, configured with the `bairbi.character.json` persona. elizaOS handles:

- Session management (conversation history)
- LLM calls (DeepSeek, with OpenAI/Anthropic fallback)
- Market context injection (Pacifica candle data)
- Trade proposal generation
- Pacifica API actions (account status, order submission)

### Pacifica DEX

**Pacifica** is the perpetuals DEX where AIR3 Agent executes trades. The builder integration (`AIRewardrop` builder code) links the user's Pacifica account to the AIR3 ecosystem, enabling:

- Account balance and equity display
- Open position monitoring
- Automated order submission from AI trade proposals

### Port-Bridge

In production, a single Node.js process (`port-bridge.mjs`) serves as the unified entrypoint on **port 5173**. It:

1. Serves the built Vue SPA directly from `dist/`
2. Proxies `/api/*` requests to elizaOS on port 4040
3. Proxies `/api/tts*` requests to the TTS proxy on port 4041

This eliminates CORS complexity: the browser always talks to the same origin.

---

## How a Conversation Works

```
User types a message
       │
       ▼
Vue frontend (ConversationCard.vue)
       │
       ▼
POST /api/airi3/message
       │  (same-origin, through port-bridge)
       ▼
port-bridge.mjs
       │  (proxies to port 4040)
       ▼
elizaOS client-airi3 (server.ts)
       │
       ├── Fetches market context (price, candles, funding)
       ├── Reads cached Pacifica account snapshot (if authenticated)
       ├── Builds LLM prompt with context + history
       ├── Calls DeepSeek API
       └── Returns structured response
              │
              ▼
       Air3MessageEnvelope {
         message: {
           text: "...",
           proposal: { symbol, entry, tp, sl, side, confidence }
         }
       }
              │
              ▼
Vue frontend renders:
  - Text in ConversationCard
  - TradeProposalCard (if proposal present)
  - TTS synthesis → avatar lip-sync + audio
```

Pacifica account state is cached server-side on a short interval, while the market universe is cached on a long interval. The chat path does not block on a fresh Pacifica fetch for every message.

---

## Where Airifica Fits in the AIR3 Ecosystem

```
AIR3 Ecosystem
├── AIRewardrop Platform      → Points, leaderboard, referrals
├── AIR3 Token                → Ecosystem incentive token
├── AIR3 Agent (Airifica Web) → This repository
│   ├── Bairbi Avatar
│   ├── elizaOS Backend
│   └── Pacifica Integration
└── Pacifica DEX              → Trade execution layer
```

Airifica Web is a **plugin** of the broader AIR3 ecosystem documented at [airewardrop.gitbook.io/air3](https://airewardrop.gitbook.io/air3). It can be deployed standalone or embedded in partner sites.
