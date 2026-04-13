# Airifica Web — AIR3 Agent Interface

`airifica-web` is the production frontend for **AIR3 Agent** — an AI-powered trading companion for the [AIRewardrop](https://airewardrop.xyz) ecosystem. It combines a real-time 3D VRM avatar, conversational AI (elizaOS + DeepSeek), live Pacifica market data, external token discovery for off-Pacifica assets, and venue-aware execution links in a single immersive browser interface.

**Live:** https://airi.airewardrop.xyz

The production app is served same-origin through the `5173` port-bridge gateway. Static assets come directly from `dist/`, while `/api/*` and `/api/tts*` are proxied to the AIR3 backend and speech proxy.

## Documentation

Full documentation is in the [`docs/`](./docs/) folder, structured as a GitBook:

| Section | Description |
|---|---|
| [Overview](./docs/getting-started/overview.md) | What AIR3 Agent is and how it works |
| [Quickstart](./docs/getting-started/quickstart.md) | Dev environment setup in minutes |
| [Configuration](./docs/getting-started/configuration.md) | All environment variables explained |
| [Architecture](./docs/architecture/overview.md) | System diagram and request flow |
| [Port-Bridge](./docs/architecture/port-bridge.md) | The production HTTP gateway |
| [Features](./docs/features/avatar.md) | Avatar, conversation, TTS, market data, Pacifica |
| [Deployment](./docs/deployment/production.md) | Production deployment with Cloudflare Tunnel |
| [API Reference](./docs/api/endpoints.md) | All endpoints and TypeScript types |
| [Iframe Embed](./docs/embed/iframe.md) | Embedding AIR3 Agent in partner sites |

---


## What The App Does

- mounts a fullscreen stage with the AIR3 studio backdrop, VRM avatar and floating market/chat overlays
- connects to an AIR3 or Eliza runtime and preserves `sessionIdentity` and `conversationId`
- handles Solana wallet connect, challenge signing, verify and authenticated request headers
- falls back to `Open in Phantom` on mobile when no injected Solana provider is available in the current browser
- syncs Pacifica account overview, builder onboarding, agent bind, open trade execution and close position actions
- links one or more private Telegram chats to the authenticated wallet and syncs alert/conversation preferences
- renders market context inside the stage and surfaces trade proposals back into the conversation
- falls back to DexScreener + GeckoTerminal market data when a ticker or contract address is not listed on Pacifica
- distinguishes execution venue per asset, including spot handoff to Jupiter for supported Solana tokens
- supports voice input, VAD-backed hearing, speech playback and avatar mouth/expression driving
- keeps browser speech recognition where it works and falls back to sherpa-onnx websocket STT where it does not

## Runtime Areas

- [src/](./src): application shell, UI components and domain modules
- [src/lib/air3-client](./src/lib/air3-client): browser connector for AIR3, Pacifica and session endpoints
- [packages/avatar3d](./packages/avatar3d): Three/VRM stage runtime, gaze, breath loop and ambient gestures
- [public/brand](./public/brand): stage branding, favicons and the default AIR3 VRM asset
- [public/vrm-animations](./public/vrm-animations): ambient and gesture VRMA clips used by the avatar runtime

## Main Features

### Conversation

- chat history tied to the active wallet or guest identity
- assistant-side pending state with activity feedback while AIR3 is responding
- chart image rendering directly inside messages, with click-to-expand preview
- resettable session surface without losing the app shell

### Wallet And Session

- Solana wallet detection and connect flow
- challenge request and verify flow
- bearer token persistence in session storage
- AIR3 request headers built from wallet address, token and session identity

### Telegram Linking

- one-click Telegram linking from the web app through `t.me/<bot>?start=link_CODE`
- auto-refresh of linked chat status after the user jumps into Telegram
- manual code entry kept only as fallback
- per-chat toggles for alerts and conversational forwarding
- unlink controls in the same account surface used for Pacifica execution state

### Pacifica

- account overview with equity, available capital and open positions
- builder onboarding using `AIRewardrop` as builder and referral code
- open trade routing from AIR3 proposals
- close position actions from the market surface

### External Markets

- contract-address and ticker lookup for assets outside the Pacifica perp universe
- fallback pair discovery through DexScreener
- fallback OHLCV through GeckoTerminal when available
- Jupiter swap deep link for supported Solana spot assets

### Avatar Runtime

- VRM model loaded into a transparent Three renderer over the stage backdrop
- smooth eye tracking with look-at, blink and idle saccades
- additive head, neck, chest and shoulder follow
- procedural `breath` mode with blended ambient micro-gestures
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

- `VITE_AIR3_ELIZA_BASE_URL`: leave empty in production for same-origin `/api`; use `http://127.0.0.1:5173` only for local gateway testing
- `VITE_AIR3_SERVICE_API_URL`: explicit API base override; usually empty in production
- `VITE_AIR3_RUNTIME_BASE_URL`: optional legacy runtime alias
- `VITE_AIRIFICA_PUBLIC_APP_URL`: public app origin used for wallet/deep-link flows
- `VITE_AIR3_TELEGRAM_BOT_USERNAME`: bot username used to build Telegram deep links in the UI
- `VITE_AIRIFICA_AVATAR_MODEL_URL`: override for the default VRM model
- `VITE_AIR3_DEFAULT_MARKET`: initial market symbol
- `VITE_AIR3_TTS_PROVIDER`: `browser` or `openai-compatible`
- `VITE_AIR3_TTS_BASE_URL`: base URL for an OpenAI-compatible or FastAPI speech service
- `VITE_AIR3_TTS_SPEECH_PATH`: speech endpoint path, default `/v1/audio/speech`
- `VITE_AIR3_TTS_MODEL`
- `VITE_AIR3_TTS_VOICE`
- `VITE_AIR3_TTS_API_KEY`
- `VITE_AIR3_TTS_RESPONSE_FORMAT`
- `VITE_AIR3_STT_PROVIDER`: `auto`, `browser` or `server`
- `VITE_AIR3_STT_WS_URL`: websocket endpoint for server STT; prefer `/api/stt/ws` in HTTPS deployments
- `VITE_AIR3_STT_CONNECT_TIMEOUT_MS`
- `VITE_AIR3_STT_RESPONSE_TIMEOUT_MS`
- `VITE_AIR3_STT_MIN_UTTERANCE_MS`: minimum buffered speech duration before an utterance is sent to sherpa
- `VITE_AIR3_STAGE_BRIGHTNESS`
- `VITE_AIR3_STAGE_CONTRAST`
- `VITE_AIR3_STAGE_SATURATION`
- `VITE_AIR3_STAGE_EXPOSURE`
- `VITE_AIR3_STAGE_AMBIENT_INTENSITY`
- `VITE_AIR3_STAGE_HEMISPHERE_INTENSITY`
- `VITE_AIR3_STAGE_KEY_INTENSITY`
- `VITE_AIR3_STAGE_RIM_INTENSITY`
- `VITE_AIR3_STAGE_FILL_INTENSITY`

### Pacifica

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

### Branding And Embed

- `VITE_AIRIFICA_BRAND_NAME`
- `VITE_AIR3_EMBED_ALLOWED_ORIGIN`

## Notes

- the project uses a system font stack only
- the default stage asset set is already included in `public/brand`
- no Live2D runtime is included
- the external TTS path expects an OpenAI-compatible `audio/speech` response and falls back to browser speech when unavailable
- the STT fallback expects a sherpa-onnx offline websocket server behind the same-origin `/api/stt/ws` bridge or an explicitly configured websocket URL
- Pacifica market universe is cached server-side and refreshed on a long interval; account and position state refresh more frequently
- if a queried asset is not listed on Pacifica, AIR3 resolves external market data first and only shows Pacifica execution affordances where perpetual support actually exists
- Jupiter spot execution runs client-side with the user wallet, but the Jupiter Swap API key should stay server-side in the bridge via `AIRIFICA_JUPITER_API_KEY`
- Jupiter referral revenue can be enabled with `VITE_AIR3_JUPITER_REFERRAL_ACCOUNT` and `VITE_AIR3_JUPITER_REFERRAL_FEE_BPS`; by default the frontend suppresses referral fees on majors/stables listed in `VITE_AIR3_JUPITER_REFERRAL_DISABLED_SYMBOLS` to avoid degrading execution quality
