import { computed, reactive } from 'vue'

import type {
  Air3PacificaAccountSnapshot,
  Air3PacificaPosition,
  Air3PacificaStatus,
} from '@airifica/air3-client'

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

const state = reactive({
  status: { ...DEFAULT_STATUS } as Air3PacificaStatus,
  account: null as Air3PacificaAccountSnapshot | null,
  positions: [] as Air3PacificaPosition[],
  loading: false,
  error: null as string | null,
  lastSyncedAt: null as number | null,
})

const wallet = useWalletSession()

function reset() {
  state.status = { ...DEFAULT_STATUS }
  state.account = null
  state.positions = []
  state.error = null
  state.lastSyncedAt = null
}

function getPositionForSymbol(symbol: string | null | undefined) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized)
    return null

  return state.positions.find(position => normalizeSymbol(position.symbol) === normalized) || null
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
    state.lastSyncedAt = Date.now()
    return overview
  }
  catch (error) {
    reset()
    state.error = error instanceof Error ? error.message : 'Failed to load Pacifica overview.'
    throw error
  }
  finally {
    state.loading = false
  }
}

export function usePacificaAccount() {
  return {
    status: computed(() => state.status),
    account: computed(() => state.account),
    positions: computed(() => state.positions),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    lastSyncedAt: computed(() => state.lastSyncedAt),
    hasWalletSession: computed(() => Boolean(wallet.address.value && wallet.token.value)),
    readyToExecute: computed(() => state.status.readyToExecute),
    activePositionsCount: computed(() => state.positions.length),
    reset,
    refreshOverview,
    getPositionForSymbol,
  }
}
