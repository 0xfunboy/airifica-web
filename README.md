# Airifica Web

<p align="center">
  <img src="docs/assets/AIRifica_Repository_Header.png" alt="Airifica Web — AIR3 Agent Interface" width="960"/>
</p>

<p align="center">
  <strong>Immersive trading interface for AIR3 Agent.</strong><br/>
  3D avatar · Wallet-auth sessions · Pacifica perps · Jupiter spot handoff · Telegram linking · Voice I/O
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883?logo=vue.js" alt="Vue"/>
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite" alt="Vite"/>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Three.js-VRM-111827" alt="Three.js VRM"/>
  <img src="https://img.shields.io/badge/Pacifica-Perps-0F172A" alt="Pacifica"/>
  <img src="https://img.shields.io/badge/Jupiter-Spot-16A34A" alt="Jupiter"/>
  <img src="https://img.shields.io/badge/Telegram-Linked-229ED9?logo=telegram" alt="Telegram"/>
</p>

`airifica-web` is the production frontend for **AIR3 Agent**, built for the [AIRewardrop](https://airewardrop.xyz) ecosystem. It combines a real-time VRM avatar, wallet-authenticated conversation, live market context, Pacifica execution, Jupiter-linked spot workflows, Telegram handoff, and voice interaction in a single browser surface.

**Live:** https://airi.airewardrop.xyz

The production app is served same-origin through the `5173` port-bridge gateway. Static assets come from `dist/`, while `/api/*`, `/api/tts*`, `/api/stt/ws`, and auxiliary runtime paths are proxied to the AIR3 backend and speech services.

## Documentation

The full documentation set lives in [`docs/`](./docs/) and is structured like a GitBook.

| Section | Description |
|---|---|
| [Overview](./docs/getting-started/overview.md) | Product goals, runtime contract, and key user flows |
| [Quickstart](./docs/getting-started/quickstart.md) | Local setup in minutes |
| [Configuration](./docs/getting-started/configuration.md) | Environment variables and deployment-facing config |
| [Architecture](./docs/architecture/overview.md) | System layout, request flow, and frontend/runtime boundaries |
| [Port-Bridge](./docs/architecture/port-bridge.md) | Same-origin gateway used in development and production |
| [Features](./docs/features/avatar.md) | Avatar, conversation, market context, Pacifica, voice, wallet auth |
| [Deployment](./docs/deployment/production.md) | Production deployment and Cloudflare tunnel notes |
| [API Reference](./docs/api/endpoints.md) | Endpoint surface and browser client contracts |
| [Iframe Embed](./docs/embed/iframe.md) | Partner-site embed and bootstrap flow |

## What The App Does

- mounts a fullscreen stage with the AIR3 studio backdrop, VRM avatar, and floating market/chat overlays
- connects to the AIR3 runtime and preserves `sessionIdentity` and `conversationId`
- handles Solana wallet connect, challenge signing, verify, and authenticated request headers
- falls back to `Open in Phantom` on mobile when no injected Solana provider is available
- syncs Pacifica account overview, builder onboarding, agent bind, open trade execution, and close position actions
- links one or more private Telegram chats to the authenticated wallet and syncs alert/conversation preferences
- renders market context inside the stage and surfaces trade proposals back into the conversation
- falls back to DexScreener and GeckoTerminal when an asset is outside the Pacifica perp universe
- distinguishes execution venue per asset, including Jupiter spot handoff for supported Solana tokens
- supports voice input, VAD-backed hearing, speech playback, and avatar mouth/expression driving
- keeps browser speech recognition where it works and falls back to sherpa-onnx websocket STT where it does not
- exposes an admin-only control panel for wallet-allowlisted operators

## Runtime Areas

- [src/](./src): application shell, UI components, and domain modules
- [src/lib/air3-client](./src/lib/air3-client): browser connector for AIR3, Pacifica, Telegram, and session endpoints
- [packages/avatar3d](./packages/avatar3d): Three/VRM stage runtime, gaze loop, breath loop, and ambient gestures
- [public/brand](./public/brand): stage branding, favicons, and default AIR3 VRM assets
- [public/vrm-animations](./public/vrm-animations): ambient and gesture VRMA clips used by the avatar runtime

## Main Features

### Conversation

- chat history tied to the active wallet or guest identity
- assistant-side pending state with activity feedback while AIR3 is responding
- chart rendering directly inside messages with click-to-expand preview
- resettable session surface without losing the app shell

### Wallet And Session

- Solana wallet detection and connect flow
- challenge request and verify flow
- bearer token persistence in session storage
- AIR3 request headers built from wallet address, token, and session identity
- admin state propagated from backend wallet verification so the control panel stays gated by the same signed session

### Admin Control Panel

- wallet-authenticated admin overlay inside the frontend
- overview, users, trading, Telegram, and runtime tabs
- same-origin reads from `/api/airi3/admin/overview`
- backend allowlist remains authoritative; the frontend only renders the panel when the signed session is admin-enabled

### Telegram Linking

- one-click Telegram linking through `t.me/<bot>?start=link_CODE`
- auto-refresh of linked chat status after the user jumps into Telegram
- compact `TG alerts` control with status color and direct open/link behavior
- manual code entry kept only as fallback

### Pacifica And Spot Execution

- Pacifica account overview with equity, available capital, and open perp positions
- builder onboarding using `AIRewardrop`
- open trade routing from AIR3 proposals
- Jupiter-linked spot handoff for supported Solana assets
- conditional rendering of onchain spot positions, TP/SL state, and close controls

### Avatar Runtime

- VRM model loaded into a transparent Three renderer over the stage backdrop
- smooth eye tracking with look-at, blink, and idle saccades
- additive head, neck, chest, and shoulder follow
- procedural breath mode with blended ambient micro-gestures
- speech-driven mouth movement and expression routing

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm build
```

## Environment

Copy [`.env.example`](./.env.example) to `.env.local` and set the values for your runtime.

### Core Runtime

- `VITE_AIR3_ELIZA_BASE_URL`
- `VITE_AIR3_SERVICE_API_URL`
- `VITE_AIR3_RUNTIME_BASE_URL`
- `VITE_AIRIFICA_PUBLIC_APP_URL`
- `VITE_AIR3_TELEGRAM_BOT_USERNAME`
- `VITE_AIRIFICA_AVATAR_MODEL_URL`
- `VITE_AIR3_DEFAULT_MARKET`

### Voice

- `VITE_AIR3_TTS_PROVIDER`
- `VITE_AIR3_TTS_BASE_URL`
- `VITE_AIR3_TTS_SPEECH_PATH`
- `VITE_AIR3_TTS_MODEL`
- `VITE_AIR3_TTS_VOICE`
- `VITE_AIR3_TTS_API_KEY`
- `VITE_AIR3_TTS_RESPONSE_FORMAT`
- `VITE_AIR3_STT_PROVIDER`
- `VITE_AIR3_STT_WS_URL`
- `VITE_AIR3_STT_CONNECT_TIMEOUT_MS`
- `VITE_AIR3_STT_RESPONSE_TIMEOUT_MS`
- `VITE_AIR3_STT_MIN_UTTERANCE_MS`

### Trading And Branding

- `VITE_AIR3_PACIFICA_TRADE_BASE_URL`
- `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL`
- `VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL`
- `VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL`
- `VITE_AIR3_JUPITER_SWAP_BASE_URL`
- `VITE_AIR3_JUPITER_API_BASE_URL`
- `VITE_AIR3_JUPITER_INPUT_MINT`
- `VITE_AIR3_JUPITER_INPUT_SYMBOL`
- `VITE_AIR3_JUPITER_INPUT_DECIMALS`
- `VITE_AIR3_PACIFICA_BUILDER_CODE`
- `VITE_AIR3_PACIFICA_REFERRAL_CODE`
- `VITE_AIRIFICA_BRAND_NAME`
- `VITE_AIR3_EMBED_ALLOWED_ORIGIN`

## Notes

- the external TTS path expects an OpenAI-compatible `audio/speech` response and falls back to browser speech when unavailable
- the STT fallback expects a sherpa-onnx websocket server behind same-origin `/api/stt/ws` or an explicitly configured websocket URL
- Pacifica market universe is cached server-side and refreshed on a longer interval than live account state
- if a queried asset is not listed on Pacifica, AIR3 resolves external market data first and only shows Pacifica execution affordances where support actually exists
- Jupiter spot execution runs client-side with the user wallet, while sensitive Jupiter API keys stay server-side in the bridge
- referral revenue can be enabled via the Jupiter referral env block without changing the browser contract
