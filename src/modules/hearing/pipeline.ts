import { computed, reactive } from 'vue'

import { appConfig } from '@/config/app'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAudioSession } from '@/modules/audio/session'
import { useConversationState } from '@/modules/conversation/state'
import vadWorkletSource from '@/workers/vad/process.worklet.js?raw'

import { isAbortError, useServerStt } from './serverStt'
import { concatFloat32Chunks, encodeMono16BitWav } from './wav'

const AUTO_SEND_KEY = 'airifica:hearing-auto-send'
const LOCALE_KEY = 'airifica:hearing-locale'
const VAD_SAMPLE_RATE = 16000
const SPEECH_THRESHOLD = 0.05
const EXIT_THRESHOLD = 0.025
const SPEECH_END_SILENCE_MS = 420
const BROWSER_RESULT_GRACE_MS = 720
const STT_DEBUG_PREFIX = '[hearing:stt]'

type BrowserRecognition = {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onstart: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type ActiveProvider = 'none' | 'browser' | 'server'

type PendingBrowserFallback = {
  sequence: number
  baselineRevision: number
  chunks: Float32Array[]
}

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function logSttDebug(message: string, details?: Record<string, unknown>) {
  if (!import.meta.env.DEV)
    return

  if (details)
    console.debug(STT_DEBUG_PREFIX, message, details)
  else
    console.debug(STT_DEBUG_PREFIX, message)
}

const state = reactive({
  listening: false,
  speechDetected: false,
  interimTranscript: '',
  committedTranscript: '',
  error: null as string | null,
  autoSendEnabled: readStorage(getStorageScope(), AUTO_SEND_KEY, true),
  locale: readStorage(getStorageScope(), LOCALE_KEY, typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
  vadReady: false,
  activeProvider: 'none' as ActiveProvider,
  fallbackActive: false,
})

const audio = useAudioSession()
const conversation = useConversationState()
const serverStt = useServerStt()

let initialized = false
let desiredListening = false
let recognition: BrowserRecognition | null = null
let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let mediaStreamSource: MediaStreamAudioSourceNode | null = null
let silenceGain: GainNode | null = null
let finalizeTimer: ReturnType<typeof setTimeout> | undefined
let vadWorkletUrl: string | null = null
let browserTranscriptRevision = 0
let browserSessionFailed = false
let browserSessionError: string | null = null
let pendingBrowserFallbackTimer: ReturnType<typeof setTimeout> | undefined
let pendingBrowserFallback: PendingBrowserFallback | null = null
const pendingServerControllers = new Set<AbortController>()
const pendingServerRequests = new Set<Promise<unknown>>()

const vadState = {
  speaking: false,
  silenceMs: 0,
}

const utteranceState = {
  active: false,
  sequence: 0,
  chunks: [] as Float32Array[],
  browserTranscriptBaseline: 0,
}

function isMobileSpeechBrowser() {
  if (typeof navigator === 'undefined')
    return false

  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function browserSpeechSupported() {
  return typeof window !== 'undefined'
    && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition)
}

function isOperaSpeechBrowser() {
  if (typeof navigator === 'undefined')
    return false

  return /\bOPR\/|Opera/i.test(navigator.userAgent)
}

function isPhantomInAppBrowser() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined')
    return false

  const ua = navigator.userAgent || ''
  const referrer = typeof document !== 'undefined' ? document.referrer || '' : ''
  const hasPhantomProvider = Boolean((window as any).phantom?.solana?.isPhantom || (window as any).solana?.isPhantom)

  return /Phantom/i.test(ua)
    || /phantom\.app/i.test(referrer)
    || (hasPhantomProvider && /Android|iPhone|iPad|iPod/i.test(ua))
}

function isKnownProblematicSpeechBrowser() {
  return isOperaSpeechBrowser() || isPhantomInAppBrowser()
}

function persistSettings() {
  writeStorage(getStorageScope(), AUTO_SEND_KEY, state.autoSendEnabled)
  writeStorage(getStorageScope(), LOCALE_KEY, state.locale)
}

function resolveVadWorkletUrl() {
  if (vadWorkletUrl || typeof URL === 'undefined' || typeof Blob === 'undefined')
    return vadWorkletUrl

  vadWorkletUrl = URL.createObjectURL(new Blob([vadWorkletSource], {
    type: 'text/javascript',
  }))
  return vadWorkletUrl
}

function resetTranscriptState() {
  state.interimTranscript = ''
  state.committedTranscript = ''
}

function combinedTranscript() {
  return [state.committedTranscript.trim(), state.interimTranscript.trim()].filter(Boolean).join(' ').trim()
}

async function flushTranscript(force = false) {
  const text = combinedTranscript()
  if (!text) {
    resetTranscriptState()
    return ''
  }

  if (!force && (!state.autoSendEnabled || conversation.sending.value))
    return text

  resetTranscriptState()
  await conversation.sendMessage(text)
  return text
}

function scheduleFlush(delayMs = 320) {
  if (finalizeTimer)
    clearTimeout(finalizeTimer)

  finalizeTimer = setTimeout(() => {
    finalizeTimer = undefined
    void flushTranscript()
  }, delayMs)
}

function appendCommitted(text: string) {
  const normalized = text.trim()
  if (!normalized)
    return

  state.committedTranscript = state.committedTranscript
    ? `${state.committedTranscript} ${normalized}`.trim()
    : normalized
}

function setAutoSendEnabled(value: boolean) {
  state.autoSendEnabled = value
  persistSettings()
}

function setLocale(value: string) {
  state.locale = value
  persistSettings()

  if (recognition)
    recognition.lang = state.locale || 'en-US'
}

function clearPendingBrowserFallback() {
  if (pendingBrowserFallbackTimer) {
    clearTimeout(pendingBrowserFallbackTimer)
    pendingBrowserFallbackTimer = undefined
  }
  pendingBrowserFallback = null
}

function getMinimumUtteranceSamples() {
  return Math.max(1, Math.round(VAD_SAMPLE_RATE * (appConfig.sttMinUtteranceMs / 1000)))
}

function measureUtterance(chunks: readonly Float32Array[]) {
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  return {
    sampleCount,
    durationMs: Math.round((sampleCount / VAD_SAMPLE_RATE) * 1000),
    minimumSamples: getMinimumUtteranceSamples(),
  }
}

function trackPendingServerRequest<T>(promise: Promise<T>, controller: AbortController) {
  pendingServerControllers.add(controller)
  pendingServerRequests.add(promise)

  const cleanup = () => {
    pendingServerControllers.delete(controller)
    pendingServerRequests.delete(promise)
  }

  promise.finally(cleanup)
  return promise
}

function abortPendingServerRequests() {
  for (const controller of pendingServerControllers)
    controller.abort()
  pendingServerControllers.clear()
  pendingServerRequests.clear()
}

async function awaitPendingServerRequests() {
  if (!pendingServerRequests.size)
    return

  const requests = Array.from(pendingServerRequests)
  await Promise.allSettled(requests)
}

function disposeVadGraph() {
  try {
    mediaStreamSource?.disconnect()
    workletNode?.disconnect()
    silenceGain?.disconnect()
  }
  catch {
  }

  mediaStreamSource = null
  workletNode = null
  silenceGain = null
  state.vadReady = false

  if (audioContext && audioContext.state !== 'closed')
    void audioContext.close()

  audioContext = null
  audio.setVolumeLevel(0)
}

function serverConfigured() {
  return serverStt.configured
}

function canFallbackToServer() {
  return appConfig.sttProvider === 'auto' && serverConfigured()
}

function resolveConfiguredProvider(): ActiveProvider {
  if (appConfig.sttProvider === 'browser')
    return browserSpeechSupported() ? 'browser' : 'none'

  if (appConfig.sttProvider === 'server')
    return serverConfigured() ? 'server' : 'none'

  if (browserSpeechSupported() && !browserSessionFailed && !isKnownProblematicSpeechBrowser())
    return 'browser'

  if (serverConfigured())
    return 'server'

  if (browserSpeechSupported() && !browserSessionFailed)
    return 'browser'

  return 'none'
}

function setActiveProvider(provider: ActiveProvider, options?: { fallbackActive?: boolean }) {
  state.activeProvider = provider
  state.fallbackActive = options?.fallbackActive ?? false
}

function describeProvider() {
  switch (state.activeProvider) {
    case 'browser':
      return 'Browser STT'
    case 'server':
      return 'Server STT'
    default:
      return 'Unavailable'
  }
}

function describeRecognitionError(error: string | null | undefined) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Speech recognition was blocked by this browser.'
    case 'network':
      return 'Browser speech recognition is unavailable in this browser session.'
    default:
      return error || 'Speech recognition failed.'
  }
}

