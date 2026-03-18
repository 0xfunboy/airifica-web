export type SpeechVisemeKey = 'A' | 'E' | 'I' | 'O' | 'U'
export type SpeechVisemeWeights = Record<SpeechVisemeKey, number>
export type SpeechWordTimestamp = {
  word: string
  startTimeMs: number
  endTimeMs: number
}
export type SpeechVisemeFrame = {
  startMs: number
  durationMs: number
  weights: SpeechVisemeWeights
  closure: number
}

type SpeechPhonemeFrame = {
  units: number
  weights: SpeechVisemeWeights
  closure: number
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
  closure: number
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

function createPause(units: number, closure = 1): VisemeSeed {
  return {
    units,
    weights: createWeights(),
    closure: clamp01(closure),
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
        closure: 0,
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
      closure: seed.closure,
    }
    cursorMs += frame.durationMs
    return frame
  })
}

const PHONEME_RULES: Array<{ pattern: string, units: number, weights: Partial<SpeechVisemeWeights> }> = [
  { pattern: 'aɪ', units: 1.12, weights: { A: 0.82, I: 0.62 } },
  { pattern: 'eɪ', units: 1.06, weights: { E: 0.84, I: 0.42 } },
  { pattern: 'oʊ', units: 1.08, weights: { O: 0.82, U: 0.48 } },
  { pattern: 'aʊ', units: 1.14, weights: { A: 0.74, U: 0.7 } },
  { pattern: 'ɔɪ', units: 1.14, weights: { O: 0.72, I: 0.56 } },
  { pattern: 'ju', units: 1.04, weights: { I: 0.36, U: 0.72 } },
  { pattern: 'i', units: 0.82, weights: { I: 0.9, E: 0.26 } },
  { pattern: 'ɪ', units: 0.78, weights: { I: 0.78, E: 0.34 } },
  { pattern: 'e', units: 0.82, weights: { E: 0.86, I: 0.24 } },
  { pattern: 'ɛ', units: 0.84, weights: { E: 0.78, A: 0.18 } },
  { pattern: 'æ', units: 0.9, weights: { A: 0.84, E: 0.18 } },
  { pattern: 'ɑ', units: 0.92, weights: { A: 0.9 } },
  { pattern: 'ʌ', units: 0.86, weights: { A: 0.72, E: 0.22 } },
  { pattern: 'ə', units: 0.68, weights: { A: 0.26, E: 0.24, O: 0.12 } },
  { pattern: 'ɚ', units: 0.74, weights: { E: 0.34, A: 0.18 } },
  { pattern: 'ɝ', units: 0.8, weights: { E: 0.42, A: 0.2 } },
  { pattern: 'u', units: 0.88, weights: { U: 0.88, O: 0.22 } },
  { pattern: 'ʊ', units: 0.82, weights: { U: 0.76, O: 0.28 } },
  { pattern: 'o', units: 0.84, weights: { O: 0.84, U: 0.18 } },
  { pattern: 'ɔ', units: 0.88, weights: { O: 0.78, A: 0.2 } },
  { pattern: 'ɒ', units: 0.9, weights: { O: 0.72, A: 0.22 } },
]

const FULL_CLOSURE_PHONEMES = new Set(['p', 'b', 'm'])
const NARROW_CLOSURE_PHONEMES = new Set(['f', 'v'])
const MID_CLOSURE_PHONEMES = new Set([
  'ʃ', 'ʒ', 's', 'z', 'θ', 'ð', 'h',
  't', 'd', 'k', 'g', 'n', 'ŋ', 'l', 'ɹ', 'r', 'j', 'w', 'ʧ', 'ʤ',
])

function tokenizePhonemes(phonemes: string) {
  const cleaned = phonemes
    .replace(/[ˈˌ]/g, '')
    .trim()
  const tokens: string[] = []
  let index = 0

  while (index < cleaned.length) {
    const current = cleaned[index]
    if (!current.trim()) {
      tokens.push(' ')
      index += 1
      continue
    }

    const pair = cleaned.slice(index, index + 2)
    const rule = PHONEME_RULES.find(entry => entry.pattern === pair)
    if (rule) {
      tokens.push(pair)
      index += 2
      continue
    }

    tokens.push(current)
    index += 1
  }

  return tokens
}

function createPhonemeFrames(phonemeString: string) {
  const frames: SpeechPhonemeFrame[] = []
  for (const token of tokenizePhonemes(phonemeString)) {
    if (token === ' ') {
      frames.push({ units: 0.42, weights: createWeights(), closure: 1 })
      continue
    }

    const rule = PHONEME_RULES.find(entry => entry.pattern === token)
    if (rule) {
      frames.push({
        units: rule.units,
        weights: createWeights(rule.weights),
        closure: 0,
      })
      continue
    }

    if (FULL_CLOSURE_PHONEMES.has(token)) {
      frames.push({ units: 0.26, weights: createWeights(), closure: 1 })
      continue
    }

    if (NARROW_CLOSURE_PHONEMES.has(token)) {
      frames.push({ units: 0.28, weights: createWeights(), closure: 0.82 })
      continue
    }

    if (MID_CLOSURE_PHONEMES.has(token)) {
      frames.push({ units: 0.3, weights: createWeights(), closure: 0.56 })
      continue
    }

    frames.push({ units: 0.24, weights: createWeights(), closure: 0.28 })
  }
  return frames
}

