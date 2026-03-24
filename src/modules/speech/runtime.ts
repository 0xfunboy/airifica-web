import { computed, reactive, watch } from 'vue'
import { createWLipSyncNode } from 'wlipsync'
import type { Profile } from 'wlipsync'

import { appConfig } from '@/config/app'
import { readStorage, writeStorage } from '@/lib/storage'
import { useConversationState } from '@/modules/conversation/state'
import lipSyncProfile from '@/modules/speech/assets/lip-sync-profile.json' with { type: 'json' }
import {
  blendSpeechVisemeWeights,
  cloneSpeechVisemeWeights,
  createSpeechVisemeTimeline,
  createSpeechVisemeTimelineFromTimedWords,
  createSpeechVisemeTimelineFromPhonemes,
  maxSpeechVisemeWeight,
  sampleSpeechVisemeState,
  zeroSpeechVisemeWeights,
  type SpeechVisemeFrame,
  type SpeechVisemeWeights,
  type SpeechWordTimestamp,
} from '@/modules/speech/visemes'

const AUTO_SPEAK_KEY = 'airifica:auto-speak'
const LOCALE_KEY = 'airifica:speech-locale'
const VOICE_KEY = 'airifica:speech-voice'
const MODE_KEY = 'airifica:speech-mode'

type SpeechMode = 'browser' | 'external'
type PlaybackClock = {
  currentTime: () => number
  playing: () => boolean
}

type LipSyncNodeLike = {
  volume?: number
  weights?: Record<string, number>
}

type SampledLipSyncState = {
  weights: SpeechVisemeWeights
  closure: number
}

type ExternalSpeechResponse = {
  blob: Blob
  phonemes: string | null
  timestamps: SpeechWordTimestamp[] | null
}

type ExternalSpeechStreamResponse = {
  response: Response
  requestId: string
}

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function pickBrowserSpeechVoice(voices: SpeechSynthesisVoice[], preferredLocale: string, preferredVoiceId?: string) {
  const voiceId = (preferredVoiceId || '').trim()
  if (voiceId) {
    const exactMatch = voices.find(voice => voice.voiceURI === voiceId || voice.name === voiceId)
    if (exactMatch)
      return exactMatch
  }

  const localePrefix = preferredLocale.split('-')[0]?.toLowerCase() || 'en'
  const femaleVoiceHints = ['female', 'woman', 'elsa', 'alice', 'federica', 'giulia', 'sofia', 'sophia', 'serena', 'lucia', 'aria', 'jenny', 'zira', 'hazel', 'sara']

  return voices
    .map((voice) => {
      const voiceName = `${voice.name} ${voice.voiceURI}`.toLowerCase()
      const locale = (voice.lang || '').toLowerCase()
      const localeMatch = locale === preferredLocale.toLowerCase()
      const languageMatch = locale.startsWith(`${localePrefix}-`) || locale === localePrefix
      const femaleMatch = femaleVoiceHints.some(hint => voiceName.includes(hint))

      return {
        voice,
        score: (localeMatch ? 16 : 0)
          + (languageMatch ? 8 : 0)
          + (femaleMatch ? 6 : 0)
          + (voice.localService ? 2 : 0)
          + (voice.default ? 1 : 0),
      }
    })
    .sort((left, right) => right.score - left.score)
    .at(0)?.voice
}

function canUseBrowserSpeech() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

function canUseExternalSpeech() {
  return typeof window !== 'undefined' && Boolean(appConfig.ttsSpeechUrl)
}

function isModeAvailable(mode: SpeechMode) {
  return mode === 'browser' ? canUseBrowserSpeech() : canUseExternalSpeech()
}

function resolvePreferredSpeechMode(): SpeechMode | null {
  if (appConfig.ttsProvider !== 'browser' && canUseExternalSpeech())
    return 'external'
  if (appConfig.ttsProvider === 'browser' && canUseBrowserSpeech())
    return 'browser'
  if (canUseExternalSpeech())
    return 'external'
  if (canUseBrowserSpeech())
    return 'browser'
  return null
}

function resolveInitialMode() {
  const storedMode = readStorage<SpeechMode | null>(getStorageScope(), MODE_KEY, null)
  if (storedMode && isModeAvailable(storedMode))
    return storedMode
  return resolvePreferredSpeechMode()
}

