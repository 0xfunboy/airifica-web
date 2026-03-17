import type { Air3TradeProposal } from '@airifica/air3-client'

import { computeProposalConfidence } from '@/modules/trade/proposalMetrics'

import type { ConversationMessage } from '@/modules/conversation/types'

const SUMMARY_ACTIONS = new Set([
  'GET_CRYPTO_CHART',
  'GET_TOKEN_CHART',
  'GET_CRYPTO_ANALYSIS',
  'GET_TOKEN_ANALYSIS',
])

function parseLooseNumber(raw: string | null | undefined) {
  const normalized = String(raw || '')
    .replace(/[$,%]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '')
    .trim()

  if (!normalized)
    return null

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function pickMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1])
      return match[1]
  }

  return null
}

function extractSymbol(text: string) {
  const direct = text.match(/\$([A-Z0-9]{2,12})\s*-\s*[0-9]{1,3}[MHDW]\b/i)?.[1]
    || text.match(/\b([A-Z0-9]{2,12})\s*\/\s*(?:USDT|USD|USDC)\b/i)?.[1]
  return direct ? direct.toUpperCase() : null
}

function extractTimeframe(text: string) {
  return text.match(/\$[A-Z0-9]{2,12}\s*-\s*([0-9]{1,3}[MHDW])\b/i)?.[1]?.toUpperCase()
    || text.match(/\b([0-9]{1,3}[MHDW])\s+chart\b/i)?.[1]?.toUpperCase()
    || '1H'
}

function extractSide(text: string) {
  if (/\b(STAY OUT|NO TRADE|WAIT FOR|AVOID ENTRY)\b/i.test(text))
    return null
  if (/\b(GO|LEAN|BIAS)\s+LONG\b/i.test(text) || /\bLONG\b/.test(text))
    return 'LONG' as const
  if (/\b(GO|LEAN|BIAS)\s+SHORT\b/i.test(text) || /\bSHORT\b/.test(text))
    return 'SHORT' as const
  return null
}

function extractStance(text: string) {
  if (/\b(STAY OUT|NO TRADE|WAIT FOR|AVOID ENTRY)\b/i.test(text))
    return 'STAY_OUT' as const
  return extractSide(text)
}

function extractLevel(text: string, labels: string[]) {
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const matcher = `(?:${escaped.join('|')})`
  const aroundPattern = new RegExp(`\\b${matcher}\\b[^\\d$\\-]*(?:around|near|at|above|below)?[^\\d$\\-]*([$]?[\\d,.]+(?:\\.\\d+)?)`, 'i')
  const genericPattern = new RegExp(`\\b${matcher}\\b[^\\d$\\-]*([$]?[\\d,.]+(?:\\.\\d+)?)`, 'i')
  return parseLooseNumber(pickMatch(text, [aroundPattern, genericPattern]))
}

function extractThesis(text: string, side: 'LONG' | 'SHORT', symbol: string, actionName: string) {
  const thesisBlock = text.match(/\bACTION STRATEGY:\s*([\s\S]*?)(?:\n\s*[◻📣]|$)/i)?.[1]?.trim()
    || text.match(/\bCONSIDERATIONS:\s*([\s\S]*?)(?:\n\s*[📣]|$)/i)?.[1]?.trim()
    || text.trim()

  return thesisBlock
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .slice(0, 320)
    || `${side} ${symbol} setup extracted from ${actionName}`
}

export function deriveProposalFallback(message: Pick<ConversationMessage, 'content' | 'action'>): Air3TradeProposal | undefined {
  const text = String(message.content || '').trim()
  const actionName = String(message.action || '').trim().toUpperCase()
  if (!text || !actionName || !SUMMARY_ACTIONS.has(actionName))
    return undefined

  const symbol = extractSymbol(text)
  const side = extractSide(text)
  const entry = extractLevel(text, ['ENTRY', 'ENTRY PRICE'])
  const tp = extractLevel(text, ['TAKE PROFIT', 'TP', 'TARGET'])
  const sl = extractLevel(text, ['STOP LOSS', 'SL', 'INVALIDATION'])

  if (!symbol || !side || entry == null || tp == null || sl == null)
    return undefined

  const isLongValid = side === 'LONG' && sl < entry && entry < tp
  const isShortValid = side === 'SHORT' && tp < entry && entry < sl
  if (!isLongValid && !isShortValid)
    return undefined

  const proposal: Air3TradeProposal = {
    symbol,
    side,
    entry,
    tp,
    sl,
    timeframe: extractTimeframe(text),
    confidence: 0.66,
    thesis: extractThesis(text, side, symbol, actionName),
    sourceAction: actionName,
  }

  proposal.confidence = Number(computeProposalConfidence(proposal).toFixed(2))
  return proposal
}

export interface StrategySummary {
  symbol: string
  timeframe: string
  stance: 'LONG' | 'SHORT' | 'STAY_OUT'
  thesis: string
  sourceAction: string
}

export function deriveStrategySummary(message: Pick<ConversationMessage, 'content' | 'action'>): StrategySummary | undefined {
  const text = String(message.content || '').trim()
  const actionName = String(message.action || '').trim().toUpperCase()
  if (!text || !actionName || !SUMMARY_ACTIONS.has(actionName))
    return undefined

  const symbol = extractSymbol(text)
  const stance = extractStance(text)
  if (!symbol || !stance)
    return undefined

  return {
    symbol,
    timeframe: extractTimeframe(text),
    stance,
    thesis: extractThesis(text, stance === 'STAY_OUT' ? 'LONG' : stance, symbol, actionName),
    sourceAction: actionName,
  }
}
