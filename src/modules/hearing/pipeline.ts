import { computed, reactive } from 'vue'

import { readStorage, writeStorage } from '@/lib/storage'
import { useAudioSession } from '@/modules/audio/session'
import { useConversationState } from '@/modules/conversation/state'
import vadWorkletUrl from '@/workers/vad/process.worklet?url'

const AUTO_SEND_KEY = 'airifica:hearing-auto-send'
const LOCALE_KEY = 'airifica:hearing-locale'

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
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
})

const audio = useAudioSession()
const conversation = useConversationState()

let initialized = false
let desiredListening = false
let recognition: any = null
let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let mediaStreamSource: MediaStreamAudioSourceNode | null = null
let silenceGain: GainNode | null = null
let finalizeTimer: ReturnType<typeof setTimeout> | undefined

const vadState = {
  speaking: false,
  silenceMs: 0,
}

function browserSpeechSupported() {
  return typeof window !== 'undefined'
    && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition)
}

function persistSettings() {
  writeStorage(getStorageScope(), AUTO_SEND_KEY, state.autoSendEnabled)
  writeStorage(getStorageScope(), LOCALE_KEY, state.locale)
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

  if (audioContext && audioContext.state !== 'closed') {
    void audioContext.close()
  }
  audioContext = null
  audio.setVolumeLevel(0)
}

function handleVadSpeechStart() {
  vadState.speaking = true
  vadState.silenceMs = 0
  state.speechDetected = true
}

function handleVadSpeechEnd() {
  vadState.speaking = false
  vadState.silenceMs = 0
  state.speechDetected = false
  scheduleFlush()
}

function processVadChunk(buffer: Float32Array) {
  let energy = 0
  for (let index = 0; index < buffer.length; index += 1)
    energy += buffer[index]! * buffer[index]!

  const rms = Math.sqrt(energy / Math.max(1, buffer.length))
  const normalizedLevel = Math.min(1, rms * 9)
  audio.setVolumeLevel(normalizedLevel)

  const chunkMs = (buffer.length / 16000) * 1000
  const speechThreshold = 0.05
  const exitThreshold = 0.025

  if (rms >= speechThreshold) {
    if (!vadState.speaking)
      handleVadSpeechStart()
    vadState.speaking = true
    vadState.silenceMs = 0
    return
  }

  if (!vadState.speaking || rms >= exitThreshold)
    return

  vadState.silenceMs += chunkMs
  if (vadState.silenceMs >= 420)
    handleVadSpeechEnd()
}

async function ensureVad(stream: MediaStream) {
  if (audioContext && workletNode && mediaStreamSource)
    return

  audioContext = new AudioContext({
    sampleRate: 16000,
    latencyHint: 'interactive',
  })

  await audioContext.audioWorklet.addModule(vadWorkletUrl)
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

  try {
    recognition.stop()
  }
  catch {
  }
  recognition = null
}

function buildRecognition() {
  const RecognitionConstructor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
  if (!RecognitionConstructor)
    throw new Error('Speech recognition is unavailable in this browser.')

  const instance = new RecognitionConstructor()
  instance.continuous = true
  instance.interimResults = true
  instance.maxAlternatives = 1
  instance.lang = state.locale || 'en-US'
  instance.onstart = () => {
    state.listening = true
  }
  instance.onspeechstart = () => {
    handleVadSpeechStart()
  }
  instance.onspeechend = () => {
    handleVadSpeechEnd()
  }

  instance.onresult = (event: any) => {
    let interim = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result?.[0]?.transcript?.trim?.() || ''
      if (!transcript)
        continue

      if (result.isFinal)
        appendCommitted(transcript)
      else
        interim = transcript
    }

    state.interimTranscript = interim
    if (!state.speechDetected && state.committedTranscript)
      scheduleFlush(240)
  }

  instance.onerror = (event: any) => {
    if (event.error === 'aborted' || event.error === 'no-speech')
      return
    state.error = event.error || 'Speech recognition failed.'
  }

  instance.onend = () => {
    if (desiredListening) {
      try {
        instance.start()
        return
      }
      catch {
      }
    }

    state.listening = false
  }

  return instance
}

async function transcribeForMediaStream(stream: MediaStream) {
  if (!browserSpeechSupported())
    throw new Error('Speech recognition is unavailable in this browser.')

  await ensureVad(stream)
  if (audioContext?.state === 'suspended')
    await audioContext.resume()

  stopRecognition()
  recognition = buildRecognition()
  recognition.start()
}

async function transcribeForRecording(recording: Blob | null | undefined) {
  if (!recording)
    return ''

  const text = combinedTranscript()
  if (text)
    return text

  throw new Error('Blob transcription is unavailable in browser speech mode.')
}

async function startListening() {
  state.error = null
  desiredListening = true
  const stream = await audio.startStream()
  await transcribeForMediaStream(stream)
  state.listening = true
}

async function stopStreamingTranscription(abort = false) {
  desiredListening = false
  if (finalizeTimer) {
    clearTimeout(finalizeTimer)
    finalizeTimer = undefined
  }

  stopRecognition()
  state.listening = false
  state.speechDetected = false
  vadState.speaking = false
  vadState.silenceMs = 0
  disposeVadGraph()
  audio.stopStream()

  if (abort)
    resetTranscriptState()

  return abort ? '' : flushTranscript(true)
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

  return {
    supported: computed(() => browserSpeechSupported()),
    listening: computed(() => state.listening),
    speechDetected: computed(() => state.speechDetected),
    interimTranscript: computed(() => state.interimTranscript),
    committedTranscript: computed(() => state.committedTranscript),
    combinedTranscript: computed(() => combinedTranscript()),
    autoSendEnabled: computed(() => state.autoSendEnabled),
    locale: computed(() => state.locale),
    vadReady: computed(() => state.vadReady),
    error: computed(() => state.error),
    supportsStreamInput: computed(() => browserSpeechSupported()),
    availableInputs: audio.availableInputs,
    selectedInputId: audio.selectedInputId,
    permissionGranted: audio.permissionGranted,
    volumeLevel: audio.volumeLevel,
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