const state = reactive({
  autoSpeakEnabled: readStorage(getStorageScope(), AUTO_SPEAK_KEY, true),
  locale: readStorage(getStorageScope(), LOCALE_KEY, typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
  voiceId: readStorage(getStorageScope(), VOICE_KEY, ''),
  supported: resolveInitialMode() !== null,
  speaking: false,
  mouthOpenSize: 0,
  mouthClosure: 0,
  visemeWeights: cloneSpeechVisemeWeights(zeroSpeechVisemeWeights),
  error: null as string | null,
  queue: [] as Array<{ id: string, text: string }>,
  preferredMode: resolveInitialMode() as SpeechMode | null,
  activeMode: resolveInitialMode() as SpeechMode | null,
  lastStopReason: '' as string,
  stopRevision: 0,
  responseCompleteRevision: 0,
})

const conversation = useConversationState()
const seenAssistantMessages = new Set<string>()
let initialized = false
let currentUtterance: SpeechSynthesisUtterance | null = null
let currentAudio: HTMLAudioElement | null = null
let currentAudioUrl: string | null = null
let currentFetchController: AbortController | null = null
let currentFetchTimeoutId: number | undefined
let currentSource: AudioBufferSourceNode | null = null
let currentGain: GainNode | null = null
let currentPlaybackClock: PlaybackClock | null = null
let outputAudioContext: AudioContext | null = null
let outputLipSyncNodePromise: Promise<LipSyncNodeLike> | null = null
let currentLipSyncNode: LipSyncNodeLike | null = null
let audioUnlockBound = false
let mouthFrameId: number | undefined
let activeVisemeTimeline: SpeechVisemeFrame[] | null = null
let currentQueueItemId: string | null = null
const currentStreamSources = new Set<AudioBufferSourceNode>()

function persistSettings() {
  writeStorage(getStorageScope(), AUTO_SPEAK_KEY, state.autoSpeakEnabled)
  writeStorage(getStorageScope(), LOCALE_KEY, state.locale)
  writeStorage(getStorageScope(), VOICE_KEY, state.voiceId)
  if (state.preferredMode)
    writeStorage(getStorageScope(), MODE_KEY, state.preferredMode)
}

function updateVisemeWeights(target: Partial<SpeechVisemeWeights>, deltaSeconds: number) {
  const next = cloneSpeechVisemeWeights(target)
  const current = state.visemeWeights
  for (const key of Object.keys(current) as Array<keyof SpeechVisemeWeights>) {
    const from = current[key]
    const to = next[key]
    const lambda = to > from ? 22 : 16
    const alpha = 1 - Math.exp(-lambda * deltaSeconds)
    current[key] = from + (to - from) * alpha
  }
  state.mouthOpenSize = maxSpeechVisemeWeight(current) * 100
}

function updateMouthClosure(target: number, deltaSeconds: number) {
  const next = Math.max(0, Math.min(1, target))
  const current = state.mouthClosure
  const lambda = next > current ? 30 : 18
  const alpha = 1 - Math.exp(-lambda * deltaSeconds)
  state.mouthClosure = current + (next - current) * alpha
}

function sampleWLipSyncState(node: LipSyncNodeLike | null): SampledLipSyncState {
  if (!node) {
    return {
      weights: cloneSpeechVisemeWeights(zeroSpeechVisemeWeights),
      closure: 0,
    }
  }

  const rawWeights = node.weights || {}
  const volume = Math.min(Math.max(node.volume || 0, 0), 1)
  const amplitude = Math.min(1, volume * 0.95) ** 0.72
  const projected = cloneSpeechVisemeWeights(zeroSpeechVisemeWeights)
  const rawToLip = {
    A: 'A',
    E: 'E',
    I: 'I',
    O: 'O',
    U: 'U',
  } as const

  for (const [rawKey, lipKey] of Object.entries(rawToLip) as Array<[keyof typeof rawToLip, keyof SpeechVisemeWeights]>) {
    const value = Math.max(0, Math.min(1, Number(rawWeights[rawKey] || 0))) * amplitude
    projected[lipKey] = Math.max(projected[lipKey], value)
  }

  const vowelPeak = maxSpeechVisemeWeight(projected)
  const silenceClosure = volume <= 0.035
    ? Math.max(0, Math.min(1, (0.035 - volume) / 0.035))
    : 0
  const stopClosure = Math.max(0, Math.min(1, Number(rawWeights.S || 0))) * Math.max(0.4, 0.25 + amplitude * 0.9)
  const lowVowelClosure = Math.max(0, Math.min(1, (0.16 - vowelPeak) / 0.16)) * Math.max(0.18, volume * 1.8)
  const closure = Math.max(
    silenceClosure,
    stopClosure,
    lowVowelClosure * 0.72,
  )

  return {
    weights: projected,
    closure: Math.max(0, Math.min(1, closure)),
  }
}

function scaleVisemeWeights(weights: Partial<SpeechVisemeWeights>, factor: number) {
  const strength = Math.max(0, Math.min(1, factor))
  const source = cloneSpeechVisemeWeights(weights)
  return {
    A: source.A * strength,
    E: source.E * strength,
    I: source.I * strength,
    O: source.O * strength,
    U: source.U * strength,
  }
}

function resetVisemeState() {
  activeVisemeTimeline = null
  currentLipSyncNode = null
  updateVisemeWeights(zeroSpeechVisemeWeights, 1)
  updateMouthClosure(0, 1)
}

function stopLipSync() {
  if (mouthFrameId) {
    window.cancelAnimationFrame(mouthFrameId)
    mouthFrameId = undefined
  }

  state.speaking = false
  resetVisemeState()
}

function recordStopEvent(reason: string) {
  state.lastStopReason = reason
  state.stopRevision += 1
}

function recordResponseComplete() {
  state.lastStopReason = 'completed'
  state.stopRevision += 1
  state.responseCompleteRevision += 1
}

function maybeRecordResponseComplete() {
  if (
    state.queue.length === 0
    && !currentQueueItemId
    && !currentUtterance
    && !currentAudio
    && !currentFetchController
    && !currentSource
    && currentStreamSources.size === 0
  ) {
    recordResponseComplete()
  }
}

function startSpeechLipSync(clock: PlaybackClock, timeline: SpeechVisemeFrame[], lipSyncNode?: LipSyncNodeLike | null) {
  stopLipSync()
  state.speaking = true
  activeVisemeTimeline = timeline
  currentLipSyncNode = lipSyncNode || null
  let previousTimestamp = performance.now()

  const tick = () => {
    if (!state.speaking || !clock.playing()) {
      mouthFrameId = undefined
      return
    }

    const now = performance.now()
    const deltaSeconds = Math.max(1 / 120, (now - previousTimestamp) / 1000)
    previousTimestamp = now
    const elapsedMs = clock.currentTime() * 1000
    const timelineState = activeVisemeTimeline
      ? sampleSpeechVisemeState(activeVisemeTimeline, elapsedMs)
      : { weights: zeroSpeechVisemeWeights, closure: 0 }
    const timelineWeights = timelineState.weights
    const audioState = sampleWLipSyncState(currentLipSyncNode)
    const audioWeights = audioState.weights
    const audioStrength = maxSpeechVisemeWeight(audioWeights)
    const closureStrength = Math.max(0, Math.min(1, Math.max(timelineState.closure, audioState.closure)))
    const openFactor = Math.max(0, 1 - closureStrength)
    const dampedAudioWeights = scaleVisemeWeights(audioWeights, openFactor * openFactor)
    const audioBlend = 0.68 * openFactor * openFactor + 0.08 * openFactor
    const target = audioStrength > 0.02
      ? blendSpeechVisemeWeights(timelineWeights, dampedAudioWeights, audioBlend)
      : timelineWeights

    updateVisemeWeights(target, deltaSeconds)
    updateMouthClosure(closureStrength, deltaSeconds)
    mouthFrameId = window.requestAnimationFrame(tick)
  }

  mouthFrameId = window.requestAnimationFrame(tick)
}

function cleanupExternalPlayback() {
  for (const source of currentStreamSources) {
    try {
      source.stop()
    }
    catch {
    }
    source.disconnect()
  }
  currentStreamSources.clear()

  if (currentSource) {
    try {
      currentSource.stop()
    }
    catch {
    }
    currentSource.disconnect()
  }

  if (currentGain)
    currentGain.disconnect()

  currentSource = null
  currentGain = null
  currentPlaybackClock = null
  currentLipSyncNode = null
  activeVisemeTimeline = null

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio.load()
  }

  currentAudio = null

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = null
  }
}

