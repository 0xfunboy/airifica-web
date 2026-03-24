import type {
  Air3ApproveTradeProposalResponse,
  Air3AuthVerifyResponse,
  Air3ClientConfig,
  Air3ClosePositionResponse,
  Air3CreateTradeProposalResponse,
  Air3HealthResponse,
  Air3HistoryResponse,
  Air3MarketContext,
  Air3MarketUniverseResponse,
  Air3MessageContent,
  Air3MessageEnvelope,
  Air3PacificaOverview,
  Air3PacificaPrepareAgentOptions,
  Air3PacificaPrepareAgentResponse,
  Air3SessionResponse,
  Air3TradeProposal,
  Air3WalletChallengeResponse,
} from './types'

import { resolveRuntimeBaseUrl, resolveServiceApiBaseUrl } from './config'
import { requestJson } from './http'

const PROPOSAL_ACTIONS = new Set([
  'GET_CRYPTO_CHART',
  'GET_TOKEN_CHART',
  'GET_CRYPTO_ANALYSIS',
  'GET_TOKEN_ANALYSIS',
])

function isNotFoundError(error: unknown) {
  return error instanceof Error && /\b404\b/.test(error.message)
}

function uniqueUrls(urls: Array<string | null | undefined>) {
  return [...new Set(urls.filter((value): value is string => Boolean(value)))]
}

export interface CreateSessionInput {
  walletAddress: string
  conversationId?: string
  headers?: HeadersInit
}

export interface SendMessageInput {
  walletAddress: string
  conversationId: string
  text: string
  headers?: HeadersInit
}

export interface SendConversationMessageInput {
  walletAddress: string
  text: string
  conversationId?: string
  headers?: HeadersInit
}

export interface FetchConversationHistoryInput {
  walletAddress: string
  conversationId: string
  count?: number
  headers?: HeadersInit
}

export interface DeriveTradeProposalInput {
  conversationId?: string
  message: Air3MessageContent
  headers?: HeadersInit
}

export interface CreateTradeProposalInput {
  walletAddress: string
  conversationId?: string
  proposal: Air3TradeProposal
  headers?: HeadersInit
}

export interface ApproveTradeProposalInput {
  proposalId: number
  walletAddress: string
  notionalUsd?: number
  leverage?: number
  headers?: HeadersInit
}

export interface PreparePacificaAgentInput {
  pacificaAccount: string
  maxFeeRate?: string
  options?: Air3PacificaPrepareAgentOptions
  headers?: HeadersInit
}

export interface SignedPayloadInput {
  signedPayload: Record<string, unknown>
  headers?: HeadersInit
}

export interface ClosePacificaPositionInput {
  symbol: string
  side?: 'LONG' | 'SHORT'
  amount?: number
  headers?: HeadersInit
}

export interface FetchMarketContextInput {
  symbol: string
  timeframe?: string
  limit?: number
  headers?: HeadersInit
}

export class Air3Client {
  constructor(private readonly config: Air3ClientConfig = {}) {}

  private resolveAuthEndpointCandidates(path: '/auth/challenge' | '/auth/verify') {
    const runtimeBaseUrl = resolveRuntimeBaseUrl(this.config)
    const serviceApiBaseUrl = resolveServiceApiBaseUrl(this.config)

    return uniqueUrls([
      `${serviceApiBaseUrl}${path}`,
      runtimeBaseUrl ? `${runtimeBaseUrl}/api${path}` : null,
      runtimeBaseUrl ? `${runtimeBaseUrl}${path}` : null,
      `/api${path}`,
      path,
    ])
  }

