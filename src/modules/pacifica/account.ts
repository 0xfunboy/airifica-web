import { computed, reactive } from 'vue'

import type {
  Air3PacificaAccountSnapshot,
  Air3PacificaPosition,
  Air3PacificaStatus,
} from '@/lib/air3-client'

import { appConfig } from '@/config/app'
import { createAir3Client } from '@/lib/air3'
import { useWalletSession } from '@/modules/wallet/session'

const DEFAULT_STATUS: Air3PacificaStatus = {
  hasBinding: false,
  builderApproved: false,
  agentBound: false,
  isActive: false,
  readyToExecute: false,
}

function normalizeSymbol(raw: string | null | undefined) {
  return String(raw || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
}

function isSessionAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /\b401\b/.test(message)
    || /unauthorized/i.test(message)
    || /missing token/i.test(message)
    || /invalid token/i.test(message)
    || /jwt/i.test(message)
}

const state = reactive({
  status: { ...DEFAULT_STATUS } as Air3PacificaStatus,
  account: null as Air3PacificaAccountSnapshot | null,
  positions: [] as Air3PacificaPosition[],
  accountMissing: false,
  betaAccessRequired: false,
  betaAccessHint: null as string | null,
  minimumDepositUsd: 10,
  onboardingHint: null as string | null,
  loading: false,
  setupLoading: false,
  closingSymbol: null as string | null,
  error: null as string | null,
  lastSyncedAt: null as number | null,
})

const wallet = useWalletSession()
let syncInitialized = false
let syncInterval: ReturnType<typeof setInterval> | undefined

function safeRefreshOverview() {
  if (!wallet.token.value || state.loading)
    return

  void refreshOverview().catch(() => {})
}

function initializeSync() {
  if (syncInitialized || typeof window === 'undefined')
    return

  syncInitialized = true
  syncInterval = setInterval(() => {
    if (document.visibilityState === 'visible')
      safeRefreshOverview()
  }, 12_000)
  window.addEventListener('focus', safeRefreshOverview)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      safeRefreshOverview()
  })
}

function reset() {
  state.status = { ...DEFAULT_STATUS }
  state.account = null
  state.positions = []
  state.accountMissing = false
  state.betaAccessRequired = false
  state.betaAccessHint = null
  state.minimumDepositUsd = 10
  state.onboardingHint = null
  state.error = null
  state.lastSyncedAt = null
}

function getPositionForSymbol(symbol: string | null | undefined) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized)
    return null

  return state.positions.find(position => normalizeSymbol(position.symbol) === normalized) || null
}

function setBetaAccessRequired(hint?: string | null) {
  state.betaAccessRequired = true
  state.betaAccessHint = hint?.trim() || 'Open Pacifica Portfolio, redeem a valid beta code, then retry execution.'
}

function clearBetaAccessRequired() {
  state.betaAccessRequired = false
  state.betaAccessHint = null
}

async function refreshOverview() {
  if (!wallet.token.value) {
    reset()
    return null
  }

  state.loading = true
  state.error = null

  try {
    const client = createAir3Client({
      token: wallet.token.value,
    })
    const overview = await client.fetchPacificaOverview(wallet.buildRequestHeaders())
    state.status = overview.status || { ...DEFAULT_STATUS }
    state.account = overview.account || null
    state.positions = Array.isArray(overview.positions) ? overview.positions : []
    state.accountMissing = Boolean(overview.accountMissing)
    state.minimumDepositUsd = Number.isFinite(overview.minimumDepositUsd) ? Number(overview.minimumDepositUsd) : 10
    state.onboardingHint = overview.onboardingHint || null
    state.lastSyncedAt = Date.now()
    return overview
  }
  catch (error) {
    state.account = null
    state.positions = []
    state.accountMissing = false
    state.onboardingHint = null

    if (isSessionAuthError(error)) {
      wallet.clearAuthentication('Pacifica session expired. Sign again to load account data.')
      state.status = { ...DEFAULT_STATUS }
      state.error = 'Pacifica session expired. Sign again.'
      return null
    }

    state.error = error instanceof Error ? error.message : 'Failed to load Pacifica overview.'
    throw error
  }
  finally {
    state.loading = false
  }
}

export function usePacificaAccount() {
  initializeSync()

  async function setupBuilderAccess(options?: { maxFeeRate?: string }) {
    if (!wallet.address.value || !wallet.token.value)
      throw new Error('Connect your Solana wallet and sign the AIR3 session first.')

    state.setupLoading = true
    state.error = null

    try {
      clearBetaAccessRequired()
      const client = createAir3Client({
        token: wallet.token.value,
      })
      const prepared = await client.preparePacificaAgent({
        pacificaAccount: wallet.address.value,
        maxFeeRate: options?.maxFeeRate || appConfig.pacificaBuilderMaxFeeRate,
        options: {
          builderCode: appConfig.pacificaBuilderCode,
          referralCode: appConfig.pacificaReferralCode,
        },
        headers: wallet.buildRequestHeaders(),
      })

      const approveBuilderSignedPayload = await wallet.signPacificaPayload(prepared.unsignedPayloads.approveBuilder)
      await client.approvePacificaBuilder({
        signedPayload: approveBuilderSignedPayload,
        headers: wallet.buildRequestHeaders(),
      })

      const bindAgentSignedPayload = await wallet.signPacificaPayload(prepared.unsignedPayloads.bindAgent)
      await client.bindPacificaAgent({
        signedPayload: bindAgentSignedPayload,
        headers: wallet.buildRequestHeaders(),
      })

      await refreshOverview()
      return prepared
    }
    catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to complete Pacifica onboarding.'
      throw error
    }
    finally {
      state.setupLoading = false
    }
  }

  async function closeSymbolPosition(options: { symbol: string, side?: 'LONG' | 'SHORT', amount?: number }) {
    if (!wallet.token.value)
      throw new Error('Connect your Solana wallet and sign the AIR3 session first.')

    const symbol = normalizeSymbol(options.symbol)
    if (!symbol)
      throw new Error('Invalid symbol')

    state.closingSymbol = symbol
    state.error = null

    try {
      const client = createAir3Client({
        token: wallet.token.value,
      })
      const result = await client.closePacificaPosition({
        symbol,
        side: options.side,
        amount: options.amount,
        headers: wallet.buildRequestHeaders(),
      })
      await refreshOverview()
      return result
    }
    catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to close Pacifica position.'
      throw error
    }
    finally {
      state.closingSymbol = null
    }
  }

  return {
    status: computed(() => state.status),
    account: computed(() => state.account),
    positions: computed(() => state.positions),
    loading: computed(() => state.loading),
    setupLoading: computed(() => state.setupLoading),
    closingSymbol: computed(() => state.closingSymbol),
    error: computed(() => state.error),
    lastSyncedAt: computed(() => state.lastSyncedAt),
    accountMissing: computed(() => state.accountMissing),
    minimumDepositUsd: computed(() => state.minimumDepositUsd),
    onboardingHint: computed(() => state.onboardingHint),
    hasWalletSession: computed(() => Boolean(wallet.address.value && wallet.token.value)),
    readyToExecute: computed(() => state.status.readyToExecute),
    activePositionsCount: computed(() => state.positions.length),
    betaAccessRequired: computed(() => state.betaAccessRequired),
    betaAccessHint: computed(() => state.betaAccessHint),
    reset,
    refreshOverview,
    setupBuilderAccess,
    getPositionForSymbol,
    closeSymbolPosition,
    setBetaAccessRequired,
    clearBetaAccessRequired,
  }
}
