import { computed, reactive } from 'vue'

import type { Air3MessageEnvelope } from '@/lib/air3-client'

import { extractMessageText, hasPendingProposal } from '@/lib/air3-client'

import { createId } from '@/lib/ids'
import { createAir3Client } from '@/lib/air3'
import { readStorage, removeStorage, writeStorage } from '@/lib/storage'
import { deriveProposalFallback } from '@/modules/trade/proposalFallback'
import { useWalletSession } from '@/modules/wallet/session'

import type { ConversationMessage } from './types'
import type { Air3TradeProposal } from '@/lib/air3-client'

interface PersistedConversation {
  conversationId: string
  messages: ConversationMessage[]
}

const wallet = useWalletSession()

const PENDING_STATUS_PHASES = [
  {
    startsAtMs: 0,
    entries: [
      'Opening AIR3 session',
      'Resolving wallet identity',
      'Loading conversation context',
      'Checking market surface',
      'Reading recent news feed',
      'Scanning portfolio state',
    ],
  },
  {
    startsAtMs: 6_000,
    entries: [
      'Interrogating knowledge context',
      'Merging live market signals',
      'Reviewing last conversation turns',
      'Reconciling Pacifica account state',
      'Evaluating trade constraints',
      'Enumerating response paths',
    ],
  },
  {
    startsAtMs: 13_000,
    entries: [
      'Thinking through market structure',
      'Cross-checking execution hints',
      'Drafting trade narrative',
      'Preparing chart instructions',
      'Formulating response',
      'Writing final reply',
    ],
  },
  {
    startsAtMs: 22_000,
    entries: [
      'Finalizing response payload',
      'Staging chart output',
      'Queuing speech pipeline',
      'Preparing voice playback',
      'Packaging AIR3 reply',
      'Delivering response',
    ],
  },
] as const

const state = reactive({
  hydratedIdentity: '',
  conversationId: '',
  messages: [] as ConversationMessage[],
  sending: false,
  error: null as string | null,
  pendingReplyVisible: false,
  pendingReplyStartedAt: 0,
  pendingReplyStatus: '',
})

let pendingStatusTimer: ReturnType<typeof setInterval> | undefined
let pendingStatusCursor = 0
let lastPendingStatus = ''

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function getStorageKey(identity: string) {
  return `airifica:conversation:${identity}`
}

function sanitizeMessages(messages: ConversationMessage[]) {
  return messages
    .filter(message => message && typeof message.content === 'string')
    .map(({ restored: _restored, ...message }) => message)
    .slice(-120)
}

function persist(identity = wallet.sessionIdentity.value) {
  if (!identity)
    return

  if (!state.messages.length && !state.conversationId) {
    removeStorage(getStorageScope(), getStorageKey(identity))
    return
  }

  writeStorage(getStorageScope(), getStorageKey(identity), {
    conversationId: state.conversationId,
    messages: sanitizeMessages(state.messages),
  })
}

function hydrateForIdentity(identity = wallet.sessionIdentity.value) {
  if (!identity)
    return

  if (state.hydratedIdentity === identity)
    return

  const stored = readStorage<PersistedConversation | null>(getStorageScope(), getStorageKey(identity), null)
  state.hydratedIdentity = identity
  state.conversationId = stored?.conversationId || ''
  state.messages = Array.isArray(stored?.messages)
    ? sanitizeMessages(stored?.messages).map(message => ({ ...message, restored: true }))
    : []
  state.error = null
}

function pushMessage(message: Omit<ConversationMessage, 'id' | 'createdAt'> & Partial<Pick<ConversationMessage, 'id' | 'createdAt'>>) {
  state.messages.push({
    id: message.id || createId('message'),
    createdAt: message.createdAt || Date.now(),
    restored: false,
    ...message,
  })
  persist()
}

function patchMessage(messageId: string, patch: Partial<ConversationMessage>) {
  const target = state.messages.find(message => message.id === messageId)
  if (!target)
    return

  Object.assign(target, patch)
  persist()
}