function describeMissingProvider() {
  if (appConfig.sttProvider === 'server')
    return 'Server STT is unavailable. Configure VITE_AIR3_STT_WS_URL or the same-origin /api/stt/ws bridge.'

  if (appConfig.sttProvider === 'browser')
    return 'Speech recognition is unavailable in this browser.'

  return 'Voice transcription is unavailable. Configure a server STT fallback or use a browser with speech recognition support.'
}

function shouldBufferUtterances() {
  return state.activeProvider === 'server' || canFallbackToServer()
}

function resetUtteranceState() {
  utteranceState.active = false
  utteranceState.chunks = []
  utteranceState.browserTranscriptBaseline = browserTranscriptRevision
}

function startUtterance() {
  clearPendingBrowserFallback()
  utteranceState.sequence += 1
  utteranceState.active = true
  utteranceState.chunks = []
  utteranceState.browserTranscriptBaseline = browserTranscriptRevision
}

function bufferUtteranceChunk(chunk: Float32Array) {
  if (!utteranceState.active || !shouldBufferUtterances())
    return

  utteranceState.chunks.push(chunk.slice())
}

async function transcribeBufferedChunks(chunks: readonly Float32Array[], options?: { markFallback?: boolean, signal?: AbortSignal }) {
  const samples = concatFloat32Chunks(chunks)
  const minimumSamples = getMinimumUtteranceSamples()
  if (!samples.length || samples.length < minimumSamples) {
    logSttDebug('Skipped server STT before websocket open because the utterance is too short.', {
      provider: state.activeProvider,
      samples: samples.length,
      durationMs: Math.round((samples.length / VAD_SAMPLE_RATE) * 1000),
      minimumSamples,
    })
    return ''
  }

  const recording = encodeMono16BitWav(samples, VAD_SAMPLE_RATE)
  const transcript = await serverStt.transcribeRecording(recording, { signal: options?.signal })
  if (options?.markFallback)
    state.fallbackActive = true

  return transcript.trim()
}

