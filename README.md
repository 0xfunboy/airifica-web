# Airifica Web

Lean web interface for AIR3 with a VRM-only avatar runtime and a root-first workspace.

## Structure

```text
.
├── package.json
├── src
│   ├── components
│   ├── composables
│   ├── utils
│   └── App.vue
└── packages
    ├── air3-client
    └── avatar3d
```

## Modules

- `src/`: the single web application. No nested `apps/` layer.
- `packages/air3-client`: typed AIR3 session, chat, market and Pacifica API client.
- `packages/avatar3d`: lightweight VRM stage runtime with async loading.

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
pnpm preview
```

## Environment

Copy `.env.example` to `.env.local` and fill only what you need.

- `VITE_AIR3_RUNTIME_URL`: AIR3 runtime base URL.
- `VITE_AIR3_SERVICE_URL`: service API base URL used for market and Pacifica endpoints.
- `VITE_AIR3_SESSION_IDENTITY`: wallet or guest identity sent to AIR3.
- `VITE_AIR3_TOKEN`: optional bearer token for protected service endpoints.
- `VITE_AIR3_MODEL_URL`: default remote VRM URL.
- `VITE_AIR3_MARKET_SYMBOL`: default market symbol.
- `VITE_AIR3_AUTO_SPEAK`: enable browser speech synthesis on assistant replies.

## Notes

- The repository ships no bundled avatar model, no Live2D runtime, and no heavyweight font package.
- The stage supports VRM only.
- Imported VRM files are stored locally in IndexedDB on the client.

