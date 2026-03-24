import { computed, reactive, watch } from 'vue'

import type { Air3MarketContext, Air3PacificaMarketRow } from '@/lib/air3-client'

import { appConfig } from '@/config/app'
import { createAir3Client } from '@/lib/air3'
import { readStorage, writeStorage } from '@/lib/storage'
import { useConversationState } from '@/modules/conversation/state'
import { useWalletSession } from '@/modules/wallet/session'

const MARKET_ALIASES: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  solana: 'SOL',
  sol: 'SOL',
  sui: 'SUI',
  dogecoin: 'DOGE',
  doge: 'DOGE',
  ripple: 'XRP',
  xrp: 'XRP',
  avalanche: 'AVAX',
  avax: 'AVAX',
  binance: 'BNB',
  bnb: 'BNB',
  jupiter: 'JUP',
  jup: 'JUP',
  hyperliquid: 'HYPE',
  hype: 'HYPE',
}

const STORAGE_KEY = 'airifica:market-symbol'

const state = reactive({
  currentSymbol: readStorage<string | null>(
    typeof window === 'undefined' ? null : window.localStorage,
    STORAGE_KEY,
    appConfig.defaultMarket,
  ) || appConfig.defaultMarket,
  market: null as Air3MarketContext | null,
  universe: [] as Air3PacificaMarketRow[],
  universeLoading: false,
  loading: false,
  error: null as string | null,
  lastSyncedAt: null as number | null,
  lastUniverseSyncedAt: null as number | null,
})

const wallet = useWalletSession()
const conversation = useConversationState()
let initialized = false
let universeRefreshTimer: ReturnType<typeof setInterval> | undefined

function persistSymbol(symbol: string) {
  state.currentSymbol = symbol
  writeStorage(typeof window === 'undefined' ? null : window.localStorage, STORAGE_KEY, symbol)
}

function normalizeSymbol(raw: string | null | undefined) {
  if (!raw)
    return null

  const trimmed = raw.trim()
  if (!trimmed)
    return null

  const alias = MARKET_ALIASES[trimmed.toLowerCase()]
  if (alias)
    return alias

  const withoutDollar = trimmed.replace(/^\$/, '')
  const pairMatch = withoutDollar.match(/^([A-Za-z0-9]{2,12})[-_/]?(?:USDT|USD|PERP)?$/i)
  const candidate = pairMatch?.[1] || withoutDollar
  if (!/^[A-Za-z0-9]{2,12}$/.test(candidate) || /^\d+$/.test(candidate))
    return null

  return candidate.toUpperCase()
}

function extractSymbolFromText(content: string | undefined) {
  if (!content)
    return null

  const lowered = content.toLowerCase()
  for (const [alias, symbol] of Object.entries(MARKET_ALIASES)) {
    const regex = new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, 'i')
    if (regex.test(lowered))
      return symbol
  }

  const prefixedSymbols = content.match(/\$[A-Za-z0-9]{2,12}\b/g) || []
  for (let index = prefixedSymbols.length - 1; index >= 0; index -= 1) {
    const symbol = normalizeSymbol(prefixedSymbols[index])
    if (symbol)
      return symbol
  }

  const uppercaseSymbols = content.match(/\b[A-Z0-9]{2,12}(?:[-_/]?(?:USDT|USD|PERP))?\b/g) || []
  for (let index = uppercaseSymbols.length - 1; index >= 0; index -= 1) {
    const symbol = normalizeSymbol(uppercaseSymbols[index])
    if (symbol)
      return symbol
  }

  return null
}

function resolveSymbolFromMessages() {
  for (let index = conversation.messages.value.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages.value[index]
    if (message.proposal?.symbol)
      return normalizeSymbol(message.proposal.symbol)

    const symbol = extractSymbolFromText(message.content)
    if (symbol)
      return symbol
  }

  return null
}

function buildMarketUrl(baseUrl: string, symbol: string, search?: Record<string, string>) {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const searchParams = new URLSearchParams(search)
  const suffix = searchParams.size ? `?${searchParams.toString()}` : ''
  return `${normalizedBase}/${symbol}${suffix}`
}

function buildPacificaTradeUrl(symbol: string) {
  return buildMarketUrl(appConfig.pacificaTradeBaseUrl, symbol, appConfig.pacificaReferralCode
    ? { referral: appConfig.pacificaReferralCode }
    : undefined)
}

function refreshFromConversation() {
  const symbol = resolveSymbolFromMessages()
  if (symbol && symbol !== state.currentSymbol)
    persistSymbol(symbol)
}

async function refreshMarketContext() {
  state.loading = true
  state.error = null

  try {
    const client = createAir3Client({
      token: wallet.token.value || undefined,
    })
    state.market = await client.fetchMarketContext({
      symbol: state.currentSymbol,
      timeframe: '15m',
      limit: 96,
      headers: wallet.buildRequestHeaders(),
    })
    state.lastSyncedAt = Date.now()
  }
  catch (error) {
    state.market = null
    state.error = error instanceof Error ? error.message : 'Failed to fetch market context.'
  }
  finally {
    state.loading = false
  }
}

async function refreshMarketUniverse() {
  state.universeLoading = true

  try {
    const client = createAir3Client({
      token: wallet.token.value || undefined,
    })
    const payload = await client.fetchMarketUniverse(wallet.buildRequestHeaders())
    state.universe = Array.isArray(payload.markets) ? payload.markets : []
    state.lastUniverseSyncedAt = Date.now()
  }
  finally {
    state.universeLoading = false
  }
}

function setSymbol(symbol: string | null | undefined) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized)
    return

  persistSymbol(normalized)
}

function initializeSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.messages.value.map(message => message.id), () => {
    refreshFromConversation()
  }, { immediate: true })

  watch(() => state.currentSymbol, () => {
    void refreshMarketContext()
  }, { immediate: true })

  void refreshMarketUniverse()
  universeRefreshTimer = setInterval(() => {
    void refreshMarketUniverse().catch(() => {})
  }, 60_000)
}

export function useMarketContext() {
  initializeSync()

  return {
    currentSymbol: computed(() => state.currentSymbol),
    market: computed(() => state.market),
    universe: computed(() => state.universe),
    universeLoading: computed(() => state.universeLoading),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    lastSyncedAt: computed(() => state.lastSyncedAt),
    lastUniverseSyncedAt: computed(() => state.lastUniverseSyncedAt),
    pacificaTradeUrl: computed(() => buildPacificaTradeUrl(state.currentSymbol)),
    pacificaPortfolioUrl: computed(() => appConfig.pacificaPortfolioBaseUrl),
    pacificaDepositUrl: computed(() => appConfig.pacificaDepositBaseUrl),
    pacificaWithdrawUrl: computed(() => appConfig.pacificaWithdrawBaseUrl),
    buildPacificaTradeUrl,
    setSymbol,
    refreshMarketContext,
    refreshMarketUniverse,
  }
}
