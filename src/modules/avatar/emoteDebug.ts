import { computed, reactive } from 'vue'

export const EMOTE_DEBUG_OPTIONS = ['none', 'happy', 'sad', 'angry', 'surprised', 'think'] as const

export type EmoteDebugOption = typeof EMOTE_DEBUG_OPTIONS[number]

const state = reactive({
  testEmotion: 'none' as EmoteDebugOption,
  lastReceived: null as { name: string, ts: number } | null,
})

function setTestEmotion(value: string) {
  if (!EMOTE_DEBUG_OPTIONS.includes(value as EmoteDebugOption))
    return
  state.testEmotion = value as EmoteDebugOption
}

function notifyReceived(name: string) {
  state.lastReceived = { name, ts: Date.now() }
}

export function useEmoteDebugStore() {
  return {
    testEmotion: computed(() => state.testEmotion),
    lastReceived: computed(() => state.lastReceived),
    setTestEmotion,
    notifyReceived,
  }
}
