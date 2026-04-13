import { computed, reactive, watch } from 'vue'

import type { Air3TelegramLink, Air3TelegramLinkRequestResponse, Air3TelegramLinkStatusResponse } from '@/lib/air3-client'

import { appConfig } from '@/config/app'
import { createAir3Client } from '@/lib/air3'
import { useWalletSession } from '@/modules/wallet/session'

const state = reactive({
  loading: false,
  linking: false,
  updatingChatId: null as string | null,
  error: null as string | null,
  lastActionMessage: null as string | null,
  botUsername: appConfig.telegramBotUsername || null as string | null,
  linkedChats: [] as Air3TelegramLink[],
  pendingCode: null as string | null,
  pendingDeepLinkUrl: null as string | null,
  pendingExpiresAt: null as number | null,
  autoLinkAttempted: false,
})

const wallet = useWalletSession()
let initialized = false
let statusPollTimer: number | null = null
let statusPollDeadline = 0
let statusPollPreviousLinkedCount = 0

function stopStatusPolling() {
  if (statusPollTimer != null && typeof window !== 'undefined')
    window.clearTimeout(statusPollTimer)
  statusPollTimer = null
  statusPollDeadline = 0
  statusPollPreviousLinkedCount = 0
}

function readTelegramModeQuery() {
  if (typeof window === 'undefined')
    return null

  const params = new URLSearchParams(window.location.search)
  return params.get('telegram')
}

function clearTelegramModeQuery() {
  if (typeof window === 'undefined')
    return

  const url = new URL(window.location.href)
  url.searchParams.delete('telegram')
  window.history.replaceState({}, '', url.toString())
}

function syncStatus(payload: Air3TelegramLinkStatusResponse | null) {
  state.botUsername = payload?.botUsername || appConfig.telegramBotUsername || null
  state.linkedChats = Array.isArray(payload?.linkedChats) ? payload.linkedChats : []
}

function syncRequest(payload: Air3TelegramLinkRequestResponse) {
  state.pendingCode = payload.code
  state.pendingDeepLinkUrl = payload.deepLinkUrl
  state.pendingExpiresAt = payload.expiresAt
  state.linkedChats = Array.isArray(payload.linkedChats) ? payload.linkedChats : state.linkedChats
}

function getClient() {
  return createAir3Client({
    token: wallet.token.value || undefined,
  })
}

function openUrl(url: string | null | undefined) {
  const nextUrl = String(url || '').trim()
  if (!nextUrl || typeof window === 'undefined')
    return

  window.open(nextUrl, '_blank', 'noopener,noreferrer')
}

async function refreshStatus() {
  if (!wallet.token.value) {
    syncStatus(null)
    state.pendingCode = null
    state.pendingDeepLinkUrl = null
    state.pendingExpiresAt = null
    return null
  }

  state.loading = true
  state.error = null

  try {
    const payload = await getClient().fetchTelegramLinkStatus(wallet.buildRequestHeaders())
    syncStatus(payload)
    return payload
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to load Telegram link status.'
    throw error
  }
  finally {
    state.loading = false
  }
}

function scheduleStatusPolling(previousLinkedCount: number) {
  if (typeof window === 'undefined')
    return

  stopStatusPolling()
  statusPollDeadline = Date.now() + 90_000
  statusPollPreviousLinkedCount = previousLinkedCount

  const tick = async () => {
    try {
      const payload = await refreshStatus()
      const linkedCount = Array.isArray(payload?.linkedChats) ? payload.linkedChats.length : 0
      if (linkedCount > statusPollPreviousLinkedCount) {
        state.pendingCode = null
        state.pendingDeepLinkUrl = null
        state.pendingExpiresAt = null
        state.lastActionMessage = 'Telegram chat linked.'
        stopStatusPolling()
        return
      }
    }
    catch {
    }

    if (Date.now() >= statusPollDeadline) {
      stopStatusPolling()
      return
    }

    statusPollTimer = window.setTimeout(tick, 2000)
  }

  statusPollTimer = window.setTimeout(tick, 2000)
}