async function submitUtteranceToServer(chunks: readonly Float32Array[], options?: { markFallback?: boolean }) {
  if (!chunks.length || !serverConfigured())
    return ''

  const metrics = measureUtterance(chunks)
  if (metrics.sampleCount < metrics.minimumSamples) {
    logSttDebug('Dropped utterance before sherpa send because it is below the minimum duration.', {
      provider: state.activeProvider,
      samples: metrics.sampleCount,
      durationMs: metrics.durationMs,
      minimumSamples: metrics.minimumSamples,
    })
    return ''
  }

  const controller = new AbortController()
  const request = trackPendingServerRequest(
    transcribeBufferedChunks(chunks, {
      markFallback: options?.markFallback,
      signal: controller.signal,
    }),
    controller,
  )

  try {
    state.error = null
    const transcript = await request
    if (transcript) {
      state.interimTranscript = ''
      appendCommitted(transcript)
      if (!state.speechDetected)
        scheduleFlush(220)
    }
    return transcript
  }
  catch (error) {
    if (isAbortError(error))
      return ''

    if (state.activeProvider === 'server')
      state.error = error instanceof Error ? error.message : 'Server STT failed.'

    return ''
  }
}

function scheduleBrowserFallback(sequence: number, baselineRevision: number, chunks: Float32Array[]) {
  if (!canFallbackToServer() || !chunks.length)
    return

  const metrics = measureUtterance(chunks)
  if (metrics.sampleCount < metrics.minimumSamples) {
    logSttDebug('Skipped browser fallback because the buffered utterance is too short.', {
      provider: state.activeProvider,
      samples: metrics.sampleCount,
      durationMs: metrics.durationMs,
      minimumSamples: metrics.minimumSamples,
    })
    return
  }

  clearPendingBrowserFallback()
  pendingBrowserFallback = {
    sequence,
    baselineRevision,
    chunks,
  }

  pendingBrowserFallbackTimer = setTimeout(() => {
    pendingBrowserFallbackTimer = undefined
    const fallback = pendingBrowserFallback
    pendingBrowserFallback = null
    if (!fallback)
      return

    if (browserTranscriptRevision > fallback.baselineRevision)
      return

    void submitUtteranceToServer(fallback.chunks, { markFallback: true })
  }, BROWSER_RESULT_GRACE_MS)
}

