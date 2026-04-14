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
  feeLevel: number
  makerFee: number
  takerFee: number
  equity: number
  availableToSpend: number
  availableToWithdraw: number
  pendingBalance: number
  totalMarginUsed: number
  crossMmr: number
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
  liquidationPrice: number
  takeProfitPrice: number
  stopLossPrice: number
  notionalUsd: number
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  funding: number
  margin: number
  isolated: boolean
  openOrderCount: number
  createdAt: number
  updatedAt: number
  raw?: Record<string, unknown>
}

export interface Air3OnchainPosition {
  symbol: string
  mintAddress: string
  quantity: number
  decimals?: number
  priceUsd?: number | null
  valueUsd?: number | null
  costBasisUsd?: number | null
  unrealizedPnlUsd?: number | null
  realizedPnlUsd?: number | null
  provider?: string | null
  marketQuery?: string | null
  lastTradeAt?: number | null
  lastTxSignature?: string | null
  updatedAt: number
}

export interface Air3PacificaOverview {
  ok: boolean
  status: Air3PacificaStatus
  account: Air3PacificaAccountSnapshot | null
  positions: Air3PacificaPosition[]
  onchainPositions?: Air3OnchainPosition[]
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
  requiresBetaAccess?: boolean
  redeemUrl?: string
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
  supportedOnJupiter?: boolean
  executionVenue?: 'pacifica' | 'jupiter' | null
  chainId?: string | null
  baseTokenAddress?: string | null
  baseTokenName?: string | null
  pairAddress?: string | null
  liquidityUsd?: number | null
  volume24h?: number | null
  requestQuery?: string | null
  tickSize?: number | null
  lotSize?: number | null
  minOrderSize?: number | null
  maxLeverage?: number | null
  data: Air3MarketContextCandle[]
}

export interface Air3PacificaMarketRow {
  symbol: string
  price: number
  changePct: number
  volume24h: number
  funding?: number | null
  openInterest?: number | null
  tickSize?: number | null
  lotSize?: number | null
  minOrderSize?: number | null
  maxLeverage?: number | null
}

export interface Air3MarketUniverseResponse {
  ok: boolean
  markets: Air3PacificaMarketRow[]
}

export interface Air3TelegramLink {
  chatId: string
  userId: string | null
  username: string | null
  firstName: string | null
  walletAddress: string
  linkedAt: number
  alertsEnabled: boolean
  conversationalEnabled: boolean
}

export interface Air3TelegramLinkRequestResponse {
  ok: boolean
  code: string
  expiresAt: number
  deepLinkUrl: string
  linkedChats: Air3TelegramLink[]
}

export interface Air3TelegramLinkStatusResponse {
  ok: boolean
  botUsername: string | null
  linkedChats: Air3TelegramLink[]
}

export interface Air3TelegramNotifyTradeResponse {
  ok: boolean
  queued: number
}

export interface Air3HealthResponse {
  ok: boolean
  service: string
  pacificaApiBase?: string
  pacificaPublicApiBase?: string
}

export interface Air3AdminMetricEntry {
  key: string
  count: number
  updatedAt: number
}

export interface Air3AdminUserRow {
  walletAddress: string
  firstSeenAt: number
  lastSeenAt: number
  verifiedAt: number | null
  authCount: number
  isAdmin: boolean
  lastSource: string | null
  linkedChats: number
  binding: {
    isActive: boolean
    builderApprovedAt: number | null
    agentBoundAt: number | null
    pacificaAccount: string | null
  } | null
  latestTrade: {
    symbol: string
    side: 'LONG' | 'SHORT'
    updatedAt: number
  } | null
}

export interface Air3AdminTradeRow {
  id: number
  walletAddress: string
  symbol: string
  side: 'LONG' | 'SHORT'
  venue: string
  source: string
  orderId: string | null
  notionalUsd: number
  marginUsd: number
  leverage: number
  updatedAt: number
}

export interface Air3AdminOverviewResponse {
  ok: boolean
  generatedAt: number
  overview: {
    totalKnownWallets: number
    verifiedWallets: number
    adminWalletsSeen: number
    adminWalletsConfigured: number
    pacificaBindings: number
    pacificaBuildersApproved: number
    pacificaActiveAgents: number
    totalProposals: number
    executedTrades: number
    pacificaExecutedVolumeUsd: number
    externalReportedVolumeUsd: number
    marketUniverseCount: number
  }
  users: {
    recent: Air3AdminUserRow[]
  }
  trading: {
    proposalStatusCounts: Record<string, number>
    recentTrades: Air3AdminTradeRow[]
    topRequestedTickers: Air3AdminMetricEntry[]
    topRequestedContracts: Air3AdminMetricEntry[]
    topTradeSymbols: Air3AdminMetricEntry[]
  }
  telegram: {
    configured: boolean
    botUsername: string | null
    linkedChats: number
    linkedWallets: number
    alertsEnabledChats: number
    conversationEnabledChats: number
    pendingLinkCodes: number
    deliveredAlerts: number
    failedAlerts: number
    pendingAlerts: number
    heartbeat: {
      live: boolean
      lastSeenAt: number | null
      meta: Record<string, unknown>
    }
    topCommands: Air3AdminMetricEntry[]
    topActions: Air3AdminMetricEntry[]
  }
  runtime: {
    service: string
    nodeEnv: string
    port: number
    pid: number
    uptimeSec: number
    memory: {
      rssMb: number
      heapUsedMb: number
      heapTotalMb: number
    }
    config: {
      publicAppUrl: string | null
      corsOriginsConfigured: number
      pacificaApiBase: string
      pacificaPublicApiBase: string
      pacificaBuilderCode: string | null
      pacificaBuilderMaxFeeRate: string | null
      encryptionKeyConfigured: boolean
      authSecretConfigured: boolean
      telegramBotUsername: string | null
      telegramInternalConfigured: boolean
      telegramNotifyBaseUrl: string | null
      adminWallets: string[]
    }
  }
}
