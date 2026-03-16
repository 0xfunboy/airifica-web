function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]'
}

function shouldUseSameOriginFallback(raw: string) {
  if (!raw || typeof window === 'undefined')
    return false

  const browserHostname = window.location.hostname.trim().toLowerCase()
  if (!browserHostname || isLoopbackHostname(browserHostname))
    return false

  try {
    const parsed = new URL(raw, window.location.origin)
    return isLoopbackHostname(parsed.hostname)
  }
  catch {
    return false
  }
}

function normalizeUrl(raw: string | undefined, fallback = '', options?: { sameOriginFallback?: string }) {
  const value = (raw || fallback).trim().replace(/\/+$/, '')
  if (!value)
    return ''
  if (options?.sameOriginFallback && shouldUseSameOriginFallback(value))
    return options.sameOriginFallback
  return value
}

function normalizeApiBase(raw: string | undefined, fallback: string) {
  const value = normalizeUrl(raw, fallback, { sameOriginFallback: '/api' })
  if (!value)
    return ''
  return value.endsWith('/api') ? value : `${value}/api`
}

export const appConfig = {
  brandName: (import.meta.env.VITE_AIRIFICA_BRAND_NAME || 'Airifica').trim(),
  productName: (import.meta.env.VITE_AIRIFICA_PRODUCT_NAME || 'AIR3').trim(),
  runtimeBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_ELIZA_BASE_URL || import.meta.env.VITE_AIR3_RUNTIME_BASE_URL || import.meta.env.VITE_AIR3_RUNTIME_URL || '', '', {
    sameOriginFallback: '',
  }),
  serviceApiBaseUrl: normalizeApiBase(
    import.meta.env.VITE_AIR3_SERVICE_API_URL || import.meta.env.VITE_AIR3_SERVICE_URL || import.meta.env.VITE_AIR3_ELIZA_BASE_URL || '',
    import.meta.env.VITE_AIR3_ELIZA_BASE_URL || import.meta.env.VITE_AIR3_RUNTIME_BASE_URL || import.meta.env.VITE_AIR3_RUNTIME_URL || '/api',
  ),
  defaultMarket: (import.meta.env.VITE_AIR3_DEFAULT_MARKET || import.meta.env.VITE_AIR3_MARKET_SYMBOL || 'BTC').trim().toUpperCase(),
  avatarModelUrl: (import.meta.env.VITE_AIRIFICA_AVATAR_MODEL_URL || import.meta.env.VITE_AIR3_MODEL_URL || '/brand/AIR3_Dress_Final.vrm').trim(),
  pacificaTradeBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_PACIFICA_TRADE_BASE_URL || '', 'https://app.pacifica.fi/trade'),
  pacificaPortfolioBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_PACIFICA_PORTFOLIO_BASE_URL || '', 'https://app.pacifica.fi/portfolio'),
  pacificaDepositBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_PACIFICA_DEPOSIT_BASE_URL || '', 'https://app.pacifica.fi/portfolio'),
  pacificaWithdrawBaseUrl: normalizeUrl(import.meta.env.VITE_AIR3_PACIFICA_WITHDRAW_BASE_URL || '', 'https://app.pacifica.fi/portfolio'),
  pacificaReferralCode: (import.meta.env.VITE_AIR3_PACIFICA_REFERRAL_CODE || '').trim(),
  embeddedAllowedOrigin: (import.meta.env.VITE_AIR3_EMBED_ALLOWED_ORIGIN || '').trim(),
  brandLogoUrl: '/brand/AIRewardrop_orizzontal.png',
  brandIconUrl: '/brand/airtrading_icon.png',
  stageBackgroundUrl: '/brand/AIR3-extended-Studio.webp',
  socialPreviewUrl: '/open-graph.png',
} as const

export type AppConfig = typeof appConfig