function handleVadSpeechStart() {
  vadState.speaking = true
  vadState.silenceMs = 0
  state.speechDetected = true
  startUtterance()
}

function finalizeCurrentUtterance() {
  if (!utteranceState.active)
    return

  const sequence = utteranceState.sequence
  const chunks = utteranceState.chunks.map(chunk => chunk.slice())
  const baselineRevision = utteranceState.browserTranscriptBaseline
  resetUtteranceState()
  const metrics = measureUtterance(chunks)

  if (!chunks.length) {
    if (state.activeProvider === 'browser')
      scheduleFlush()
    return
  }

  if (state.activeProvider === 'server') {
    if (metrics.sampleCount < metrics.minimumSamples) {
      logSttDebug('Dropped server-mode utterance because it is below the minimum duration.', {
        provider: state.activeProvider,
        samples: metrics.sampleCount,
        durationMs: metrics.durationMs,
        minimumSamples: metrics.minimumSamples,
      })
      return
    }
    void submitUtteranceToServer(chunks)
    return
  }

  scheduleFlush(320)
  scheduleBrowserFallback(sequence, baselineRevision, chunks)
}

function handleVadSpeechEnd() {
  vadState.speaking = false
  vadState.silenceMs = 0
  state.speechDetected = false
  finalizeCurrentUtterance()
}

function processVadChunk(buffer: Float32Array) {
  const chunk = new Float32Array(buffer)
  let energy = 0
  for (let index = 0; index < chunk.length; index += 1)
    energy += chunk[index]! * chunk[index]!

  const rms = Math.sqrt(energy / Math.max(1, chunk.length))
  const normalizedLevel = Math.min(1, rms * 9)
  audio.setVolumeLevel(normalizedLevel)

  const chunkMs = (chunk.length / VAD_SAMPLE_RATE) * 1000

  if (rms >= SPEECH_THRESHOLD) {
    if (!vadState.speaking)
      handleVadSpeechStart()

    bufferUtteranceChunk(chunk)
    vadState.speaking = true
    vadState.silenceMs = 0
    return
  }

  if (utteranceState.active)
    bufferUtteranceChunk(chunk)

  if (!vadState.speaking || rms >= EXIT_THRESHOLD)
    return

  vadState.silenceMs += chunkMs
  if (vadState.silenceMs >= SPEECH_END_SILENCE_MS)
    handleVadSpeechEnd()
}

async function ensureVad(stream: MediaStream) {
  if (audioContext && workletNode && mediaStreamSource)
    return

  const workletUrl = resolveVadWorkletUrl()
  if (!workletUrl)
    throw new Error('Unable to prepare the voice activity detector module.')

  audioContext = new AudioContext({
    sampleRate: VAD_SAMPLE_RATE,
    latencyHint: 'interactive',
  })

  await audioContext.audioWorklet.addModule(workletUrl)
  workletNode = new AudioWorkletNode(audioContext, 'vad-audio-worklet-processor')
  workletNode.port.onmessage = (event: MessageEvent<{ buffer?: Float32Array }>) => {
    const buffer = event.data?.buffer
    if (!buffer)
      return
    processVadChunk(new Float32Array(buffer))
  }

  mediaStreamSource = audioContext.createMediaStreamSource(stream)
  mediaStreamSource.connect(workletNode)
  silenceGain = audioContext.createGain()
  silenceGain.gain.value = 0
  workletNode.connect(silenceGain)
  silenceGain.connect(audioContext.destination)
  state.vadReady = true
}