async function ensureOutputAudioContext() {
  if (typeof window === 'undefined')
    return null

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor)
    return null

  if (!outputAudioContext)
    outputAudioContext = new AudioContextCtor({ latencyHint: 'interactive' })

  if (outputAudioContext.state === 'suspended') {
    try {
      await outputAudioContext.resume()
    }
    catch {
    }
  }

  return outputAudioContext
}

async function ensureOutputLipSyncNode(context: AudioContext) {
  if (!outputLipSyncNodePromise) {
    outputLipSyncNodePromise = createWLipSyncNode(context, lipSyncProfile as Profile)
      .catch((error) => {
        outputLipSyncNodePromise = null
        throw error
      })
  }

  return outputLipSyncNodePromise
}

function bindAudioUnlock() {
  if (audioUnlockBound || typeof window === 'undefined')
    return

  const unlock = () => {
    void ensureOutputAudioContext().then((context) => {
      if (context?.state === 'running') {
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
        window.removeEventListener('touchstart', unlock)
      }
    })
  }

  audioUnlockBound = true
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
}

function stop(reason = 'manual-stop') {
  state.queue = []
  currentQueueItemId = null

  if (canUseBrowserSpeech()) {
    try {
      window.speechSynthesis.cancel()
    }
    catch {
    }
  }

  currentUtterance = null

  if (currentFetchController) {
    currentFetchController.abort(reason)
    currentFetchController = null
  }

  cleanupExternalPlayback()
  state.error = reason === 'manual-stop' || reason === 'new-message' || reason === 'disabled' ? null : reason
  stopLipSync()
  recordStopEvent(reason)
}

function splitLongSpeechChunk(text: string, maxChars: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length)
    return [] as string[]

  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars || !current) {
      current = next
      continue
    }

    chunks.push(current)
    current = word
  }

  if (current)
    chunks.push(current)

  return chunks
}

function splitSpeechTextIntoChunks(text: string, maxChars = 240) {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized)
    return [] as string[]

  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(sentence => sentence.trim()).filter(Boolean) || [normalized]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChars * 1.35) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitLongSpeechChunk(sentence, maxChars))
      continue
    }

    const next = current ? `${current} ${sentence}` : sentence
    if (next.length <= maxChars) {
      current = next
      continue
    }

    if (current)
      chunks.push(current)
    current = sentence
  }

  if (current)
    chunks.push(current)

  return chunks.length ? chunks : [normalized]
}

async function waitForVoices() {
  const availableVoices = window.speechSynthesis.getVoices()
  if (availableVoices.length > 0)
    return availableVoices

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timeout = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1200)
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timeout)
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

