import { computed, reactive, watch } from 'vue'

import { appConfig } from '@/config/app'
import { readStorage, writeStorage } from '@/lib/storage'
import { useConversationState } from '@/modules/conversation/state'

const AUTO_SPEAK_KEY = 'airifica:auto-speak'
const LOCALE_KEY = 'airifica:speech-locale'
const VOICE_KEY = 'airifica:speech-voice'
const MODE_KEY = 'airifica:speech-mode'

type SpeechMode = 'browser' | 'external'

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
  if (appConfig.ttsProvider === 'external' && canUseExternalSpeech())
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
let mouthFrameId: number | undefined
let mouthTarget = 0

function persistSettings() {
  writeStorage(getStorageScope(), AUTO_SPEAK_KEY, state.autoSpeakEnabled)
  writeStorage(getStorageScope(), LOCALE_KEY, state.locale)
  writeStorage(getStorageScope(), VOICE_KEY, state.voiceId)
  if (state.preferredMode)
    writeStorage(getStorageScope(), MODE_KEY, state.preferredMode)
}

function stopLipSync() {
  if (mouthFrameId) {
    window.cancelAnimationFrame(mouthFrameId)
    mouthFrameId = undefined
  }

  state.speaking = false
  state.mouthOpenSize = 0
  mouthTarget = 0
}

function startSpeechSynthesisLipSync() {
  stopLipSync()
  state.speaking = true
  mouthTarget = 24

  const tick = () => {
    mouthTarget *= 0.82
    state.mouthOpenSize = state.mouthOpenSize * 0.72 + mouthTarget * 0.28

    if (!state.speaking && state.mouthOpenSize < 0.5) {
      state.mouthOpenSize = 0
      mouthFrameId = undefined
      return
    }

    mouthFrameId = window.requestAnimationFrame(tick)
  }

  mouthFrameId = window.requestAnimationFrame(tick)
}

function startExternalAudioLipSync(audio: HTMLAudioElement) {
  stopLipSync()
  state.speaking = true

  const tick = () => {
    if (!state.speaking || currentAudio !== audio) {
      mouthFrameId = undefined
      return
    }

    const phasePrimary = audio.currentTime * 11.6
    const phaseSecondary = audio.currentTime * 6.4
    const energy = audio.paused
      ? 0
      : 20
        + (Math.sin(phasePrimary) * 0.5 + 0.5) * 18
        + (Math.sin(phaseSecondary) * 0.5 + 0.5) * 10
    mouthTarget = energy
    state.mouthOpenSize = state.mouthOpenSize * 0.7 + mouthTarget * 0.3
    mouthFrameId = window.requestAnimationFrame(tick)
  }

  mouthFrameId = window.requestAnimationFrame(tick)
}

function cleanupExternalPlayback() {
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
    startSpeechSynthesisLipSync()
  }

  utterance.onboundary = () => {
    mouthTarget = 44 + Math.random() * 22
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (appConfig.ttsApiKey)
    headers.Authorization = `Bearer ${appConfig.ttsApiKey}`

  const response = await fetch(appConfig.ttsSpeechUrl, {
    method: 'POST',
    headers,
    signal: currentFetchController.signal,
    body: JSON.stringify({
      model: appConfig.ttsModel,
      voice: appConfig.ttsVoice,
      input: text,
      response_format: appConfig.ttsResponseFormat,
      format: appConfig.ttsResponseFormat,
    }),
  })

  if (!response.ok) {
    let details = ''
    try {
      details = await response.text()
    }
    catch {
    }
    throw new Error(details || `External TTS failed with ${response.status} ${response.statusText}.`)
  }

  const blob = await response.blob()
  if (!blob.size)
    throw new Error('External TTS returned an empty audio payload.')

  currentFetchController = null
  return blob
}

async function playExternalQueueItem(next: { id: string, text: string }) {
  if (!canUseExternalSpeech())
    return false

  const blob = await fetchExternalSpeech(next.text)
  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = objectUrl

  currentAudio = audio
  currentAudioUrl = objectUrl

  audio.onplay = () => {
    state.activeMode = 'external'
    startExternalAudioLipSync(audio)
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
    if (preferredMode === 'external' && canUseBrowserSpeech()) {
      try {
        await playBrowserQueueItem({ ...next, text: normalized })
        return
      }
      catch {
      }
    }

    state.queue.shift()
    cleanupExternalPlayback()
    currentFetchController = null
    currentUtterance = null
    state.error = error instanceof Error ? error.message : 'Speech playback failed.'
    stopLipSync()
    void processQueue()
  }
}

function enqueue(text: string, id: string) {
  if (!state.supported || !state.autoSpeakEnabled)
    return

  const normalized = text.trim()
  if (!normalized)
    return

  state.queue.push({ id, text: normalized })
  void processQueue()
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
    error: computed(() => state.error),
    queueSize: computed(() => state.queue.length),
    activeMode: computed(() => state.activeMode),
    externalEndpoint: computed(() => appConfig.ttsSpeechUrl),
    enqueue,
    stop,
    setAutoSpeakEnabled,
    setLocale,
    setPreferredMode,
  }
}