function stopRecognition() {
  if (!recognition)
    return

  const instance = recognition
  recognition = null

  try {
    instance.stop()
  }
  catch {
  }
}

function switchToServerFallback(errorCode?: string | null) {
  if (!canFallbackToServer())
    return false

  browserSessionFailed = true
  browserSessionError = errorCode || null
  setActiveProvider('server', { fallbackActive: true })
  state.error = null
  stopRecognition()
  state.interimTranscript = ''
  state.listening = true
  return true
}

function buildRecognition() {
  const RecognitionConstructor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
  if (!RecognitionConstructor)
    throw new Error('Speech recognition is unavailable in this browser.')

  const instance = new RecognitionConstructor() as BrowserRecognition
  instance.continuous = !isMobileSpeechBrowser()
  instance.interimResults = true
  instance.maxAlternatives = 1
  instance.lang = state.locale || 'en-US'
  instance.onstart = () => {
    state.listening = true
    state.error = null
  }
  instance.onspeechstart = () => {
    if (!vadState.speaking)
      handleVadSpeechStart()
  }
  instance.onspeechend = () => {
    if (vadState.speaking)
      handleVadSpeechEnd()
  }

  instance.onresult = (event: any) => {
    let interim = ''
    let sawTranscript = false

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result?.[0]?.transcript?.trim?.() || ''
      if (!transcript)
        continue

      sawTranscript = true
      if (result.isFinal)
        appendCommitted(transcript)
      else
        interim = transcript
    }

    if (sawTranscript)
      browserTranscriptRevision += 1

    state.interimTranscript = interim
    state.error = null

    if (!state.speechDetected && state.committedTranscript)
      scheduleFlush(240)
  }

  instance.onerror = (event: any) => {
    const errorCode = event?.error || null
    if (errorCode === 'aborted' || errorCode === 'no-speech')
      return

    if (switchToServerFallback(errorCode))
      return

    if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed')
      desiredListening = false

    state.error = describeRecognitionError(errorCode)
  }

  instance.onend = () => {
    if (desiredListening && state.activeProvider === 'browser' && !isMobileSpeechBrowser()) {
      try {
        instance.start()
        return
      }
      catch (error) {
        if (switchToServerFallback(error instanceof Error ? error.message : null))
          return
      }
    }

    if (desiredListening && state.activeProvider === 'server') {
      state.listening = true
      return
    }

    state.listening = false
  }

  return instance
}

async function transcribeForMediaStream(stream: MediaStream) {
  await ensureVad(stream)
  if (audioContext?.state === 'suspended')
    await audioContext.resume()
}

async function transcribeForRecording(recording: Blob | null | undefined) {
  if (!recording)
    return ''

  if (!serverConfigured())
    throw new Error('Server STT is unavailable. Configure VITE_AIR3_STT_WS_URL or /api/stt/ws.')

  return serverStt.transcribeRecording(recording)
}

function prepareProviderForListening() {
  browserSessionFailed = false
  browserSessionError = null
  clearPendingBrowserFallback()

  const initialProvider = resolveConfiguredProvider()
  if (initialProvider === 'none')
    throw new Error(describeMissingProvider())

  setActiveProvider(initialProvider, {
    fallbackActive: appConfig.sttProvider === 'auto' && initialProvider === 'server',
  })
  logSttDebug('Listening session started with provider.', {
    provider: initialProvider,
    mode: appConfig.sttProvider,
  })
}

