/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AIRIFICA_BRAND_NAME?: string
  readonly VITE_AIRIFICA_PRODUCT_NAME?: string
  readonly VITE_AIRIFICA_AVATAR_MODEL_URL?: string
  readonly VITE_AIR3_ELIZA_BASE_URL?: string
  readonly VITE_AIR3_RUNTIME_BASE_URL?: string
  readonly VITE_AIR3_RUNTIME_URL?: string
  readonly VITE_AIR3_SERVICE_API_URL?: string
  readonly VITE_AIR3_SERVICE_URL?: string
  readonly VITE_AIR3_DEFAULT_MARKET?: string
  readonly VITE_AIR3_MARKET_SYMBOL?: string
  readonly VITE_AIR3_MODEL_URL?: string
  readonly VITE_AIR3_PACIFICA_TRADE_BASE_URL?: string
  readonly VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL?: string
  readonly VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL?: string
  readonly VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL?: string
  readonly VITE_AIR3_PACIFICA_BUILDER_CODE?: string
  readonly VITE_AIR3_PACIFICA_REFERRAL_CODE?: string
  readonly VITE_AIR3_EMBED_ALLOWED_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, any>
  export default component
}