function clearPendingReplyStatusTimer() {
  if (pendingStatusTimer) {
    clearInterval(pendingStatusTimer)
    pendingStatusTimer = undefined
  }
}

function showPendingReply(status: string) {
  state.pendingReplyVisible = true
  state.pendingReplyStartedAt = Date.now()
  state.pendingReplyStatus = status
}

function updatePendingReplyStatus(status: string) {
  state.pendingReplyStatus = status
  lastPendingStatus = status
}

function resolvePendingStatusPhase(elapsedMs: number) {
  for (let index = PENDING_STATUS_PHASES.length - 1; index >= 0; index -= 1) {
    const phase = PENDING_STATUS_PHASES[index]
    if (elapsedMs >= phase.startsAtMs)
      return phase
  }

  return PENDING_STATUS_PHASES[0]
}

function resolveNextPendingStatus() {
  const elapsedMs = Math.max(0, Date.now() - state.pendingReplyStartedAt)
  const phase = resolvePendingStatusPhase(elapsedMs)
  const entries = phase.entries
  if (!entries.length)
    return 'Formulating response'

  const offset = pendingStatusCursor % entries.length
  pendingStatusCursor += 1

  for (let step = 0; step < entries.length; step += 1) {
    const candidate = entries[(offset + step) % entries.length]
    if (candidate !== lastPendingStatus)
      return candidate
  }

  return entries[offset]
}

function startPendingReplyRotation() {
  if (typeof window === 'undefined')
    return

  clearPendingReplyStatusTimer()
  pendingStatusCursor = Math.floor(Math.random() * 3)
  pendingStatusTimer = setInterval(() => {
    if (!state.pendingReplyVisible)
      return

    updatePendingReplyStatus(resolveNextPendingStatus())
  }, 1700)
}

function hidePendingReply() {
  clearPendingReplyStatusTimer()
  state.pendingReplyVisible = false
  state.pendingReplyStartedAt = 0
  state.pendingReplyStatus = ''
  lastPendingStatus = ''
}

function createAssistantMessage(envelope: Air3MessageEnvelope) {
  const content = extractMessageText(envelope) || 'Response received without textual content.'

  return {
    id: createId('assistant'),
    role: 'assistant' as const,
    content,
    createdAt: Date.now(),
    conversationId: envelope.conversationId,
    action: envelope.message.action,
    image: envelope.message.image,
    proposal: envelope.message.proposal,
    proposalPending: hasPendingProposal(envelope),
    meta: envelope.message.meta,
  }
}

async function deriveProposalForMessage(message: ConversationMessage) {
  if (!message.proposalPending)
    return

  try {
    const client = createAir3Client({
      token: wallet.token.value || undefined,
    })
    const response = await client.deriveTradeProposal({
      conversationId: state.conversationId || message.conversationId,
      headers: wallet.buildRequestHeaders(),
      message: {
        text: message.content,
        action: message.action,
        image: message.image,
        meta: message.meta,
      },
    })

    patchMessage(message.id, {
      proposalPending: false,
      proposal: response.proposal || deriveProposalFallback(message),
    })
  }
  catch {
    patchMessage(message.id, {
      proposalPending: false,
      proposal: deriveProposalFallback(message),
    })
  }
}