async function playBrowserQueueItem(next: { id: string, text: string }) {
  if (!canUseBrowserSpeech())
    return false

  const utterance = new SpeechSynthesisUtterance(next.text)
  utterance.lang = state.locale || 'en-US'
  utterance.rate = 1
  utterance.pitch = 1

  try {
    const voices = await waitForVoices()
    const preferredVoice = pickBrowserSpeechVoice(voices, utterance.lang, state.voiceId)
    if (preferredVoice) {
      utterance.voice = preferredVoice
      state.voiceId = preferredVoice.voiceURI || preferredVoice.name
      persistSettings()
    }
  }
  catch {
  }

  utterance.onstart = () => {
    state.activeMode = 'browser'
    const startedAt = performance.now()
    const timeline = createSpeechVisemeTimeline(next.text)
    startSpeechLipSync({
      currentTime: () => Math.max(0, (performance.now() - startedAt) / 1000),
      playing: () => currentUtterance === utterance && window.speechSynthesis.speaking,
    }, timeline)
  }

  utterance.onend = () => {
    if (currentUtterance !== utterance)
      return

    currentUtterance = null
    currentQueueItemId = null
    state.queue.shift()
    stopLipSync()
    maybeRecordResponseComplete()
    void processQueue()
  }

  utterance.onerror = (event) => {
    if (currentUtterance !== utterance)
      return

    currentUtterance = null
    currentQueueItemId = null
    state.queue.shift()
    state.error = event.error || 'Speech playback failed.'
    stopLipSync()
    recordStopEvent('error')
    void processQueue()
  }

  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
  return true
}

function buildSpeechTimeline(
  text: string,
  totalDurationMs: number,
  phonemes?: string | null,
  timestamps?: SpeechWordTimestamp[] | null,
) {
  if (timestamps?.length) {
    const timedTimeline = createSpeechVisemeTimelineFromTimedWords(text, timestamps, totalDurationMs, phonemes)
    if (timedTimeline.length)
      return timedTimeline
  }

  if (phonemes?.trim()) {
    const timeline = createSpeechVisemeTimelineFromPhonemes(phonemes, totalDurationMs)
    if (timeline.length)
      return timeline
  }

  return createSpeechVisemeTimeline(text, totalDurationMs)
}

function buildCaptionedSpeechPayload(text: string) {
  return {
    model: appConfig.ttsModel,
    input: text,
    voice: appConfig.ttsVoice,
    response_format: appConfig.ttsResponseFormat,
    speed: appConfig.ttsSpeedFactor,
    stream: false,
    return_timestamps: true,
    lang_code: appConfig.ttsPhonemeLanguage,
  }
}

function buildExternalSpeechPayload(text: string) {
  return appConfig.ttsProvider === 'fastapi'
    ? {
        text,
        voice_mode: appConfig.ttsVoiceMode,
        predefined_voice_id: appConfig.ttsPredefinedVoiceId || appConfig.ttsVoice || undefined,
        output_format: appConfig.ttsResponseFormat,
        split_text: appConfig.ttsSplitText,
        chunk_size: appConfig.ttsChunkSize,
        speed_factor: appConfig.ttsSpeedFactor,
        seed: appConfig.ttsSeed ? Number(appConfig.ttsSeed) : undefined,
      }
    : {
        model: appConfig.ttsModel,
        voice: appConfig.ttsVoice,
        input: text,
        response_format: appConfig.ttsResponseFormat,
        format: appConfig.ttsResponseFormat,
        speed: appConfig.ttsSpeedFactor,
        seed: appConfig.ttsSeed ? Number(appConfig.ttsSeed) : undefined,
        lang_code: appConfig.ttsPhonemeLanguage,
      }
}

function buildExternalSpeechStreamPayload(text: string) {
  return {
    model: appConfig.ttsModel,
    voice: appConfig.ttsVoice,
    input: text,
    response_format: appConfig.ttsStreamFormat,
    format: appConfig.ttsStreamFormat,
    speed: appConfig.ttsSpeedFactor,
    seed: appConfig.ttsSeed ? Number(appConfig.ttsSeed) : undefined,
    lang_code: appConfig.ttsPhonemeLanguage,
    stream: true,
  }
}

function createExternalSpeechHeaders(text: string, requestId: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Airifica-TTS-Request-Id': requestId,
    'X-Airifica-TTS-Source': 'webapp',
    'X-Airifica-TTS-Text-Chars': String(text.length),
  }

  if (appConfig.ttsApiKey)
    headers.Authorization = `Bearer ${appConfig.ttsApiKey}`

  return headers
}

async function fetchExternalPhonemes(
  text: string,
  requestId: string,
  signal: AbortSignal,
  baseHeaders: Record<string, string>,
) {
  if (!appConfig.ttsPhonemeUrl)
    return null

  const response = await fetch(appConfig.ttsPhonemeUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'X-Airifica-TTS-Source': 'webapp-phonemes',
    },
    signal,
    body: JSON.stringify({
      text,
      language: appConfig.ttsPhonemeLanguage,
    }),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    let details = ''
    try {
      details = contentType.includes('application/json')
        ? String((await response.json() as Record<string, unknown>).detail || '')
        : await response.text()
    }
    catch {
    }
    throw new Error(details || `Phoneme request failed with ${response.status} ${response.statusText}.`)
  }

  if (!contentType.includes('application/json'))
    throw new Error('Phoneme request returned a non-JSON payload.')

  const payload = await response.json() as Record<string, unknown>
  const phonemes = typeof payload.phonemes === 'string' ? payload.phonemes.trim() : ''
  console.info('[airifica][tts] phonemes:response', {
    requestId,
    phonemeChars: phonemes.length,
  })
  return phonemes || null
}