function splitPhonemeWords(phonemes: string) {
  return phonemes
    .replace(/[ˈˌ]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function createTimelineFramesForWindow(
  unitsFrames: Array<{ units: number, weights: SpeechVisemeWeights, closure: number }>,
  startMs: number,
  durationMs: number,
) {
  if (!unitsFrames.length || durationMs <= 0)
    return [] as SpeechVisemeFrame[]

  const totalUnits = Math.max(1, unitsFrames.reduce((sum, frame) => sum + frame.units, 0))
  const msPerUnit = durationMs / totalUnits
  let cursorMs = startMs

  return unitsFrames.map((frame) => {
    const next = {
      startMs: cursorMs,
      durationMs: Math.max(12, frame.units * msPerUnit),
      weights: frame.weights,
      closure: frame.closure,
    }
    cursorMs += next.durationMs
    return next
  })
}

export function createSpeechVisemeTimelineFromPhonemes(phonemes: string, totalDurationMs: number) {
  const frames = createPhonemeFrames(phonemes)
  if (!frames.length)
    return [] as SpeechVisemeFrame[]

  const totalUnits = Math.max(1, frames.reduce((sum, frame) => sum + frame.units, 0))
  const msPerUnit = Math.max(16, totalDurationMs / totalUnits)
  let cursorMs = 0

  return frames.map((frame) => {
    const next = {
      startMs: cursorMs,
      durationMs: frame.units * msPerUnit,
      weights: frame.weights,
      closure: frame.closure,
    }
    cursorMs += next.durationMs
    return next
  })
}

export function createSpeechVisemeTimelineFromTimedWords(
  text: string,
  timestamps: SpeechWordTimestamp[],
  totalDurationMs: number,
  phonemes?: string | null,
) {
  const normalizedTimestamps = timestamps
    .map(entry => ({
      word: (entry.word || '').trim(),
      startTimeMs: Math.max(0, Number(entry.startTimeMs) || 0),
      endTimeMs: Math.max(0, Number(entry.endTimeMs) || 0),
    }))
    .filter(entry => entry.word && entry.endTimeMs > entry.startTimeMs)

  if (!normalizedTimestamps.length) {
    if (phonemes?.trim()) {
      const fallbackTimeline = createSpeechVisemeTimelineFromPhonemes(phonemes, totalDurationMs)
      if (fallbackTimeline.length)
        return fallbackTimeline
    }
    return createSpeechVisemeTimeline(text, totalDurationMs)
  }

  const phonemeWords = phonemes?.trim() ? splitPhonemeWords(phonemes) : []
  const frames: SpeechVisemeFrame[] = []
  let cursorMs = 0

  normalizedTimestamps.forEach((entry, index) => {
    const startMs = Math.max(cursorMs, entry.startTimeMs)
    const endMs = Math.max(startMs, entry.endTimeMs)
    if (startMs > cursorMs) {
      frames.push({
        startMs: cursorMs,
        durationMs: startMs - cursorMs,
        weights: createWeights(),
        closure: 1,
      })
    }

    const wordDurationMs = Math.max(24, endMs - startMs)
    const phonemeWord = phonemeWords[index] || ''
    const wordFrames = phonemeWord
      ? createPhonemeFrames(phonemeWord)
      : splitWordToSeeds(entry.word.toLowerCase())

    frames.push(...createTimelineFramesForWindow(wordFrames, startMs, wordDurationMs))
    cursorMs = endMs
  })

  const finalDurationMs = Math.max(totalDurationMs, cursorMs)
  if (finalDurationMs > cursorMs) {
    frames.push({
      startMs: cursorMs,
      durationMs: finalDurationMs - cursorMs,
      weights: createWeights(),
      closure: 1,
    })
  }

  return frames
}

export function sampleSpeechVisemeState(frames: SpeechVisemeFrame[], timeMs: number) {
  if (!frames.length) {
    return {
      weights: createWeights(),
      closure: 0,
    }
  }

  const weights = createWeights()
  let closure = 0

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
    closure = Math.max(closure, (frame.closure || 0) * envelope)
  }

  return {
    weights,
    closure: clamp01(closure),
  }
}

export function sampleSpeechVisemeTimeline(frames: SpeechVisemeFrame[], timeMs: number): SpeechVisemeWeights {
  return sampleSpeechVisemeState(frames, timeMs).weights
}

export const zeroSpeechVisemeWeights = ZERO_VISEMES
