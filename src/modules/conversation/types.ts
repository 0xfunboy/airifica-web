import type { Air3MessageMeta, Air3TradeProposal } from '@airifica/air3-client'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  conversationId?: string
  action?: string
  image?: string
  proposal?: Air3TradeProposal
  proposalPending?: boolean
  meta?: Air3MessageMeta
}