function normalizeCaptionedTimestamps(input: unknown) {
  if (!Array.isArray(input))
    return null

  const timestamps = input
    .map((entry) => {
      const payload = entry as Record<string, unknown>
      const word = typeof payload.word === 'string' ? payload.word.trim() : ''
      const startTimeSec = Number(payload.start_time)
      const endTimeSec = Number(payload.end_time)
      if (!word || !Number.isFinite(startTimeSec) || !Number.isFinite(endTimeSec) || endTimeSec <= startTimeSec)
        return null

      return {
        word,
        startTimeMs: Math.max(0, startTimeSec * 1000),
        endTimeMs: Math.max(0, endTimeSec * 1000),
      } satisfies SpeechWordTimestamp
    })
    .filter(Boolean) as SpeechWordTimestamp[]

  return timestamps.length ? timestamps : null
}

function decodeBase64AudioPayload(audioBase64: string, mimeType: string) {
  const encoded = audioBase64.includes(',')
    ? audioBase64.split(',').pop() || ''
    : audioBase64
  const normalized = encoded.trim()
  if (!normalized)
    throw new Error('Captioned speech returned an empty audio payload.')

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index)

  return new Blob([bytes], { type: mimeType })
}

async function fetchCaptionedSpeech(
  text: string,
  requestId: string,
  signal: AbortSignal,
  baseHeaders: Record<string, string>,
) {
  if (!appConfig.ttsCaptionUrl)
    return null

  const response = await fetch(appConfig.ttsCaptionUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'X-Airifica-TTS-Source': 'webapp-captioned',
    },
    signal,
    body: JSON.stringify(buildCaptionedSpeechPayload(text)),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    let details = ''
    try {
      details = contentType.includes('application/json')
        ? String((await response.json() as Record<string, unknown>).detail || '')
        : await response.text()
    }
    catch {
    }
    throw new Error(details || `Captioned speech failed with ${response.status} ${response.statusText}.`)
  }

  if (!contentType.includes('application/json'))
    throw new Error('Captioned speech returned a non-JSON payload.')

  const payload = await response.json() as Record<string, unknown>
  const audioBase64 = typeof payload.audio === 'string' ? payload.audio : ''
  const audioFormat = typeof payload.audio_format === 'string' ? payload.audio_format : `audio/${appConfig.ttsResponseFormat}`
  const timestamps = normalizeCaptionedTimestamps(payload.timestamps)
  const blob = decodeBase64AudioPayload(audioBase64, audioFormat)

  console.info('[airifica][tts] captioned:response', {
    requestId,
    bytes: blob.size,
    timestamps: timestamps?.length || 0,
  })

  return { blob, timestamps }
}

