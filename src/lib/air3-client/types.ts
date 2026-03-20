export interface Air3ClientConfig {
  runtimeBaseUrl?: string
  serviceApiBaseUrl?: string
  headers?: HeadersInit
  token?: string
  timeoutMs?: number
}

export interface Air3MessageMeta {
  source?: string
  provider?: string
}

export interface Air3TradeProposal {
  symbol: string
  side: 'LONG' | 'SHORT'
  entry: number
  tp: number
  sl: number
  timeframe: string
  confidence: number
  thesis: string
  sourceAction: string
}

export interface Air3MessageContent {
  text?: string
  image?: string
  action?: string
  proposal?: Air3TradeProposal
  meta?: Air3MessageMeta
}

export interface Air3MessageEnvelope {
  ok: boolean
  conversationId: string
  message: Air3MessageContent
  error?: string
}

export interface Air3SessionResponse {
  ok: boolean
  conversationId: string
  userId: string
  roomId: string
}

export interface Air3HistoryResponse {
  ok: boolean
  history: Air3MessageEnvelope[]
}

export interface Air3ProposalResponse {
  ok: boolean
  proposal: Air3TradeProposal | null
}

export interface Air3WalletChallengeResponse {
  message: string
}

export interface Air3AuthVerifyResponse {
  token: string
  user: {
    id: number
    address: string
    isAdmin: boolean
  }
}

export interface Air3PacificaStatus {
  hasBinding: boolean
  builderApproved: boolean
  agentBound: boolean
  isActive: boolean
  readyToExecute: boolean
  agentWalletPublicKey?: string
  pacificaAccount?: string
  builderCode?: string
}

export interface Air3PacificaUnsignedPayload {
  type: string
  timestamp: number
  expiry_window: number
  data: Record<string, unknown>
}

export interface Air3PacificaPrepareAgentResponse {
  ok: boolean
  agentWalletPublicKey: string
  builderCode: string
  unsignedPayloads: {
    approveBuilder: Air3PacificaUnsignedPayload
    bindAgent: Air3PacificaUnsignedPayload
  }
}

export interface Air3PacificaPrepareAgentOptions {
  builderCode?: string
  referralCode?: string
}

export interface Air3PacificaAccountSnapshot {
  balance: number
  equity: number
  availableToSpend: number
  availableToWithdraw: number
  pendingBalance: number
  totalMarginUsed: number
  positionsCount: number
  ordersCount: number
  stopOrdersCount: number
  updatedAt: number
  raw?: Record<string, unknown>
}

export interface Air3PacificaPosition {
  symbol: string
  side: 'LONG' | 'SHORT' | null
  amount: number
  entryPrice: number
  markPrice: number
  funding: number
  margin: number
  isolated: boolean
  createdAt: number
  updatedAt: number
  raw?: Record<string, unknown>
}

export interface Air3PacificaOverview {
  ok: boolean
  status: Air3PacificaStatus
  account: Air3PacificaAccountSnapshot | null
  positions: Air3PacificaPosition[]
  accountMissing?: boolean
  minimumDepositUsd?: number | null
  onboardingHint?: string | null
}

export interface Air3CreateTradeProposalResponse {
  ok: boolean
  proposal?: {
    id: number
  }
  error?: string
}

export interface Air3ApproveTradeProposalResponse {
  ok: boolean
  orderId?: string | null
  pacificaResponse?: unknown
  error?: string
  hint?: string
  needsOnboarding?: boolean
}

export interface Air3ClosePositionResponse {
  ok: boolean
  closed?: {
    symbol: string
    side: 'LONG' | 'SHORT'
    amount: number
  }
  orderId?: string | null
  pacificaResponse?: unknown
}

export interface Air3MarketContextCandle {
  open: number
  high: number
  low: number
  close: number
  volume?: number
  timestamp?: number
  time?: number
}

export interface Air3MarketContext {
  symbol: string
  tf: string
  provider: string
  venue: string
  marketSymbol: string
  quote: string
  price: number
  changePct: number
  high: number
  low: number
  updatedAt: number
  funding?: number | null
  openInterest?: number | null
  supportedOnPacifica?: boolean
  tickSize?: number | null
  lotSize?: number | null
  minOrderSize?: number | null
  maxLeverage?: number | null
  data: Air3MarketContextCandle[]
}

export interface Air3HealthResponse {
  ok: boolean
  service: string
  pacificaApiBase?: string
  pacificaPublicApiBase?: string
}
