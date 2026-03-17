export type SpeechVisemeKey = 'A' | 'E' | 'I' | 'O' | 'U'
export type SpeechVisemeWeights = Record<SpeechVisemeKey, number>
export type SpeechVisemeFrame = {
  startMs: number
  durationMs: number
  weights: SpeechVisemeWeights
}

const LETTERS = /[a-z]/i
const WORDS = /[a-z']+|[^\s\w]+|\s+/gi
const CONSONANT_CLUSTER = /^[^aeiouy]+/i

const ZERO_VISEMES: SpeechVisemeWeights = {
  A: 0,
  E: 0,
  I: 0,
  O: 0,
  U: 0,
}

type VisemeSeed = {
  units: number
  weights: SpeechVisemeWeights
}

const VISEME_RULES: Array<{ pattern: RegExp, units: number, weights: Partial<SpeechVisemeWeights> }> = [
  { pattern: /^(eau|you|yoo|iou|ew)/, units: 1.18, weights: { U: 0.92, O: 0.24 } },
  { pattern: /^(ee|ea|ie|ei|ey|ay|igh|ai)/, units: 1.12, weights: { I: 0.9, E: 0.34 } },
  { pattern: /^(oo|ou|ue|ui|ew|uo)/, units: 1.14, weights: { U: 0.9, O: 0.28 } },
  { pattern: /^(oa|ow|oh|ore|oar|aw|au)/, units: 1.1, weights: { O: 0.92, U: 0.2 } },
  { pattern: /^(ar|ah|aa)/, units: 1.02, weights: { A: 0.92, E: 0.18 } },
  { pattern: /^a/, units: 0.94, weights: { A: 0.88, E: 0.16 } },
  { pattern: /^e/, units: 0.86, weights: { E: 0.82, I: 0.2 } },
  { pattern: /^(i|y)/, units: 0.82, weights: { I: 0.9, E: 0.22 } },
  { pattern: /^o/, units: 0.92, weights: { O: 0.88, U: 0.2 } },
  { pattern: /^u/, units: 0.9, weights: { U: 0.86, O: 0.2 } },
]

function createWeights(weights?: Partial<SpeechVisemeWeights>): SpeechVisemeWeights {
  return {
    A: clamp01(weights?.A ?? 0),
    E: clamp01(weights?.E ?? 0),
    I: clamp01(weights?.I ?? 0),
    O: clamp01(weights?.O ?? 0),
    U: clamp01(weights?.U ?? 0),
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number, min: number, max: number) {
  if (value <= min)
    return 0
  if (value >= max)
    return 1
  const x = (value - min) / (max - min)
  return x * x * (3 - 2 * x)
}

function createPause(units: number): VisemeSeed {
  return {
    units,
    weights: createWeights(),
  }
}

function splitWordToSeeds(token: string) {
  const seeds: VisemeSeed[] = []
  let remaining = token.toLowerCase()

  while (remaining) {
    const consonants = remaining.match(CONSONANT_CLUSTER)?.[0] ?? ''
    if (consonants) {
      const closureUnits = Math.min(0.72, 0.24 + consonants.length * 0.11)
      seeds.push(createPause(closureUnits))
      remaining = remaining.slice(consonants.length)
      continue
    }

    const rule = VISEME_RULES.find(entry => entry.pattern.test(remaining))
    if (rule) {
      const match = remaining.match(rule.pattern)?.[0] ?? remaining[0]
      seeds.push({
        units: rule.units,
        weights: createWeights(rule.weights),
      })
      remaining = remaining.slice(match.length)
      continue
    }

    if (LETTERS.test(remaining[0])) {
      seeds.push(createPause(0.32))
      remaining = remaining.slice(1)
      continue
    }

    remaining = remaining.slice(1)
  }

  return seeds
}

function estimateDurationMs(text: string, seedCount: number) {
  const normalized = text.trim()
  if (!normalized)
    return 0

  const punctuationCount = (normalized.match(/[.!?]/g) || []).length
  const commaCount = (normalized.match(/[,:;]/g) || []).length
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  return Math.max(
    460,
    wordCount * 210
      + seedCount * 58
      + punctuationCount * 180
      + commaCount * 90,
  )
}

export function cloneSpeechVisemeWeights(weights: Partial<SpeechVisemeWeights> | null | undefined): SpeechVisemeWeights {
  return createWeights(weights || undefined)
}

export function blendSpeechVisemeWeights(
  left: Partial<SpeechVisemeWeights> | null | undefined,
  right: Partial<SpeechVisemeWeights> | null | undefined,
  rightStrength: number,
) {
  const alpha = clamp01(rightStrength)
  const a = cloneSpeechVisemeWeights(left)
  const b = cloneSpeechVisemeWeights(right)
  return createWeights({
    A: a.A * (1 - alpha) + b.A * alpha,
    E: a.E * (1 - alpha) + b.E * alpha,
    I: a.I * (1 - alpha) + b.I * alpha,
    O: a.O * (1 - alpha) + b.O * alpha,
    U: a.U * (1 - alpha) + b.U * alpha,
  })
}

export function maxSpeechVisemeWeight(weights: Partial<SpeechVisemeWeights> | null | undefined) {
  const next = cloneSpeechVisemeWeights(weights)
  return Math.max(next.A, next.E, next.I, next.O, next.U)
}

export function createSpeechVisemeTimeline(text: string, totalDurationMs?: number) {
  const seeds: VisemeSeed[] = []
  const normalized = text.trim()
  if (!normalized)
    return [] as SpeechVisemeFrame[]

  for (const token of normalized.match(WORDS) || []) {
    if (/^\s+$/.test(token)) {
      seeds.push(createPause(0.46))
      continue
    }

    if (/^[,;:]+$/.test(token)) {
      seeds.push(createPause(0.9))
      continue
    }

    if (/^[.!?]+$/.test(token)) {
      seeds.push(createPause(1.38))
      continue
    }

    seeds.push(...splitWordToSeeds(token))
    seeds.push(createPause(0.18))
  }

  const totalUnits = Math.max(1, seeds.reduce((sum, seed) => sum + seed.units, 0))
  const targetDurationMs = totalDurationMs && totalDurationMs > 0
    ? totalDurationMs
    : estimateDurationMs(normalized, seeds.length)
  const msPerUnit = targetDurationMs / totalUnits

  let cursorMs = 0
  return seeds.map((seed) => {
    const frame = {
      startMs: cursorMs,
      durationMs: seed.units * msPerUnit,
      weights: seed.weights,
    }
    cursorMs += frame.durationMs
    return frame
  })
}

export function sampleSpeechVisemeTimeline(frames: SpeechVisemeFrame[], timeMs: number): SpeechVisemeWeights {
  if (!frames.length)
    return createWeights()

  const weights = createWeights()
  for (const frame of frames) {
    const attackMs = Math.min(68, Math.max(24, frame.durationMs * 0.32))
    const releaseMs = Math.min(92, Math.max(28, frame.durationMs * 0.4))
    const start = frame.startMs - attackMs
    const end = frame.startMs + frame.durationMs + releaseMs

    if (timeMs < start || timeMs > end)
      continue

    const local = timeMs - frame.startMs
    let envelope = 1

    if (local < 0)
      envelope = smoothstep(timeMs, start, frame.startMs)
    else if (local > frame.durationMs)
      envelope = 1 - smoothstep(local, frame.durationMs, frame.durationMs + releaseMs)

    weights.A = Math.max(weights.A, frame.weights.A * envelope)
    weights.E = Math.max(weights.E, frame.weights.E * envelope)
    weights.I = Math.max(weights.I, frame.weights.I * envelope)
    weights.O = Math.max(weights.O, frame.weights.O * envelope)
    weights.U = Math.max(weights.U, frame.weights.U * envelope)
  }

  return weights
}

export const zeroSpeechVisemeWeights = ZERO_VISEMES
