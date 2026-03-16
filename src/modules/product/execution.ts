import { computed, reactive } from 'vue'

import { readStorage, writeStorage } from '@/lib/storage'

const CONFIRM_KEY = 'airifica:confirm-before-trade'
const AUTO_KEY = 'airifica:full-auto-mode'
const HANDLED_KEY = 'airifica:auto-handled-proposals'

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

const state = reactive({
  confirmBeforeTrade: readStorage(getStorageScope(), CONFIRM_KEY, true),
  fullAutoMode: readStorage(getStorageScope(), AUTO_KEY, false),
  autoHandledProposalMessageIds: readStorage<string[]>(getStorageScope(), HANDLED_KEY, []),
})

function persistConfirmBeforeTrade(value: boolean) {
  state.confirmBeforeTrade = value
  writeStorage(getStorageScope(), CONFIRM_KEY, value)
}

function persistFullAutoMode(value: boolean) {
  state.fullAutoMode = value
  writeStorage(getStorageScope(), AUTO_KEY, value)
}

function persistHandled(ids: string[]) {
  state.autoHandledProposalMessageIds = ids
  writeStorage(getStorageScope(), HANDLED_KEY, ids)
}

function setFullAutoMode(nextValue: boolean) {
  persistFullAutoMode(nextValue)
  if (nextValue)
    persistConfirmBeforeTrade(false)
}

function hasAutoHandledProposal(messageId?: string | null) {
  if (!messageId)
    return false

  return state.autoHandledProposalMessageIds.includes(messageId)
}

function markProposalAutoHandled(messageId?: string | null) {
  if (!messageId || hasAutoHandledProposal(messageId))
    return

  persistHandled([...state.autoHandledProposalMessageIds, messageId].slice(-200))
}

function clearAutoHandledProposals() {
  persistHandled([])
}

export function useTradeExecutionPreferences() {
  return {
    confirmBeforeTrade: computed(() => state.confirmBeforeTrade),
    fullAutoMode: computed(() => state.fullAutoMode),
    setConfirmBeforeTrade: persistConfirmBeforeTrade,
    setFullAutoMode,
    hasAutoHandledProposal,
    markProposalAutoHandled,
    clearAutoHandledProposals,
  }
}