async function fetchExternalSpeech(text: string): Promise<ExternalSpeechResponse> {
  if (!appConfig.ttsSpeechUrl)
    throw new Error('External TTS endpoint is not configured.')

  currentFetchController?.abort('restart')
  currentFetchController = new AbortController()
  if (currentFetchTimeoutId) {
    window.clearTimeout(currentFetchTimeoutId)
    currentFetchTimeoutId = undefined
  }

  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tts-${Date.now()}`
  const startedAt = performance.now()
  const headers = createExternalSpeechHeaders(text, requestId)
  const externalPayload = buildExternalSpeechPayload(text)

  console.info('[airifica][tts] request:start', {
    requestId,
    provider: appConfig.ttsProvider,
    url: appConfig.ttsSpeechUrl,
    chars: text.length,
  })

  currentFetchTimeoutId = window.setTimeout(() => {
    currentFetchController?.abort('tts-timeout')
  }, 120_000)

  try {
    const phonemePromise = fetchExternalPhonemes(text, requestId, currentFetchController.signal, headers)
      .catch((error) => {
        console.warn('[airifica][tts] phonemes:error', error)
        return null
      })

    if (appConfig.ttsCaptionUrl) {
      try {
        const [captionedResult, phonemeResult] = await Promise.all([
          fetchCaptionedSpeech(text, requestId, currentFetchController.signal, headers),
          phonemePromise,
        ])

        if (captionedResult) {
          return {
            blob: captionedResult.blob,
            phonemes: phonemeResult,
            timestamps: captionedResult.timestamps,
          }
        }
      }
      catch (error) {
        console.warn('[airifica][tts] captioned:error', error)
      }
    }

    const [audioResult, phonemeResult] = await Promise.all([
      fetch(appConfig.ttsSpeechUrl, {
        method: 'POST',
        headers,
        signal: currentFetchController.signal,
        body: JSON.stringify(externalPayload),
      }).then(async (response) => {
        const contentType = response.headers.get('content-type') || ''
        if (!response.ok) {
          let details = ''
          try {
            if (contentType.includes('application/json')) {
              const payload = await response.json() as Record<string, unknown>
              details = String(payload.detail || payload.error || payload.message || '')
            }
            else {
              details = await response.text()
            }
          }
          catch {
          }
          throw new Error(details || `External TTS failed with ${response.status} ${response.statusText}.`)
        }

        if (contentType.includes('application/json')) {
          let details = ''
          try {
            const payload = await response.json() as Record<string, unknown>
            details = String(payload.detail || payload.error || payload.message || '')
          }
          catch {
          }
          throw new Error(details || 'External TTS returned a JSON payload instead of audio.')
        }

        const blob = await response.blob()
        if (!blob.size)
          throw new Error('External TTS returned an empty audio payload.')

        console.info('[airifica][tts] request:response', {
          requestId,
          status: response.status,
          contentType,
          bytes: blob.size,
          durationMs: Math.round(performance.now() - startedAt),
        })

        return blob
      }),
      phonemePromise,
    ])

    return {
      blob: audioResult,
      phonemes: phonemeResult,
      timestamps: null,
    }
  }
  finally {
    if (currentFetchTimeoutId) {
      window.clearTimeout(currentFetchTimeoutId)
      currentFetchTimeoutId = undefined
    }
    currentFetchController = null
  }
}

async function fetchExternalSpeechStream(text: string): Promise<ExternalSpeechStreamResponse> {
  if (!appConfig.ttsSpeechUrl)
    throw new Error('External TTS endpoint is not configured.')

  currentFetchController?.abort('restart')
  currentFetchController = new AbortController()
  if (currentFetchTimeoutId) {
    window.clearTimeout(currentFetchTimeoutId)
    currentFetchTimeoutId = undefined
  }

  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tts-stream-${Date.now()}`
  const headers = createExternalSpeechHeaders(text, requestId)

  console.info('[airifica][tts] stream:start', {
    requestId,
    provider: appConfig.ttsProvider,
    url: appConfig.ttsSpeechUrl,
    chars: text.length,
    format: appConfig.ttsStreamFormat,
  })

  currentFetchTimeoutId = window.setTimeout(() => {
    currentFetchController?.abort('tts-stream-timeout')
  }, 120_000)

  const response = await fetch(appConfig.ttsSpeechUrl, {
    method: 'POST',
    headers,
    signal: currentFetchController.signal,
    body: JSON.stringify(buildExternalSpeechStreamPayload(text)),
  })

  if (currentFetchTimeoutId) {
    window.clearTimeout(currentFetchTimeoutId)
    currentFetchTimeoutId = undefined
  }

  if (!response.ok) {
    let details = ''
    try {
      const contentType = response.headers.get('content-type') || ''
      details = contentType.includes('application/json')
        ? String((await response.json() as Record<string, unknown>).detail || '')
        : await response.text()
    }
    catch {
    }
    currentFetchController = null
    throw new Error(details || `External TTS stream failed with ${response.status} ${response.statusText}.`)
  }

  return { response, requestId }
}

function decodePcm16Chunk(context: AudioContext, chunk: Uint8Array, sampleRate: number) {
  const usableBytes = chunk.byteLength - (chunk.byteLength % 2)
  if (usableBytes <= 0)
    return null

  const samples = usableBytes / 2
  const buffer = context.createBuffer(1, samples, sampleRate)
  const channel = buffer.getChannelData(0)
  const view = new DataView(chunk.buffer, chunk.byteOffset, usableBytes)

  for (let index = 0; index < samples; index += 1)
    channel[index] = view.getInt16(index * 2, true) / 32768

  return buffer
}

function appendUint8Chunks(chunks: Uint8Array[]) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

