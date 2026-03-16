import type {
  Air3ClientConfig,
  Air3MarketContext,
  Air3MessageEnvelope,
  Air3PacificaOverview,
  Air3SessionResponse,
} from './types'

import { resolveRuntimeBaseUrl, resolveServiceBaseUrl } from './config'
import { requestJson } from './http'

export interface CreateSessionInput {
  sessionIdentity: string
  conversationId?: string
  headers?: HeadersInit
}

export interface SendMessageInput {
  sessionIdentity: string
  conversationId: string
  text: string
  headers?: HeadersInit
}

export interface SendConversationMessageInput {
  sessionIdentity: string
  text: string
  conversationId?: string
  headers?: HeadersInit
}

export interface FetchMarketContextInput {
  symbol: string
  limit?: number
  timeframe?: string
  baseUrl?: string
}

export class Air3Client {
  constructor(private readonly config: Air3ClientConfig = {}) {}

  createSession(input: CreateSessionInput) {
    return requestJson<Air3SessionResponse>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/air3/session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.sessionIdentity,
          conversationId: input.conversationId,
        }),
      },
    )
  }

  sendMessage(input: SendMessageInput) {
    return requestJson<{ ok: boolean, responses: Air3MessageEnvelope[] }>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/air3/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.sessionIdentity,
          conversationId: input.conversationId,
          text: input.text,
        }),
      },
      150_000,
    )
  }

  async sendConversationMessage(input: SendConversationMessageInput) {
    const session = await this.createSession({
      sessionIdentity: input.sessionIdentity,
      conversationId: input.conversationId,
      headers: input.headers,
    })

    const response = await this.sendMessage({
      sessionIdentity: input.sessionIdentity,
      conversationId: session.conversationId,
      text: input.text,
      headers: input.headers,
    })

    return {
      conversationId: session.conversationId,
      responses: response.responses,
    }
  }

  fetchMarketContext(input: FetchMarketContextInput) {
    const params = new URLSearchParams({
      symbol: input.symbol,
      limit: String(input.limit ?? 96),
      tf: input.timeframe ?? '15m',
    })

    return requestJson<Air3MarketContext>(
      this.config,
      `${input.baseUrl || resolveServiceBaseUrl(this.config)}/air3/market-context?${params.toString()}`,
    )
  }

  fetchPacificaOverview(baseUrl?: string) {
    return requestJson<Air3PacificaOverview>(
      this.config,
      `${baseUrl || resolveServiceBaseUrl(this.config)}/air3/pacifica/overview`,
    )
  }
}

const PROPOSAL_ACTIONS = new Set([
  'GET_CRYPTO_CHART',
  'GET_TOKEN_CHART',
  'GET_CRYPTO_ANALYSIS',
  'GET_TOKEN_ANALYSIS',
])

export function extractMessageText(envelope: Air3MessageEnvelope) {
  return (envelope.message.text || '').replace(/<\|[^|]*\|>/g, '').trim()
}

export function hasPendingProposal(envelope: Air3MessageEnvelope) {
  return Boolean(
    envelope.message.action
    && PROPOSAL_ACTIONS.has(envelope.message.action)
    && !envelope.message.proposal,
  )
}