  private async requestAuthEndpoint<T>(path: '/auth/challenge' | '/auth/verify', init: RequestInit, timeoutMs: number) {
    const candidates = this.resolveAuthEndpointCandidates(path)
    let lastError: unknown = null

    for (const url of candidates) {
      try {
        return await requestJson<T>(this.config, url, init, timeoutMs)
      }
      catch (error) {
        lastError = error
        if (!isNotFoundError(error) || url === candidates[candidates.length - 1])
          throw error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Authentication endpoint unavailable.')
  }

  requestWalletChallenge(address: string, headers?: HeadersInit) {
    return this.requestAuthEndpoint<Air3WalletChallengeResponse>(
      '/auth/challenge',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ address }),
      },
      20_000,
    )
  }

  verifyWalletChallenge(message: string, signature: string, address: string, headers?: HeadersInit) {
    return this.requestAuthEndpoint<Air3AuthVerifyResponse>(
      '/auth/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ message, signature, address }),
      },
      25_000,
    )
  }

  createSession(input: CreateSessionInput) {
    return requestJson<Air3SessionResponse>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/airi3/session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.walletAddress,
          conversationId: input.conversationId,
        }),
      },
    )
  }

  sendMessage(input: SendMessageInput) {
    return requestJson<{ ok: boolean, responses: Air3MessageEnvelope[] }>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/airi3/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.walletAddress,
          conversationId: input.conversationId,
          text: input.text,
        }),
      },
      150_000,
    )
  }

  async sendConversationMessage(input: SendConversationMessageInput) {
    const session = await this.createSession({
      walletAddress: input.walletAddress,
      conversationId: input.conversationId,
      headers: input.headers,
    })

    const response = await this.sendMessage({
      walletAddress: input.walletAddress,
      conversationId: session.conversationId,
      text: input.text,
      headers: input.headers,
    })

    return {
      conversationId: session.conversationId,
      responses: response.responses,
    }
  }

  fetchConversationHistory(input: FetchConversationHistoryInput) {
    const params = new URLSearchParams({
      walletAddress: input.walletAddress,
      conversationId: input.conversationId,
      count: String(input.count ?? 20),
    })

    return requestJson<Air3HistoryResponse>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/airi3/history?${params.toString()}`,
      {
        method: 'GET',
        headers: input.headers,
      },
    )
  }

  deriveTradeProposal(input: DeriveTradeProposalInput) {
    return requestJson<{ ok: boolean, proposal: Air3TradeProposal | null }>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/proposal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          conversationId: input.conversationId,
          message: input.message,
        }),
      },
      45_000,
    )
  }

  createTradeProposal(input: CreateTradeProposalInput) {
    return requestJson<Air3CreateTradeProposalResponse>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/proposals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.walletAddress,
          conversation_id: input.conversationId,
          symbol: input.proposal.symbol,
          side: input.proposal.side,
          entry_price: input.proposal.entry,
          tp_price: input.proposal.tp,
          sl_price: input.proposal.sl,
          timeframe: input.proposal.timeframe,
          confidence: input.proposal.confidence,
          thesis: input.proposal.thesis,
          raw_payload_json: JSON.stringify(input.proposal),
          source_client: 'AIRIFICA_WEB',
        }),
      },
      30_000,
    )
  }

  approveTradeProposal(input: ApproveTradeProposalInput) {
    return requestJson<Air3ApproveTradeProposalResponse>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/proposals/${input.proposalId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          walletAddress: input.walletAddress,
          ...(input.notionalUsd ? { notional_usd: input.notionalUsd } : {}),
          ...(input.leverage ? { leverage: input.leverage } : {}),
        }),
      },
      30_000,
    )
  }

  fetchPacificaStatus(headers?: HeadersInit) {
    return requestJson<{ ok: boolean, status: Air3PacificaOverview['status'] }>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/status`,
      {
        method: 'GET',
        headers,
      },
    )
  }

  fetchPacificaOverview(headers?: HeadersInit) {
    return requestJson<Air3PacificaOverview>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/overview`,
      {
        method: 'GET',
        headers,
      },
      25_000,
    )
  }

  preparePacificaAgent(input: PreparePacificaAgentInput) {
    return requestJson<Air3PacificaPrepareAgentResponse>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/prepare-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          pacificaAccount: input.pacificaAccount,
          ...(input.maxFeeRate ? { max_fee_rate: input.maxFeeRate } : {}),
          ...(input.options?.builderCode ? { builderCode: input.options.builderCode } : {}),
          ...(input.options?.referralCode ? { referralCode: input.options.referralCode } : {}),
        }),
      },
      25_000,
    )
  }

  approvePacificaBuilder(input: SignedPayloadInput) {
    return requestJson<{ ok: boolean, pacificaResponse: unknown }>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/approve-builder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          signedPayload: input.signedPayload,
        }),
      },
      30_000,
    )
  }

  bindPacificaAgent(input: SignedPayloadInput) {
    return requestJson<{ ok: boolean, pacificaResponse: unknown }>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/bind-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          signedPayload: input.signedPayload,
        }),
      },
      30_000,
    )
  }

  closePacificaPosition(input: ClosePacificaPositionInput) {
    return requestJson<Air3ClosePositionResponse>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/pacifica/positions/close`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify({
          symbol: input.symbol,
          ...(input.side ? { side: input.side } : {}),
          ...(input.amount ? { amount: input.amount } : {}),
        }),
      },
      30_000,
    )
  }

  fetchMarketContext(input: FetchMarketContextInput) {
    const params = new URLSearchParams({
      symbol: input.symbol,
      tf: input.timeframe ?? '1h',
      limit: String(input.limit ?? 96),
    })

    return requestJson<Air3MarketContext>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/market-context?${params.toString()}`,
      {
        method: 'GET',
        headers: input.headers,
      },
    )
  }

  fetchMarketUniverse(headers?: HeadersInit) {
    return requestJson<Air3MarketUniverseResponse>(
      this.config,
      `${resolveServiceApiBaseUrl(this.config)}/airi3/market-universe`,
      {
        method: 'GET',
        headers,
      },
      25_000,
    )
  }

  fetchHealth(headers?: HeadersInit) {
    return requestJson<Air3HealthResponse>(
      this.config,
      `${resolveRuntimeBaseUrl(this.config)}/api/airi3/health`,
      {
        method: 'GET',
        headers,
      },
    )
  }
}

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
