import { computed, reactive, watch } from 'vue'

import type { AvatarExpression } from '@airifica/avatar3d'

import { appConfig } from '@/config/app'
import { useConversationState } from '@/modules/conversation/state'

const state = reactive({
  expression: 'neutral' as AvatarExpression,
  speaking: false,
  loadingState: appConfig.avatarModelUrl ? 'idle' as 'idle' | 'loading' | 'ready' | 'error' : 'empty' as 'idle' | 'loading' | 'ready' | 'error' | 'empty',
  loadProgress: 0,
  error: null as string | null,
})

const conversation = useConversationState()
let initialized = false
let expressionTimer: ReturnType<typeof setTimeout> | undefined
let speakingTimer: ReturnType<typeof setTimeout> | undefined

function detectAvatarExpression(text: string) {
  const lowered = text.toLowerCase()
  if (/\b(error|failed|risk|drawdown|stop loss|caution|bearish)\b/.test(lowered))
    return 'sad' as const
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

function pulseSpeaking(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const duration = Math.min(Math.max(words * 120, 1400), 5200)
  state.speaking = true
  if (speakingTimer)
    clearTimeout(speakingTimer)

  speakingTimer = setTimeout(() => {
    state.speaking = false
  }, duration)
}

function initializeConversationSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.latestAssistantMessage.value?.id, () => {
    const message = conversation.latestAssistantMessage.value
    if (!message?.content)
      return

    setExpression(detectAvatarExpression(message.content))
    pulseSpeaking(message.content)
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
    expression: computed(() => state.expression),
    speaking: computed(() => state.speaking),
    loadingState: computed(() => state.loadingState),
    loadProgress: computed(() => state.loadProgress),
    error: computed(() => state.error),
    handleLoadStart,
    handleLoadProgress,
    handleLoadFinish,
    handleLoadError,
  }
}
