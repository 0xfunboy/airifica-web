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

export interface Air3MessageMeta {
  source?: string
  provider?: string
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

export interface Air3MarketContextCandle {
  open: number
  high: number
  low: number
  close: number
  volume?: number
  timestamp?: number
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
  data: Air3MarketContextCandle[]
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
}

export interface Air3ClientConfig {
  runtimeBaseUrl?: string
  serviceBaseUrl?: string
  token?: string
  headers?: HeadersInit
  timeoutMs?: number
}

