import type { AvatarExpression } from '@airifica/avatar3d'

const EXPRESSION_RULES: Array<{ expression: AvatarExpression, patterns: RegExp[] }> = [
  {
    expression: 'surprised',
    patterns: [/breakout/i, /volatility/i, /surge/i, /alert/i, /unexpected/i],
  },
  {
    expression: 'happy',
    patterns: [/profit/i, /bull/i, /strong/i, /upside/i, /confidence/i],
  },
  {
    expression: 'sad',
    patterns: [/risk/i, /drawdown/i, /loss/i, /downside/i, /caution/i],
  },
]

export function detectAvatarExpression(text: string): AvatarExpression {
  for (const rule of EXPRESSION_RULES) {
    if (rule.patterns.some(pattern => pattern.test(text)))
      return rule.expression
  }

  return 'neutral'
}

