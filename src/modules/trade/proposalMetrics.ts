import type { Air3TradeProposal } from '@/lib/air3-client'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function computeRiskReward(proposal: Air3TradeProposal) {
  const risk = Math.abs(proposal.entry - proposal.sl)
  const reward = Math.abs(proposal.tp - proposal.entry)
  if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0 || reward <= 0)
    return 0
  return reward / risk
}

function countMatches(text: string, entries: Array<{ pattern: RegExp, weight: number }>) {
  return entries.reduce((score, entry) => score + (entry.pattern.test(text) ? entry.weight : 0), 0)
}

export function computeProposalConfidence(proposal: Air3TradeProposal, options?: { marketPrice?: number | null }) {
  const isLong = proposal.side === 'LONG'
  const structurallyValid = isLong
    ? proposal.sl < proposal.entry && proposal.entry < proposal.tp
    : proposal.tp < proposal.entry && proposal.entry < proposal.sl

  if (!structurallyValid)
    return 0.18

  const rr = computeRiskReward(proposal)
  const rrContribution = clamp((Math.min(rr, 3.4) - 1) * 0.11, -0.14, 0.26)
  const timeframe = proposal.timeframe.toLowerCase()
  const thesis = `${proposal.thesis || ''} ${proposal.sourceAction || ''}`.toLowerCase()

  const convictionSignals = countMatches(thesis, [
    { pattern: /\b(confirm|confirmation|confluence|reclaim|support|resistance|liquidity|breakout|momentum|volume|structure|invalidation)\b/, weight: 0.03 },
    { pattern: /\b(trend|continuation|rotation|compression|expansion|sweep|imbalance|supply|demand)\b/, weight: 0.025 },
    { pattern: /\b(clean|favorable|clear|strong|validated)\b/, weight: 0.02 },
  ])

  const uncertaintySignals = countMatches(thesis, [
    { pattern: /\b(maybe|could|if|watch|monitor|possible|tentative|unclear|wait)\b/, weight: 0.035 },
    { pattern: /\b(caution|risk|volatile|headline|news-driven|unconfirmed|thin liquidity)\b/, weight: 0.03 },
  ])

  let score = 0.48 + rrContribution + convictionSignals - uncertaintySignals

  if (timeframe.includes('4h') || timeframe.includes('1d'))
    score += 0.04
  else if (timeframe.includes('1h'))
    score += 0.02
  else if (timeframe.includes('5m') || timeframe.includes('15m'))
    score -= 0.03

  if (Number.isFinite(options?.marketPrice) && proposal.entry > 0) {
    const drift = Math.abs(Number(options?.marketPrice) - proposal.entry) / proposal.entry
    score += clamp(0.13 - drift * 7.5, -0.12, 0.13)
  }

  return clamp(score, 0.18, 0.96)
}
