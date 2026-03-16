import type { Air3TradeProposal } from '@airifica/air3-client'

export interface WorkbenchSettings {
  runtimeBaseUrl: string
  serviceBaseUrl: string
  sessionIdentity: string
  token: string
  marketSymbol: string
  remoteModelUrl: string
  modelSource: 'remote' | 'file'
  autoSpeak: boolean
  preferredVoice: string
}

export interface ImportedModelMeta {
  name: string
  size: number
  updatedAt: number
}

export interface WorkbenchMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  proposal?: Air3TradeProposal
  image?: string
  pendingProposal?: boolean
}

