import { computed, reactive, watch } from 'vue'

import { readStorage, writeStorage } from '@/lib/storage'
import { useConversationState } from '@/modules/conversation/state'

const AUTO_SPEAK_KEY = 'airifica:auto-speak'
const LOCALE_KEY = 'airifica:speech-locale'
const VOICE_KEY = 'airifica:speech-voice'

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

const state = reactive({
  autoSpeakEnabled: readStorage(getStorageScope(), AUTO_SPEAK_KEY, true),
  locale: readStorage(getStorageScope(), LOCALE_KEY, typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
  voiceId: readStorage(getStorageScope(), VOICE_KEY, ''),
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  speaking: false,
  mouthOpenSize: 0,
  error: null as string | null,
  queue: [] as Array<{ id: string, text: string }>,
})

const conversation = useConversationState()
const seenAssistantMessages = new Set<string>()
let initialized = false
let currentUtterance: SpeechSynthesisUtterance | null = null
let mouthFrameId: number | undefined
let mouthTarget = 0

function persistSettings() {
  writeStorage(getStorageScope(), AUTO_SPEAK_KEY, state.autoSpeakEnabled)
  writeStorage(getStorageScope(), LOCALE_KEY, state.locale)
  writeStorage(getStorageScope(), VOICE_KEY, state.voiceId)
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

function startLipSync() {
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

function stop(reason = 'manual-stop') {
  state.queue = []
  if (!state.supported)
    return

  try {
    window.speechSynthesis.cancel()
  }
  catch {
  }

  currentUtterance = null
  state.error = reason === 'manual-stop' ? null : reason
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

async function processQueue() {
  if (!state.supported || currentUtterance || state.queue.length === 0)
    return

  const next = state.queue[0]
  const normalized = next.text.trim()
  if (!normalized) {
    state.queue.shift()
    void processQueue()
    return
  }

  const utterance = new SpeechSynthesisUtterance(normalized)
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
    startLipSync()
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
    autoSpeakEnabled: computed(() => state.autoSpeakEnabled),
    locale: computed(() => state.locale),
    voiceId: computed(() => state.voiceId),
    speaking: computed(() => state.speaking),
    mouthOpenSize: computed(() => state.mouthOpenSize),
    error: computed(() => state.error),
    queueSize: computed(() => state.queue.length),
    enqueue,
    stop,
    setAutoSpeakEnabled,
    setLocale,
  }
}