async function playExternalStreamQueueItem(next: { id: string, text: string }) {
  if (!canUseExternalSpeech())
    return false

  const context = await ensureOutputAudioContext()
  if (!context) {
    currentQueueItemId = null
    return false
  }

  const lipSyncNode = await ensureOutputLipSyncNode(context)
    .catch((error) => {
      console.warn('[airifica][tts] lip sync node unavailable', error)
      return null
    })

  const { response, requestId } = await fetchExternalSpeechStream(next.text)
  const reader = response.body?.getReader()
  if (!reader) {
    currentFetchController = null
    throw new Error('External TTS stream returned no readable body.')
  }

  state.activeMode = 'external'
  const streamStartAt = context.currentTime + 0.06
  let scheduledUntil = streamStartAt
  let playbackCommitted = false
  let pendingBytes = new Uint8Array()
  const chunkBytes = Math.max(2048, Math.round(appConfig.ttsStreamSampleRate * (appConfig.ttsStreamChunkMs / 1000) * 2))
  let streamClosed = false
  let finalized = false

  currentPlaybackClock = {
    currentTime: () => Math.max(0, context.currentTime - streamStartAt),
    playing: () => currentQueueItemId === next.id && (!streamClosed || currentStreamSources.size > 0 || context.currentTime < scheduledUntil),
  }
  startSpeechLipSync(currentPlaybackClock, [], lipSyncNode)

  const finalize = (error?: unknown) => {
    if (finalized || currentQueueItemId !== next.id)
      return

    finalized = true
    currentQueueItemId = null
    currentFetchController = null
    currentPlaybackClock = null
    currentLipSyncNode = null
    activeVisemeTimeline = null
    currentSource = null
    if (currentGain) {
      currentGain.disconnect()
      currentGain = null
    }

    if (error) {
      state.queue.shift()
      state.error = error instanceof Error ? error.message : 'External TTS stream failed.'
      stopLipSync()
      recordStopEvent('error')
      void processQueue()
      return
    }

    state.queue.shift()
    stopLipSync()
    maybeRecordResponseComplete()
    void processQueue()
  }

  const scheduleChunk = (pcmChunk: Uint8Array) => {
    const audioBuffer = decodePcm16Chunk(context, pcmChunk, appConfig.ttsStreamSampleRate)
    if (!audioBuffer)
      return

    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = audioBuffer
    source.connect(gain)
    if (lipSyncNode)
      source.connect(lipSyncNode as AudioNode)
    gain.connect(context.destination)

    currentSource = source
    currentGain = gain
    currentStreamSources.add(source)
    const sourceStartAt = Math.max(scheduledUntil, context.currentTime + 0.02)
    scheduledUntil = sourceStartAt + audioBuffer.duration

    source.onended = () => {
      currentStreamSources.delete(source)
      if (currentSource === source)
        currentSource = null
      source.disconnect()
      gain.disconnect()
      if (streamClosed && currentStreamSources.size === 0)
        finalize()
    }

    source.start(sourceStartAt)
    playbackCommitted = true
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (!value?.byteLength)
        continue

      pendingBytes = appendUint8Chunks([pendingBytes, value])
      while (pendingBytes.byteLength >= chunkBytes) {
        scheduleChunk(pendingBytes.slice(0, chunkBytes))
        pendingBytes = pendingBytes.slice(chunkBytes)
      }
    }

    if (pendingBytes.byteLength > 1)
      scheduleChunk(pendingBytes)

    streamClosed = true
    if (!playbackCommitted)
      throw new Error('External TTS stream returned no playable PCM data.')

    if (currentStreamSources.size === 0)
      finalize()

    return true
  }
  catch (error) {
    streamClosed = true
    cleanupExternalPlayback()
    finalize(error)
    return false
  }
  finally {
    if (currentFetchTimeoutId) {
      window.clearTimeout(currentFetchTimeoutId)
      currentFetchTimeoutId = undefined
    }
  }
}

async function playExternalQueueItem(next: { id: string, text: string }) {
  if (!canUseExternalSpeech())
    return false

  const { blob, phonemes, timestamps } = await fetchExternalSpeech(next.text)
  const context = await ensureOutputAudioContext()

  if (context?.state === 'running') {
    const decodeStartedAt = performance.now()
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const source = context.createBufferSource()
    const gain = context.createGain()
    let lipSyncNode: LipSyncNodeLike | null = null
    source.buffer = decoded
    source.connect(gain)
    try {
      lipSyncNode = await ensureOutputLipSyncNode(context)
      source.connect(lipSyncNode as AudioNode)
    }
    catch (error) {
      console.warn('[airifica][tts] lip sync node unavailable', error)
    }
    gain.connect(context.destination)

    currentSource = source
    currentGain = gain
    const startedAt = context.currentTime
    const timeline = buildSpeechTimeline(next.text, decoded.duration * 1000, phonemes, timestamps)
    currentPlaybackClock = {
      currentTime: () => Math.max(0, context.currentTime - startedAt),
      playing: () => currentSource === source && (context.currentTime - startedAt) < decoded.duration,
    }

    source.onended = () => {
      if (currentSource !== source)
        return

      currentQueueItemId = null
      cleanupExternalPlayback()
      state.queue.shift()
      stopLipSync()
      maybeRecordResponseComplete()
      void processQueue()
    }

    state.activeMode = 'external'
    console.info('[airifica][tts] playback:web-audio', {
      durationSec: Number(decoded.duration.toFixed(2)),
      decodeMs: Math.round(performance.now() - decodeStartedAt),
    })
    startSpeechLipSync(currentPlaybackClock, timeline, lipSyncNode)
    source.start()
    return true
  }

  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = objectUrl

  currentAudio = audio
  currentAudioUrl = objectUrl

  audio.onplay = () => {
    state.activeMode = 'external'
    console.info('[airifica][tts] playback:html-audio')
    startSpeechLipSync({
      currentTime: () => audio.currentTime,
      playing: () => !audio.paused && !audio.ended,
    }, buildSpeechTimeline(next.text, Math.max(audio.duration || 0, 0) * 1000 || 0, phonemes, timestamps))
  }

  audio.onended = () => {
    currentQueueItemId = null
    cleanupExternalPlayback()
    state.queue.shift()
    stopLipSync()
    maybeRecordResponseComplete()
    void processQueue()
  }

  audio.onerror = () => {
    currentQueueItemId = null
    cleanupExternalPlayback()
    state.queue.shift()
    state.error = 'External TTS playback failed.'
    stopLipSync()
    recordStopEvent('error')
    void processQueue()
  }

  await audio.play()
  return true
}

