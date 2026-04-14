import { computed, reactive } from 'vue'

import type { Air3PacificaUnsignedPayload } from '@/lib/air3-client'

import { appConfig } from '@/config/app'
import { createGuestIdentity } from '@/lib/ids'
import { createAir3Client } from '@/lib/air3'
import {
  buildPhantomBrowseUrl,
  getSolanaProvider,
  isMobileBrowser,
  normalizeSignedPayload,
  readProviderAddress,
  signMessageBase58,
  signMessageBase64,
  type SolanaProvider,
} from '@/lib/solana'
import { readStorage, removeStorage, writeStorage } from '@/lib/storage'

const ADDRESS_KEY = 'airifica:wallet-address'
const TOKEN_KEY = 'airifica:auth-token'
const IS_ADMIN_KEY = 'airifica:is-admin'
const GUEST_IDENTITY_KEY = 'airifica:guest-session-id'

function getLocalStorage() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function getSessionStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

function initializeGuestIdentity() {
  const scope = getLocalStorage()
  const stored = readStorage<string | null>(scope, GUEST_IDENTITY_KEY, null)
  const value = stored || createGuestIdentity()
  writeStorage(scope, GUEST_IDENTITY_KEY, value)
  return value
}

const state = reactive({
  address: readStorage<string | null>(getLocalStorage(), ADDRESS_KEY, null),
  token: readStorage<string | null>(getSessionStorage(), TOKEN_KEY, null),
  isAdmin: readStorage<boolean>(getSessionStorage(), IS_ADMIN_KEY, false),
  guestSessionId: initializeGuestIdentity(),
  connecting: false,
  authenticating: false,
  embedded: false,
  error: null as string | null,
})

function persistAddress(value: string | null) {
  state.address = value
  if (value)
    writeStorage(getLocalStorage(), ADDRESS_KEY, value)
  else
    removeStorage(getLocalStorage(), ADDRESS_KEY)
}

function persistToken(value: string | null) {
  state.token = value
  if (value)
    writeStorage(getSessionStorage(), TOKEN_KEY, value)
  else
    removeStorage(getSessionStorage(), TOKEN_KEY)
}

function persistIsAdmin(value: boolean) {
  state.isAdmin = value
  writeStorage(getSessionStorage(), IS_ADMIN_KEY, value)
}

function clearAuthentication(message?: string | null) {
  persistToken(null)
  persistIsAdmin(false)
  state.error = message || null
}

const sessionIdentity = computed(() => state.address || state.guestSessionId)
const shortAddress = computed(() =>
  state.address ? `${state.address.slice(0, 4)}…${state.address.slice(-4)}` : null,
)
const isConnected = computed(() => Boolean(state.address))
const isAuthenticated = computed(() => Boolean(state.address && state.token))
const isAdmin = computed(() => Boolean(state.address && state.token && state.isAdmin))
const hasWalletProvider = computed(() => Boolean(getSolanaProvider()))
const mobileWalletFallbackAvailable = computed(() =>
  isMobileBrowser() && !state.embedded && !hasWalletProvider.value,
)
const mobileWalletFallbackHref = computed(() => {
  const targetUrl = appConfig.publicAppUrl
    || (typeof window !== 'undefined' ? window.location.href : '')

  return buildPhantomBrowseUrl(targetUrl, appConfig.publicAppUrl || targetUrl)
})

function buildRequestHeaders() {
  return {
    'X-Wallet-Address': sessionIdentity.value,
    'X-Session-Identity': sessionIdentity.value,
    'X-AIRI3-Client': 'airifica-web',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
  }
}

function hydrateExternalSession(payload: { address?: string | null, token?: string | null, isAdmin?: boolean, embedded?: boolean }) {
  if (payload.address && payload.address !== state.address) {
    persistAddress(payload.address)
    if (!payload.token)
      persistToken(null)
  }

  if (payload.token)
    persistToken(payload.token)

  if (typeof payload.isAdmin === 'boolean')
    persistIsAdmin(payload.isAdmin)

  if (payload.embedded !== undefined)
    state.embedded = payload.embedded

  state.error = null
}

function bootstrapFromSearch(search = typeof window !== 'undefined' ? window.location.search : '') {
  if (!search)
    return null

  const params = new URLSearchParams(search)
  const walletAddress = params.get('wallet') || params.get('walletAddress')
  const token = params.get('token') || params.get('jwt')
  const isAdminRaw = params.get('isAdmin')
  const embedded = ['1', 'true', 'yes'].includes(String(params.get('embedded') || '').toLowerCase())

  if (!walletAddress && !token && !params.has('embedded'))
    return null

  hydrateExternalSession({
    address: walletAddress,
    token,
    ...(isAdminRaw != null ? { isAdmin: ['1', 'true', 'yes'].includes(isAdminRaw.toLowerCase()) } : {}),
    embedded,
  })

  if (typeof window !== 'undefined') {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('wallet')
    nextUrl.searchParams.delete('walletAddress')
    nextUrl.searchParams.delete('token')
    nextUrl.searchParams.delete('jwt')
    nextUrl.searchParams.delete('embedded')
    nextUrl.searchParams.delete('isAdmin')
    window.history.replaceState({}, '', nextUrl.toString())
  }

  return {
    walletAddress,
    token,
    embedded,
  }
}

