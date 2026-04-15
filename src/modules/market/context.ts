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

const STORAGE_KEY = 'airifica:market-query'
const SOLANA_ADDRESS_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{25,60}\b/
const EVM_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/

const state = reactive({
  currentQuery: readStorage<string | null>(
    typeof window === 'undefined' ? null : window.localStorage,
    STORAGE_KEY,
    appConfig.defaultMarket,
  ) || appConfig.defaultMarket,
  market: null as Air3MarketContext | null,
  universe: [] as Air3PacificaMarketRow[],
  universeLoading: false,
  loading: false,
  error: null as string | null,
  notice: null as string | null,
  lastSyncedAt: null as number | null,
  lastUniverseSyncedAt: null as number | null,
})

const wallet = useWalletSession()
const conversation = useConversationState()
let initialized = false
let universeRefreshTimer: ReturnType<typeof setInterval> | undefined

function persistQuery(query: string) {
  state.currentQuery = query
  writeStorage(typeof window === 'undefined' ? null : window.localStorage, STORAGE_KEY, query)
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

function normalizeAddress(raw: string | null | undefined) {
  if (!raw)
    return null

  const trimmed = raw.trim()
  if (!trimmed)
    return null

  if (EVM_ADDRESS_PATTERN.test(trimmed))
    return trimmed.match(EVM_ADDRESS_PATTERN)?.[0] || null
  if (SOLANA_ADDRESS_PATTERN.test(trimmed))
    return trimmed.match(SOLANA_ADDRESS_PATTERN)?.[0] || null

  return null
}

function normalizeMarketQuery(raw: string | null | undefined) {
  return normalizeAddress(raw) || normalizeSymbol(raw)
}

function extractContractAddressFromText(content: string | undefined) {
  if (!content)
    return null

  return content.match(EVM_ADDRESS_PATTERN)?.[0]
    || content.match(SOLANA_ADDRESS_PATTERN)?.[0]
    || null
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

function resolveTargetFromMessages() {
  for (let index = conversation.messages.value.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages.value[index]
    if (message.proposal?.symbol) {
      const proposalTarget = normalizeMarketQuery(message.proposal.symbol)
      if (proposalTarget)
        return proposalTarget
    }

    const address = extractContractAddressFromText(message.content)
    if (address)
      return address

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

function buildJupiterTradeUrl(tokenAddress: string) {
  const normalizedBase = appConfig.jupiterSwapBaseUrl.replace(/\/+$/, '')
  const normalizedToken = tokenAddress.trim()
  if (!normalizedBase || !normalizedToken)
    return ''
  return `${normalizedBase}/SOL-${normalizedToken}`
}

function stripRequestSuffix(raw: string) {
  return raw.replace(/\s*\[request:[^\]]+\]\s*$/i, '').trim()
}

function isMissingMarketError(error: unknown) {
  const message = error instanceof Error ? stripRequestSuffix(error.message).toLowerCase() : ''
  return message.includes('no market data found') || message.includes('failed to fetch market context')
}

function buildMissingMarketNotice(query: string, fallbackSymbol: string) {
  return `${query} is not tracked right now. Showing ${fallbackSymbol} instead. Try BTC, ETH, SOL or a contract address.`
}

async function fetchContextForQuery(query: string) {
  const client = createAir3Client({
    token: wallet.token.value || undefined,
  })

  return await client.fetchMarketContext({
    symbol: query,
    timeframe: '15m',
    limit: 96,
    headers: wallet.buildRequestHeaders(),
  })
}

function refreshFromConversation() {
  const target = resolveTargetFromMessages()
  if (target && target !== state.currentQuery)
    persistQuery(target)
}

async function refreshMarketContext() {
  state.loading = true
  state.error = null
  state.notice = null

  try {
    state.market = await fetchContextForQuery(state.currentQuery)
    state.lastSyncedAt = Date.now()
  }
  catch (error) {
    if (state.currentQuery !== appConfig.defaultMarket && isMissingMarketError(error)) {
      try {
        state.market = await fetchContextForQuery(appConfig.defaultMarket)
        state.lastSyncedAt = Date.now()
        state.notice = buildMissingMarketNotice(state.currentQuery, appConfig.defaultMarket)
        state.error = null
        return
      }
      catch (fallbackError) {
        console.warn('[market/context] fallback to default market also failed:', fallbackError instanceof Error ? fallbackError.message : fallbackError)
      }
    }

    state.market = null
    state.error = error instanceof Error
      ? (stripRequestSuffix(error.message) || 'Market data is unavailable right now.')
      : 'Market data is unavailable right now.'
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
  const normalized = normalizeMarketQuery(symbol)
  if (!normalized)
    return

  persistQuery(normalized)
}

function initializeSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.messages.value.map(message => message.id), () => {
    refreshFromConversation()
  }, { immediate: true })

  watch(() => state.currentQuery, () => {
    void refreshMarketContext()
  }, { immediate: true })

  void refreshMarketUniverse()
  universeRefreshTimer = setInterval(() => {
    void refreshMarketUniverse().catch(() => {})
  }, 60_000)
}

export function useMarketContext() {
  initializeSync()

  const currentSymbol = computed(() =>
    state.market?.symbol
    || normalizeSymbol(state.currentQuery)
    || appConfig.defaultMarket,
  )

  return {
    currentQuery: computed(() => state.currentQuery),
    currentSymbol,
    market: computed(() => state.market),
    universe: computed(() => state.universe),
    universeLoading: computed(() => state.universeLoading),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    notice: computed(() => state.notice),
    lastSyncedAt: computed(() => state.lastSyncedAt),
    lastUniverseSyncedAt: computed(() => state.lastUniverseSyncedAt),
    pacificaTradeUrl: computed(() => buildPacificaTradeUrl(currentSymbol.value)),
    jupiterTradeUrl: computed(() => state.market?.executionVenue === 'jupiter' && state.market?.baseTokenAddress
      ? buildJupiterTradeUrl(state.market.baseTokenAddress)
      : ''),
    pacificaPortfolioUrl: computed(() => appConfig.pacificaPortfolioBaseUrl),
    pacificaDepositUrl: computed(() => appConfig.pacificaDepositBaseUrl),
    pacificaWithdrawUrl: computed(() => appConfig.pacificaWithdrawBaseUrl),
    buildPacificaTradeUrl,
    buildJupiterTradeUrl,
    setSymbol,
    refreshMarketContext,
    refreshMarketUniverse,
  }
}