async function sendMessage(text: string) {
  const content = text.trim()
  if (!content || state.sending)
    return

  hydrateForIdentity()

  pushMessage({
    role: 'user',
    content,
  })

  state.sending = true
  state.error = null
  showPendingReply('Opening AIR3 session')

  try {
    const client = createAir3Client({
      token: wallet.token.value || undefined,
    })

    const session = await client.createSession({
      walletAddress: wallet.sessionIdentity.value,
      conversationId: state.conversationId || undefined,
      headers: wallet.buildRequestHeaders(),
    })

    state.conversationId = session.conversationId
    updatePendingReplyStatus(resolveNextPendingStatus())
    startPendingReplyRotation()

    const response = await client.sendMessage({
      walletAddress: wallet.sessionIdentity.value,
      conversationId: session.conversationId,
      text: content,
      headers: wallet.buildRequestHeaders(),
    })

    if (!response.responses.length) {
      hidePendingReply()
      pushMessage({
        role: 'system',
        content: 'AIR3 returned an empty response payload.',
      })
      return
    }

    updatePendingReplyStatus('Preparing final response')
    const assistantMessages = response.responses.map(createAssistantMessage)
    hidePendingReply()
    for (const message of assistantMessages)
      pushMessage(message)

    for (const message of assistantMessages) {
      if (message.proposalPending)
        void deriveProposalForMessage(message)
    }
  }
  catch (error) {
    hidePendingReply()
    state.error = error instanceof Error ? error.message : 'Failed to contact AIR3.'
    pushMessage({
      role: 'system',
      content: state.error,
    })
  }
  finally {
    state.sending = false
    persist()
  }
}

function resetConversation() {
  state.conversationId = ''
  state.messages = []
  state.error = null
  persist()
}

function primeConversationId(conversationId: string | null | undefined) {
  const nextConversationId = String(conversationId || '').trim()
  if (!nextConversationId)
    return

  hydrateForIdentity()
  state.conversationId = nextConversationId
  persist()
}

function injectExternalProposal(input: {
  proposal: Air3TradeProposal
  content?: string
  conversationId?: string | null
  tradePresetUsd?: number | null
  externalProposalId?: number | null
}) {
  hydrateForIdentity()

  const content = String(input.content || '').trim() || `Telegram handoff ready for ${input.proposal.symbol}.`
  const conversationId = String(input.conversationId || state.conversationId || createId('conversation')).trim()
  state.conversationId = conversationId

  pushMessage({
    role: 'assistant',
    content,
    conversationId,
    proposal: input.proposal,
    tradePresetUsd: input.tradePresetUsd ?? null,
    externalProposalId: input.externalProposalId ?? null,
  })
}

function injectSpotCloseIntent(input: {
  mintAddress: string
  symbol: string
  marketQuery: string
  closePct: number
  content?: string
  conversationId?: string | null
}) {
  hydrateForIdentity()

  const symbol = String(input.symbol || input.marketQuery || 'TOKEN').trim().toUpperCase()
  const content = String(input.content || '').trim() || `Telegram requested ${input.closePct >= 100 ? 'a full close' : `a ${input.closePct}% close`} for ${symbol}.`
  const conversationId = String(input.conversationId || state.conversationId || createId('conversation')).trim()
  state.conversationId = conversationId

  pushMessage({
    role: 'assistant',
    content,
    conversationId,
    spotCloseIntent: {
      mintAddress: String(input.mintAddress || '').trim(),
      symbol,
      marketQuery: String(input.marketQuery || symbol).trim(),
      closePct: Math.min(100, Math.max(1, Math.round(Number(input.closePct || 100)))),
    },
  })
}

export function useConversationState() {
  return {
    hydratedIdentity: computed(() => state.hydratedIdentity),
    conversationId: computed(() => state.conversationId),
    messages: computed(() => state.messages),
    sending: computed(() => state.sending),
    error: computed(() => state.error),
    pendingMessage: computed<ConversationMessage | null>(() => {
      if (!state.pendingReplyVisible)
        return null

      return {
        id: 'pending-assistant',
        role: 'assistant',
        content: '',
        createdAt: state.pendingReplyStartedAt || Date.now(),
        pending: true,
        statusNote: state.pendingReplyStatus,
      }
    }),
    hasConversation: computed(() => Boolean(state.conversationId || state.messages.length)),
    latestAssistantMessage: computed(() =>
      [...state.messages].reverse().find(message => message.role === 'assistant') || null,
    ),
    hydrateForIdentity,
    sendMessage,
    resetConversation,
    primeConversationId,
    injectExternalProposal,
    injectSpotCloseIntent,
  }
}