async function authenticate(provider?: SolanaProvider | null) {
  const activeProvider = provider || getSolanaProvider()
  if (!activeProvider || !state.address)
    throw new Error('Wallet provider unavailable.')

  state.authenticating = true
  state.error = null

  try {
    const client = createAir3Client()
    const challenge = await client.requestWalletChallenge(state.address)
    const signature = await signMessageBase64(activeProvider, challenge.message)
    const result = await client.verifyWalletChallenge(challenge.message, signature, state.address)
    persistToken(result.token)
    persistAddress(result.user.address)
    persistIsAdmin(Boolean(result.user.isAdmin))
    return result
  }
  catch (error) {
    persistToken(null)
    persistIsAdmin(false)
    state.error = error instanceof Error ? error.message : 'Wallet authentication failed.'
    throw error
  }
  finally {
    state.authenticating = false
  }
}

async function connect() {
  const provider = getSolanaProvider()
  if (!provider) {
    state.error = 'No Solana wallet detected. Install Phantom or Backpack.'
    throw new Error(state.error)
  }

  state.connecting = true
  state.error = null

  try {
    const response = await provider.connect()
    const nextAddress = readProviderAddress(provider, response)
    if (!nextAddress)
      throw new Error('Unable to read the Solana address from the active wallet.')

    if (state.address && state.address !== nextAddress)
      persistToken(null)

    persistAddress(nextAddress)
    await authenticate(provider)
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Wallet connection failed.'
    throw error
  }
  finally {
    state.connecting = false
  }
}

async function connectWalletOnly() {
  const provider = getSolanaProvider()
  if (!provider) {
    state.error = 'No Solana wallet detected. Install Phantom or Backpack.'
    throw new Error(state.error)
  }

  state.connecting = true
  state.error = null

  try {
    const response = await provider.connect()
    const nextAddress = readProviderAddress(provider, response)
    if (!nextAddress)
      throw new Error('Unable to read the Solana address from the active wallet.')

    if (state.address && state.address !== nextAddress)
      persistToken(null)

    persistAddress(nextAddress)
    return nextAddress
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Wallet connection failed.'
    throw error
  }
  finally {
    state.connecting = false
  }
}

async function disconnect() {
  const provider = getSolanaProvider()
  try {
    await provider?.disconnect?.()
  }
  catch {
  }

  persistAddress(null)
  persistToken(null)
  persistIsAdmin(false)
  state.error = null
}

async function tryRestore() {
  if (!state.address)
    return

  const provider = getSolanaProvider()
  if (!provider) {
    if (!state.token)
      persistAddress(null)
    return
  }

  try {
    const response = await provider.connect({ onlyIfTrusted: true })
    const nextAddress = readProviderAddress(provider, response)
    if (!nextAddress)
      return

    if (state.address && state.address !== nextAddress)
      persistToken(null)

    persistAddress(nextAddress)
  }
  catch {
    if (!state.token)
      persistAddress(null)
  }
}

async function signPacificaPayload(unsignedPayload: Air3PacificaUnsignedPayload) {
  const provider = getSolanaProvider()
  if (!provider)
    throw new Error('No Solana wallet detected.')

  return {
    ...unsignedPayload.data,
    signature: await signMessageBase58(provider, normalizeSignedPayload(unsignedPayload)),
    timestamp: unsignedPayload.timestamp,
    expiry_window: unsignedPayload.expiry_window,
  }
}

export function useWalletSession() {
  return {
    address: computed(() => state.address),
    token: computed(() => state.token),
    guestSessionId: computed(() => state.guestSessionId),
    connecting: computed(() => state.connecting),
    authenticating: computed(() => state.authenticating),
    embedded: computed(() => state.embedded),
    error: computed(() => state.error),
    sessionIdentity,
    shortAddress,
    isConnected,
    isAuthenticated,
    isAdmin,
    hasWalletProvider,
    mobileWalletFallbackAvailable,
    mobileWalletFallbackHref,
    buildRequestHeaders,
    hydrateExternalSession,
    bootstrapFromSearch,
    authenticate,
    connect,
    connectWalletOnly,
    disconnect,
    clearAuthentication,
    tryRestore,
    signPacificaPayload,
  }
}
