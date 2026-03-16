import { computed, reactive, watch } from 'vue'

import { BREATH_URL } from '@airifica/avatar3d'

import type { AvatarExpression } from '@airifica/avatar3d'

import { appConfig } from '@/config/app'
import { useConversationState } from '@/modules/conversation/state'
import { useSpeechRuntime } from '@/modules/speech/runtime'

const state = reactive({
  expression: 'neutral' as AvatarExpression,
  loadingState: appConfig.avatarModelUrl ? 'idle' as 'idle' | 'loading' | 'ready' | 'error' : 'empty' as 'idle' | 'loading' | 'ready' | 'error' | 'empty',
  loadProgress: 0,
  error: null as string | null,
})

const conversation = useConversationState()
const speech = useSpeechRuntime()
let initialized = false
let expressionTimer: ReturnType<typeof setTimeout> | undefined

function detectAvatarExpression(text: string) {
  const lowered = text.toLowerCase()
  if (/\b(error|failed|risk|drawdown|stop loss|caution|bearish)\b/.test(lowered))
    return 'sad' as const
  if (/\b(angry|liquidation|panic|urgent)\b/.test(lowered))
    return 'angry' as const
  if (/\b(breakout|volatility|setup|alert|watch closely|reversal)\b/.test(lowered))
    return 'surprised' as const
  if (/\b(ready|bullish|favorable|opportunity|confirmed|aligned)\b/.test(lowered))
    return 'happy' as const
  return 'neutral' as const
}

function setExpression(expression: AvatarExpression, durationMs = 3600) {
  state.expression = expression
  if (expressionTimer)
    clearTimeout(expressionTimer)

  expressionTimer = setTimeout(() => {
    state.expression = 'neutral'
  }, durationMs)
}

function initializeConversationSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.sending.value, (sending) => {
    if (sending) {
      state.expression = 'think'
      if (expressionTimer)
        clearTimeout(expressionTimer)
    }
  }, { immediate: true })

  watch(() => conversation.latestAssistantMessage.value?.id, () => {
    const message = conversation.latestAssistantMessage.value
    if (!message?.content)
      return

    setExpression(detectAvatarExpression(message.content))
  }, { immediate: true })
}

function handleLoadStart() {
  state.loadingState = 'loading'
  state.loadProgress = 0
  state.error = null
}

function handleLoadProgress(value: number) {
  state.loadingState = 'loading'
  state.loadProgress = value
}

function handleLoadFinish() {
  state.loadingState = 'ready'
  state.loadProgress = 100
  state.error = null
}

function handleLoadError(error: unknown) {
  state.loadingState = 'error'
  state.error = error instanceof Error ? error.message : 'Unable to load the avatar runtime.'
}

export function useAvatarPresence() {
  initializeConversationSync()

  return {
    modelUrl: computed(() => appConfig.avatarModelUrl || null),
    ambientAnimation: computed(() => BREATH_URL),
    expression: computed(() => state.expression),
    speaking: computed(() => speech.speaking.value),
    mouthOpenSize: computed(() => speech.mouthOpenSize.value),
    loadingState: computed(() => state.loadingState),
    loadProgress: computed(() => state.loadProgress),
    error: computed(() => state.error),
    handleLoadStart,
    handleLoadProgress,
    handleLoadFinish,
    handleLoadError,
  }
}