async function startListening() {
  state.error = null
  desiredListening = true
  prepareProviderForListening()

  let recognitionStarted = false

  try {
    if (state.activeProvider === 'browser') {
      stopRecognition()
      recognition = buildRecognition()
      recognition.start()
      recognitionStarted = true
    }

    const stream = await audio.startStream()
    await transcribeForMediaStream(stream)
    state.listening = true
  }
  catch (error) {
    if (state.activeProvider === 'browser' && canFallbackToServer()) {
      switchToServerFallback(error instanceof Error ? error.message : null)
      try {
        const stream = await audio.startStream()
        await transcribeForMediaStream(stream)
        state.listening = true
        return
      }
      catch (fallbackError) {
        state.error = fallbackError instanceof Error ? fallbackError.message : 'Unable to start voice input.'
      }
    }
    else {
      desiredListening = false
      if (recognitionStarted)
        stopRecognition()
      state.error = error instanceof Error ? error.message : 'Unable to start voice input.'
    }

    state.listening = false
    state.speechDetected = false
    vadState.speaking = false
    vadState.silenceMs = 0
    resetUtteranceState()
    disposeVadGraph()
    audio.stopStream()
  }
}

async function stopStreamingTranscription(abort = false) {
  desiredListening = false
  if (finalizeTimer) {
    clearTimeout(finalizeTimer)
    finalizeTimer = undefined
  }

  const fallbackBeforeStop = !abort && pendingBrowserFallback
    ? {
        sequence: pendingBrowserFallback.sequence,
        baselineRevision: pendingBrowserFallback.baselineRevision,
        chunks: pendingBrowserFallback.chunks.map(chunk => chunk.slice()),
      }
    : null

  clearPendingBrowserFallback()

  if (!abort && utteranceState.active) {
    state.speechDetected = false
    vadState.speaking = false
    vadState.silenceMs = 0
    finalizeCurrentUtterance()
  }
  else if (abort) {
    resetUtteranceState()
  }

  stopRecognition()
  state.listening = false
  state.speechDetected = false
  vadState.speaking = false
  vadState.silenceMs = 0
  disposeVadGraph()
  audio.stopStream()

  if (abort) {
    abortPendingServerRequests()
    resetTranscriptState()
    await serverStt.disconnect()
    return ''
  }

  const fallbackToResolve = pendingBrowserFallback || fallbackBeforeStop
  if (fallbackToResolve && canFallbackToServer() && browserTranscriptRevision <= fallbackToResolve.baselineRevision) {
    const fallback = fallbackToResolve
    clearPendingBrowserFallback()
    await submitUtteranceToServer(fallback.chunks, { markFallback: true })
  }

  await awaitPendingServerRequests()
  await serverStt.disconnect()
  return flushTranscript(true)
}

async function toggleListening() {
  if (state.listening) {
    await stopStreamingTranscription(false)
    return
  }

  await startListening()
}

function initialize() {
  if (initialized)
    return

  initialized = true
}

export function useHearingPipeline() {
  initialize()

  const supported = computed(() => {
    if (appConfig.sttProvider === 'browser')
      return browserSpeechSupported()
    if (appConfig.sttProvider === 'server')
      return serverConfigured()
    return browserSpeechSupported() || serverConfigured()
  })

  return {
    supported,
    listening: computed(() => state.listening),
    speechDetected: computed(() => state.speechDetected),
    interimTranscript: computed(() => state.interimTranscript),
    committedTranscript: computed(() => state.committedTranscript),
    combinedTranscript: computed(() => combinedTranscript()),
    autoSendEnabled: computed(() => state.autoSendEnabled),
    locale: computed(() => state.locale),
    vadReady: computed(() => state.vadReady),
    error: computed(() => state.error),
    supportsStreamInput: supported,
    availableInputs: audio.availableInputs,
    selectedInputId: audio.selectedInputId,
    permissionGranted: audio.permissionGranted,
    volumeLevel: audio.volumeLevel,
    providerName: computed(() => describeProvider()),
    transcriptionMode: computed(() => appConfig.sttProvider),
    fallbackActive: computed(() => state.fallbackActive),
    requestPermission: audio.requestPermission,
    setSelectedInput: audio.setSelectedInput,
    setAutoSendEnabled,
    setLocale,
    flushTranscript,
    transcribeForRecording,
    transcribeForMediaStream,
    stopStreamingTranscription,
    startListening,
    toggleListening,
  }
}