async function processQueue() {
  if (currentQueueItemId || currentUtterance || currentAudio || currentFetchController || currentSource || state.queue.length === 0)
    return

  const next = state.queue[0]
  const normalized = next.text.trim()
  if (!normalized) {
    state.queue.shift()
    void processQueue()
    return
  }

  const preferredMode = state.preferredMode && isModeAvailable(state.preferredMode)
    ? state.preferredMode
    : resolvePreferredSpeechMode()
  if (!preferredMode) {
    state.error = 'No speech provider is available.'
    state.queue = []
    return
  }

  try {
    currentQueueItemId = next.id
    if (preferredMode === 'external') {
      if (appConfig.ttsStreamEnabled && appConfig.ttsStreamFormat === 'pcm') {
        const streamed = await playExternalStreamQueueItem({ ...next, text: normalized })
        if (streamed || currentQueueItemId !== next.id)
          return
      }
      await playExternalQueueItem({ ...next, text: normalized })
      return
    }

    const started = await playBrowserQueueItem({ ...next, text: normalized })
    if (!started)
      throw new Error('Speech playback unavailable.')
  }
  catch (error) {
    currentQueueItemId = null
    state.queue.shift()
    cleanupExternalPlayback()
    if (currentFetchTimeoutId) {
      window.clearTimeout(currentFetchTimeoutId)
      currentFetchTimeoutId = undefined
    }
    currentFetchController = null
    currentUtterance = null
    state.error = error instanceof Error ? error.message : 'Speech playback failed.'
    console.error('[airifica][tts] request:error', state.error)
    stopLipSync()
    void processQueue()
  }
}

function enqueue(text: string, id: string) {
  const chunks = splitSpeechTextIntoChunks(text)
  if (!chunks.length)
    return false

  if (!state.supported || !state.autoSpeakEnabled)
    return false

  const queuedIds = new Set([
    currentQueueItemId,
    ...state.queue.map(item => item.id),
  ].filter(Boolean) as string[])

  chunks.forEach((chunk, index) => {
    const chunkId = `${id}:chunk:${index}`
    if (queuedIds.has(chunkId))
      return
    state.queue.push({ id: chunkId, text: chunk })
    queuedIds.add(chunkId)
  })
  void processQueue()
  return true
}

function preview(text: string) {
  const normalized = text.trim()
  if (!normalized)
    return false

  void ensureOutputAudioContext()
  stop('manual-stop')
  state.error = null
  state.supported = resolvePreferredSpeechMode() !== null
  state.queue = [{ id: `preview-${Date.now()}`, text: normalized }]
  void processQueue()
  return true
}

function speakText(text: string, id = `manual-${Date.now()}`) {
  const normalized = text.trim()
  if (!normalized || !state.supported)
    return false

  void ensureOutputAudioContext()
  stop('manual-stop')
  state.error = null
  state.queue = [{ id, text: normalized }]
  void processQueue()
  return true
}

function setAutoSpeakEnabled(value: boolean) {
  state.autoSpeakEnabled = value
  persistSettings()
  if (!value)
    stop('disabled')
}

function setLocale(value: string) {
  state.locale = value
  persistSettings()
}

function setPreferredMode(value: SpeechMode) {
  if (!isModeAvailable(value))
    return

  state.preferredMode = value
  if (!state.speaking)
    state.activeMode = value
  state.supported = true
  state.error = null
  persistSettings()

  if (state.queue.length > 0 && !currentUtterance && !currentAudio && !currentFetchController)
    void processQueue()
}

function initialize() {
  if (initialized)
    return

  initialized = true
  bindAudioUnlock()
  for (const message of conversation.messages.value) {
    if (message.role === 'assistant')
      seenAssistantMessages.add(message.id)
  }

  watch(() => conversation.messages.value.map(message => message.id).join('|'), () => {
    for (const message of conversation.messages.value) {
      if (message.role !== 'assistant' || message.restored || seenAssistantMessages.has(message.id))
        continue

      seenAssistantMessages.add(message.id)
      enqueue(message.content, message.id)
    }
  })

  watch(() => conversation.sending.value, (sending) => {
    if (sending)
      stop('new-message')
  })
}

export function useSpeechRuntime() {
  initialize()

  return {
    supported: computed(() => state.supported),
    availableModes: computed(() => ({
      browser: canUseBrowserSpeech(),
      external: canUseExternalSpeech(),
    })),
    autoSpeakEnabled: computed(() => state.autoSpeakEnabled),
    locale: computed(() => state.locale),
    voiceId: computed(() => state.voiceId),
    preferredMode: computed(() => state.preferredMode),
    speaking: computed(() => state.speaking),
    mouthOpenSize: computed(() => state.mouthOpenSize),
    mouthClosure: computed(() => state.mouthClosure),
    visemeWeights: computed(() => state.visemeWeights),
    error: computed(() => state.error),
    queueSize: computed(() => state.queue.length),
    activeMode: computed(() => state.activeMode),
    externalEndpoint: computed(() => appConfig.ttsSpeechUrl),
    lastStopReason: computed(() => state.lastStopReason),
    stopRevision: computed(() => state.stopRevision),
    responseCompleteRevision: computed(() => state.responseCompleteRevision),
    enqueue,
    preview,
    speakText,
    stop,
    setAutoSpeakEnabled,
    setLocale,
    setPreferredMode,
  }
}