async function requestLink(options?: { openBot?: boolean, clearQuery?: boolean }) {
  if (!wallet.token.value)
    throw new Error('Sign your Airifica session first.')

  state.linking = true
  state.error = null
  state.lastActionMessage = null
  const previousLinkedCount = state.linkedChats.length

  try {
    const payload = await getClient().requestTelegramLink(wallet.buildRequestHeaders())
    syncRequest(payload)
    state.botUsername = state.botUsername || appConfig.telegramBotUsername || null
    state.lastActionMessage = 'Telegram link is ready.'

    if (options?.clearQuery)
      clearTelegramModeQuery()

    if (options?.openBot !== false)
      openUrl(payload.deepLinkUrl || appConfig.telegramBotUrl)

    scheduleStatusPolling(previousLinkedCount)

    return payload
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to prepare Telegram link.'
    throw error
  }
  finally {
    state.linking = false
  }
}

async function unlinkChat(chatId: string) {
  if (!wallet.token.value)
    throw new Error('Sign your Airifica session first.')

  state.updatingChatId = chatId
  state.error = null
  state.lastActionMessage = null

  try {
    await getClient().unlinkTelegramChat({
      chatId,
      headers: wallet.buildRequestHeaders(),
    })
    state.linkedChats = state.linkedChats.filter(chat => chat.chatId !== chatId)
    state.lastActionMessage = 'Telegram chat unlinked.'
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to unlink Telegram chat.'
    throw error
  }
  finally {
    state.updatingChatId = null
  }
}

async function updateChat(chatId: string, patch: { alertsEnabled?: boolean, conversationalEnabled?: boolean }) {
  if (!wallet.token.value)
    throw new Error('Sign your Airifica session first.')

  state.updatingChatId = chatId
  state.error = null
  state.lastActionMessage = null

  try {
    await getClient().updateTelegramLinkPreferences({
      chatId,
      ...patch,
      headers: wallet.buildRequestHeaders(),
    })
    state.linkedChats = state.linkedChats.map((chat) => {
      if (chat.chatId !== chatId)
        return chat
      return {
        ...chat,
        ...(patch.alertsEnabled !== undefined ? { alertsEnabled: patch.alertsEnabled } : {}),
        ...(patch.conversationalEnabled !== undefined ? { conversationalEnabled: patch.conversationalEnabled } : {}),
      }
    })
    state.lastActionMessage = 'Telegram preferences updated.'
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to update Telegram preferences.'
    throw error
  }
  finally {
    state.updatingChatId = null
  }
}

async function copyPendingCode() {
  if (!state.pendingCode || typeof navigator === 'undefined' || !navigator.clipboard)
    return false

  await navigator.clipboard.writeText(state.pendingCode)
  state.lastActionMessage = 'Telegram code copied.'
  return true
}

function openBot() {
  openUrl(state.pendingDeepLinkUrl || appConfig.telegramBotUrl)
}

async function maybeAutoLink() {
  if (state.autoLinkAttempted)
    return

  if (readTelegramModeQuery() !== 'connect')
    return

  if (!wallet.token.value)
    return

  state.autoLinkAttempted = true
  try {
    await requestLink({ openBot: true, clearQuery: true })
  }
  catch {
  }
}

function initialize() {
  if (initialized)
    return

  initialized = true

  watch(() => wallet.token.value, async (token) => {
    if (!token) {
      stopStatusPolling()
      syncStatus(null)
      state.pendingCode = null
      state.pendingDeepLinkUrl = null
      state.pendingExpiresAt = null
      state.autoLinkAttempted = false
      return
    }

    try {
      await refreshStatus()
    }
    catch {
    }
    await maybeAutoLink()
  }, { immediate: true })
}

export function useTelegramLink() {
  initialize()

  return {
    loading: computed(() => state.loading),
    linking: computed(() => state.linking),
    updatingChatId: computed(() => state.updatingChatId),
    error: computed(() => state.error),
    lastActionMessage: computed(() => state.lastActionMessage),
    botUsername: computed(() => state.botUsername),
    linkedChats: computed(() => state.linkedChats),
    pendingCode: computed(() => state.pendingCode),
    pendingDeepLinkUrl: computed(() => state.pendingDeepLinkUrl || appConfig.telegramBotUrl),
    pendingExpiresAt: computed(() => state.pendingExpiresAt),
    hasLinkedChats: computed(() => state.linkedChats.length > 0),
    refreshStatus,
    requestLink,
    unlinkChat,
    updateChat,
    copyPendingCode,
    openBot,
  }
}
