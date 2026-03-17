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
  maxSpeechVisemeWeight,
  sampleSpeechVisemeTimeline,
  zeroSpeechVisemeWeights,
  type SpeechVisemeFrame,
  type SpeechVisemeWeights,
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
  visemeWeights: cloneSpeechVisemeWeights(zeroSpeechVisemeWeights),
  error: null as string | null,
  queue: [] as Array<{ id: string, text: string }>,
  preferredMode: resolveInitialMode() as SpeechMode | null,
  activeMode: resolveInitialMode() as SpeechMode | null,
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

function sampleWLipSyncWeights(node: LipSyncNodeLike | null) {
  if (!node)
    return cloneSpeechVisemeWeights(zeroSpeechVisemeWeights)

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
    S: 'I',
  } as const

  for (const [rawKey, lipKey] of Object.entries(rawToLip) as Array<[keyof typeof rawToLip, keyof SpeechVisemeWeights]>) {
    const value = Math.max(0, Math.min(1, Number(rawWeights[rawKey] || 0))) * amplitude
    projected[lipKey] = Math.max(projected[lipKey], value)
  }

  return projected
}

function resetVisemeState() {
  activeVisemeTimeline = null
  currentLipSyncNode = null
  updateVisemeWeights(zeroSpeechVisemeWeights, 1)
}

function stopLipSync() {
  if (mouthFrameId) {
    window.cancelAnimationFrame(mouthFrameId)
    mouthFrameId = undefined
  }

  state.speaking = false
  resetVisemeState()
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
    const timelineWeights = activeVisemeTimeline ? sampleSpeechVisemeTimeline(activeVisemeTimeline, elapsedMs) : zeroSpeechVisemeWeights
    const audioWeights = sampleWLipSyncWeights(currentLipSyncNode)
    const audioStrength = maxSpeechVisemeWeight(audioWeights)
    const target = audioStrength > 0.02
      ? blendSpeechVisemeWeights(timelineWeights, audioWeights, 0.68)
      : timelineWeights

    updateVisemeWeights(target, deltaSeconds)
    mouthFrameId = window.requestAnimationFrame(tick)
  }

  mouthFrameId = window.requestAnimationFrame(tick)
}

function cleanupExternalPlayback() {
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
    currentUtterance = null
    state.queue.shift()
    stopLipSync()
    void processQueue()
  }

  utterance.onerror = (event) => {
    currentUtterance = null
    state.queue.shift()
    state.error = event.error || 'Speech playback failed.'
    stopLipSync()
    void processQueue()
  }

  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
  return true
}

async function fetchExternalSpeech(text: string) {
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Airifica-TTS-Request-Id': requestId,
    'X-Airifica-TTS-Source': 'webapp',
    'X-Airifica-TTS-Text-Chars': String(text.length),
  }

  if (appConfig.ttsApiKey)
    headers.Authorization = `Bearer ${appConfig.ttsApiKey}`

  const externalPayload = appConfig.ttsProvider === 'fastapi'
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
      }

  console.info('[airifica][tts] request:start', {
    requestId,
    provider: appConfig.ttsProvider,
    url: appConfig.ttsSpeechUrl,
    chars: text.length,
  })

  currentFetchTimeoutId = window.setTimeout(() => {
    currentFetchController?.abort('tts-timeout')
  }, 120_000)

  const response = await fetch(appConfig.ttsSpeechUrl, {
    method: 'POST',
    headers,
    signal: currentFetchController.signal,
    body: JSON.stringify(externalPayload),
  })

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

  if (currentFetchTimeoutId) {
    window.clearTimeout(currentFetchTimeoutId)
    currentFetchTimeoutId = undefined
  }

  console.info('[airifica][tts] request:response', {
    requestId,
    status: response.status,
    contentType,
    bytes: blob.size,
    durationMs: Math.round(performance.now() - startedAt),
  })

  currentFetchController = null
  return blob
}

async function playExternalQueueItem(next: { id: string, text: string }) {
  if (!canUseExternalSpeech())
    return false

  const blob = await fetchExternalSpeech(next.text)
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
    const timeline = createSpeechVisemeTimeline(next.text, decoded.duration * 1000)
    currentPlaybackClock = {
      currentTime: () => Math.max(0, context.currentTime - startedAt),
      playing: () => currentSource === source && (context.currentTime - startedAt) < decoded.duration,
    }

    source.onended = () => {
      if (currentSource !== source)
        return

      cleanupExternalPlayback()
      state.queue.shift()
      stopLipSync()
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
    }, createSpeechVisemeTimeline(next.text, Math.max(audio.duration || 0, 0) * 1000 || undefined))
  }

  audio.onended = () => {
    cleanupExternalPlayback()
    state.queue.shift()
    stopLipSync()
    void processQueue()
  }

  audio.onerror = () => {
    cleanupExternalPlayback()
    state.queue.shift()
    state.error = 'External TTS playback failed.'
    stopLipSync()
    void processQueue()
  }

  await audio.play()
  return true
}

async function processQueue() {
  if (currentUtterance || currentAudio || currentFetchController || state.queue.length === 0)
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
    if (preferredMode === 'external') {
      await playExternalQueueItem({ ...next, text: normalized })
      return
    }

    const started = await playBrowserQueueItem({ ...next, text: normalized })
    if (!started)
      throw new Error('Speech playback unavailable.')
  }
  catch (error) {
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
  const normalized = text.trim()
  if (!normalized)
    return false

  if (!state.supported || !state.autoSpeakEnabled)
    return false

  state.queue.push({ id, text: normalized })
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
      if (message.role !== 'assistant' || seenAssistantMessages.has(message.id))
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
    visemeWeights: computed(() => state.visemeWeights),
    error: computed(() => state.error),
    queueSize: computed(() => state.queue.length),
    activeMode: computed(() => state.activeMode),
    externalEndpoint: computed(() => appConfig.ttsSpeechUrl),
    enqueue,
    preview,
    stop,
    setAutoSpeakEnabled,
    setLocale,
    setPreferredMode,
  }
}
