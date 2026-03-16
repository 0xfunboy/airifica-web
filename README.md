# Airifica Web

Web stage for AIR3 with:

- VRM avatar runtime on Three
- AIR3 conversation flow with real session and conversation id
- Solana wallet connect, challenge and verify
- Pacifica overview, builder onboarding, agent binding and position close
- Market context synced from the conversation

## Workspace

- `src/`: application shell, domain modules and UI
- `packages/air3-client`: typed AIR3 and Pacifica browser client
- `packages/avatar3d`: VRM runtime package

## Commands

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
pnpm preview
```

## Environment

Copy `.env.example` to `.env.local` and fill the values required by your runtime.

- `VITE_AIRIFICA_BRAND_NAME`
- `VITE_AIR3_RUNTIME_BASE_URL`
- `VITE_AIR3_SERVICE_API_URL`
- `VITE_AIRIFICA_AVATAR_MODEL_URL`
- `VITE_AIR3_DEFAULT_MARKET`
- `VITE_AIR3_PACIFICA_TRADE_BASE_URL`
- `VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL`
- `VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL`
- `VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL`
- `VITE_AIR3_PACIFICA_REFERRAL_CODE`
- `VITE_AIR3_EMBED_ALLOWED_ORIGIN`

## Notes

- The repository ships no bundled avatar model.
- System fonts are used throughout the interface.
- No Live2D runtime is included.
