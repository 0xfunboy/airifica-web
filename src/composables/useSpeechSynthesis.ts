import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const speaking = ref(false)
  const voices = ref<SpeechSynthesisVoice[]>([])
  let utterance: SpeechSynthesisUtterance | null = null

  function loadVoices() {
    if (!supported)
      return

    voices.value = window.speechSynthesis.getVoices()
  }

  function stop() {
    if (!supported)
      return

    window.speechSynthesis.cancel()
    speaking.value = false
    utterance = null
  }

  function pickVoice(preferredVoice: string) {
    if (!preferredVoice)
      return null

    return voices.value.find(voice =>
      voice.name === preferredVoice
      || voice.voiceURI === preferredVoice,
    ) || null
  }

  async function speak(text: string, preferredVoice: string) {
    if (!supported || !text.trim())
      return

    stop()

    await new Promise<void>((resolve) => {
      const nextUtterance = new SpeechSynthesisUtterance(text)
      const voice = pickVoice(preferredVoice)

      if (voice)
        nextUtterance.voice = voice

      nextUtterance.onstart = () => {
        speaking.value = true
      }
      nextUtterance.onend = () => {
        speaking.value = false
        utterance = null
        resolve()
      }
      nextUtterance.onerror = () => {
        speaking.value = false
        utterance = null
        resolve()
      }

      utterance = nextUtterance
      window.speechSynthesis.speak(nextUtterance)
    })
  }

  onMounted(() => {
    if (!supported)
      return

    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
  })

  onBeforeUnmount(() => {
    if (!supported)
      return

    stop()
    window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  })

  const voiceOptions = computed(() =>
    voices.value.map(voice => ({
      label: `${voice.name} (${voice.lang})`,
      value: voice.name,
    })),
  )

  return {
    supported,
    speaking,
    voiceOptions,
    stop,
    speak,
  }
}

