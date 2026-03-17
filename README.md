# Airifica Web

`airifica-web` is the AIR3 stage surface for AIRewardrop. It combines the live AIR3 conversation flow, the Pacifica trading path and the avatar runtime in one immersive interface.

## What The App Does

- mounts a fullscreen stage with the AIR3 studio backdrop, VRM avatar and floating market/chat overlays
- connects to an AIR3 or Eliza runtime and preserves `sessionIdentity` and `conversationId`
- handles Solana wallet connect, challenge signing, verify and authenticated request headers
- syncs Pacifica account overview, builder onboarding, agent bind, open trade execution and close position actions
- renders market context inside the stage and surfaces trade proposals back into the conversation
- supports voice input, VAD-backed hearing, speech playback and avatar mouth/expression driving

## Runtime Areas

- [src/](./src): application shell, UI components and domain modules
- [packages/air3-client](./packages/air3-client): browser client for AIR3, Pacifica and session endpoints
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

### Pacifica

- account overview with equity, available capital and open positions
- builder onboarding using `AIRewardrop` as builder and referral code
- open trade routing from AIR3 proposals
- close position actions from the market surface

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
pnpm preview
```

## Environment

Copy [`.env.example`](./.env.example) to `.env.local` and set the values for your runtime.

### Core Runtime

- `VITE_AIR3_ELIZA_BASE_URL`: AIR3 / Eliza host, for example `http://localhost:4040`
- `VITE_AIR3_SERVICE_API_URL`: explicit API base if it differs from the runtime host
- `VITE_AIR3_RUNTIME_BASE_URL`: optional legacy runtime alias
- `VITE_AIRIFICA_AVATAR_MODEL_URL`: override for the default VRM model
- `VITE_AIR3_DEFAULT_MARKET`: initial market symbol
- `VITE_AIR3_TTS_PROVIDER`: `browser` or `openai-compatible`
- `VITE_AIR3_TTS_BASE_URL`: base URL for an OpenAI-compatible or FastAPI speech service
- `VITE_AIR3_TTS_SPEECH_PATH`: speech endpoint path, default `/v1/audio/speech`
- `VITE_AIR3_TTS_MODEL`
- `VITE_AIR3_TTS_VOICE`
- `VITE_AIR3_TTS_API_KEY`
- `VITE_AIR3_TTS_RESPONSE_FORMAT`

### Pacifica

- `VITE_AIR3_PACIFICA_TRADE_BASE_URL`
- `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL`
- `VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL`
- `VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL`
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
