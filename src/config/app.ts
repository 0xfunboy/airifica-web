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

function normalizeNumber(raw: string | undefined, fallback: number) {
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeBoolean(raw: string | undefined, fallback: boolean) {
  if (raw == null || raw === '')
    return fallback

  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'off'].includes(normalized))
    return false
  return fallback
}

function resolveEndpointUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '')
  const normalizedPath = path.trim()
  if (!normalizedBase)
    return normalizedPath.startsWith('/') ? normalizedPath : ''
  if (!normalizedPath)
    return normalizedBase
  if (/^https?:\/\//i.test(normalizedPath))
    return normalizedPath.replace(/\/+$/, '')
  if (normalizedPath.startsWith('/'))
    return `${normalizedBase}${normalizedPath}`
  return `${normalizedBase}/${normalizedPath}`
}

const ttsBaseUrl = normalizeUrl(import.meta.env.VITE_AIR3_TTS_BASE_URL || '', '')
const ttsDevProxyUrl = normalizeUrl(import.meta.env.VITE_AIR3_TTS_DEV_PROXY_URL || '', 'http://127.0.0.1:4041')
const ttsSpeechPath = (import.meta.env.VITE_AIR3_TTS_SPEECH_PATH || '/v1/audio/speech').trim()
const ttsRequestBaseUrl = import.meta.env.DEV && ttsBaseUrl
  ? ttsDevProxyUrl
  : ttsBaseUrl
const rawTtsProvider = (import.meta.env.VITE_AIR3_TTS_PROVIDER || (ttsBaseUrl ? 'external' : 'browser')).trim().toLowerCase()
const normalizedTtsProvider = rawTtsProvider === 'chatterbox'
  ? 'fastapi'
  : rawTtsProvider === 'external'
    ? 'openai-compatible'
    : rawTtsProvider

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
  pacificaBuilderCode: (import.meta.env.VITE_AIR3_PACIFICA_BUILDER_CODE || 'AIRewardrop').trim(),
  pacificaReferralCode: (import.meta.env.VITE_AIR3_PACIFICA_REFERRAL_CODE || 'AIRewardrop').trim(),
  embeddedAllowedOrigin: (import.meta.env.VITE_AIR3_EMBED_ALLOWED_ORIGIN || '').trim(),
  ttsProvider: normalizedTtsProvider === 'browser'
    ? 'browser'
    : normalizedTtsProvider === 'fastapi'
      ? 'fastapi'
      : 'openai-compatible',
  ttsBaseUrl,
  ttsDevProxyUrl,
  ttsSpeechPath,
  ttsSpeechUrl: resolveEndpointUrl(ttsRequestBaseUrl, ttsSpeechPath),
  ttsModel: (import.meta.env.VITE_AIR3_TTS_MODEL || 'gpt-4o-mini-tts').trim(),
  ttsVoice: (import.meta.env.VITE_AIR3_TTS_VOICE || 'alloy').trim(),
  ttsVoiceMode: (import.meta.env.VITE_AIR3_TTS_VOICE_MODE || 'predefined').trim(),
  ttsPredefinedVoiceId: (import.meta.env.VITE_AIR3_TTS_PREDEFINED_VOICE_ID || '').trim(),
  ttsApiKey: (import.meta.env.VITE_AIR3_TTS_API_KEY || '').trim(),
  ttsResponseFormat: (import.meta.env.VITE_AIR3_TTS_RESPONSE_FORMAT || 'mp3').trim(),
  ttsSplitText: normalizeBoolean(import.meta.env.VITE_AIR3_TTS_SPLIT_TEXT, true),
  ttsChunkSize: normalizeNumber(import.meta.env.VITE_AIR3_TTS_CHUNK_SIZE, 120),
  ttsSpeedFactor: normalizeNumber(import.meta.env.VITE_AIR3_TTS_SPEED_FACTOR, 1),
  ttsSeed: (import.meta.env.VITE_AIR3_TTS_SEED || '').trim(),
  stageBrightness: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_BRIGHTNESS, 1),
  stageContrast: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_CONTRAST, 1),
  stageSaturation: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_SATURATION, 1),
  stageExposure: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_EXPOSURE, 1),
  stageAmbientIntensity: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_AMBIENT_INTENSITY, 0.78),
  stageHemisphereIntensity: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_HEMISPHERE_INTENSITY, 1.2),
  stageKeyIntensity: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_KEY_INTENSITY, 1.58),
  stageRimIntensity: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_RIM_INTENSITY, 0.38),
  stageFillIntensity: normalizeNumber(import.meta.env.VITE_AIR3_STAGE_FILL_INTENSITY, 0.22),
  brandLogoUrl: '/brand/AIRewardrop_orizzontal.png',
  brandIconUrl: '/brand/airtrading_icon.png',
  brandSiteUrl: 'https://airewrdrop.xyz',
  stageBackgroundUrl: '/brand/AIR3-extended-Studio.webp',
  socialPreviewUrl: '/open-graph.png',
} as const

export type AppConfig = typeof appConfig
