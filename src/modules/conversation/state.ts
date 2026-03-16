import { computed, reactive } from 'vue'

import type { Air3MessageEnvelope } from '@airifica/air3-client'

import { extractMessageText, hasPendingProposal } from '@airifica/air3-client'

import { createId } from '@/lib/ids'
import { createAir3Client } from '@/lib/air3'
import { readStorage, removeStorage, writeStorage } from '@/lib/storage'
import { useWalletSession } from '@/modules/wallet/session'

import type { ConversationMessage } from './types'

interface PersistedConversation {
  conversationId: string
  messages: ConversationMessage[]
}

const wallet = useWalletSession()

const state = reactive({
  hydratedIdentity: '',
  conversationId: '',
  messages: [] as ConversationMessage[],
  sending: false,
  error: null as string | null,
})

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function getStorageKey(identity: string) {
  return `airifica:conversation:${identity}`
}

function sanitizeMessages(messages: ConversationMessage[]) {
  return messages
    .filter(message => message && typeof message.content === 'string')
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
  state.messages = Array.isArray(stored?.messages) ? sanitizeMessages(stored?.messages) : []
  state.error = null
}

function pushMessage(message: Omit<ConversationMessage, 'id' | 'createdAt'> & Partial<Pick<ConversationMessage, 'id' | 'createdAt'>>) {
  state.messages.push({
    id: message.id || createId('message'),
    createdAt: message.createdAt || Date.now(),
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
      proposal: response.proposal || undefined,
    })
  }
  catch {
    patchMessage(message.id, {
      proposalPending: false,
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

  try {
    const client = createAir3Client({
      token: wallet.token.value || undefined,
    })

    const response = await client.sendConversationMessage({
      walletAddress: wallet.sessionIdentity.value,
      conversationId: state.conversationId || undefined,
      text: content,
      headers: wallet.buildRequestHeaders(),
    })

    state.conversationId = response.conversationId

    if (!response.responses.length) {
      pushMessage({
        role: 'system',
        content: 'AIR3 returned an empty response payload.',
      })
      return
    }

    const assistantMessages = response.responses.map(createAssistantMessage)
    for (const message of assistantMessages)
      pushMessage(message)

    for (const message of assistantMessages) {
      if (message.proposalPending)
        void deriveProposalForMessage(message)
    }
  }
  catch (error) {
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

export function useConversationState() {
  return {
    hydratedIdentity: computed(() => state.hydratedIdentity),
    conversationId: computed(() => state.conversationId),
    messages: computed(() => state.messages),
    sending: computed(() => state.sending),
    error: computed(() => state.error),
    hasConversation: computed(() => Boolean(state.conversationId || state.messages.length)),
    latestAssistantMessage: computed(() =>
      [...state.messages].reverse().find(message => message.role === 'assistant') || null,
    ),
    hydrateForIdentity,
    sendMessage,
    resetConversation,
    primeConversationId,
  }
}
