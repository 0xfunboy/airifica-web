import { computed, reactive, watch } from 'vue'

import type { AvatarExpression } from '@airifica/avatar3d'

import { appConfig } from '@/config/app'
import { useConversationState } from '@/modules/conversation/state'
import { useEmoteDebugStore } from '@/modules/avatar/emoteDebug'
import { useVRMAStore } from '@/modules/avatar/vrma'
import { useSpeechRuntime } from '@/modules/speech/runtime'
import { computeRiskReward } from '@/modules/trade/proposalMetrics'
import { useWalletSession } from '@/modules/wallet/session'

import type { ConversationMessage } from '@/modules/conversation/types'

type AvatarGestureKey = 'wave' | 'wave-mirror' | 'hip' | 'hip-mirror'

const state = reactive({
  detectedExpression: 'neutral' as AvatarExpression,
  loadingState: appConfig.avatarModelUrl ? 'idle' as 'idle' | 'loading' | 'ready' | 'error' : 'empty' as 'idle' | 'loading' | 'ready' | 'error' | 'empty',
  loadProgress: 0,
  error: null as string | null,
  gestureKey: null as AvatarGestureKey | null,
  gestureToken: 0,
})

const conversation = useConversationState()
const speech = useSpeechRuntime()
const vrmaStore = useVRMAStore()
const emoteDebugStore = useEmoteDebugStore()
const wallet = useWalletSession()
let initialized = false
let expressionTimer: ReturnType<typeof setTimeout> | undefined
let loadGreetingPlayed = false
const gestureAlternates = reactive({
  waveMirror: false,
  hipMirror: false,
})

function accumulateSignalScore(source: string, entries: Array<{ pattern: RegExp, weight: number }>) {
  return entries.reduce((score, entry) => score + (entry.pattern.test(source) ? entry.weight : 0), 0)
}

function detectAvatarExpression(message: ConversationMessage) {
  const source = `${message.content} ${message.proposal?.thesis || ''}`.toLowerCase()
  const action = `${message.action || ''} ${message.proposal?.sourceAction || ''}`.toUpperCase()
  const scores = {
    happy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
    think: 0,
  }

  if (message.image)
    scores.think += 0.75
  if (message.proposal)
    scores.think += 0.9
  if (/\b(CHART|ANALYSIS|PRICE|NEWS|FUNDAMENTAL)\b/.test(action))
    scores.think += 1.3

  scores.happy += accumulateSignalScore(source, [
    { pattern: /\b(bullish|confirmed|favorable|aligned|support held|upside|strong bid|continuation|opportunity)\b/, weight: 1.4 },
    { pattern: /\b(reclaim|breakout continuation|higher high|impulsive)\b/, weight: 1.2 },
  ])

  scores.sad += accumulateSignalScore(source, [
    { pattern: /\b(bearish|risk|drawdown|caution|stop loss|rejection|weakness|invalidated|downside)\b/, weight: 1.5 },
    { pattern: /\b(failed|breakdown|fade|under pressure|fragile)\b/, weight: 1.15 },
  ])

  scores.angry += accumulateSignalScore(source, [
    { pattern: /\b(liquidation|panic|capitulation|flush|violent|aggressive selloff|rug)\b/, weight: 1.8 },
    { pattern: /\b(crash|forced unwind|cascade)\b/, weight: 1.5 },
  ])

  scores.surprised += accumulateSignalScore(source, [
    { pattern: /\b(breakout|reversal|squeeze|spike|surge|explosive|unexpected)\b/, weight: 1.55 },
    { pattern: /\b(sudden|shock|fast move|volatile expansion)\b/, weight: 1.25 },
  ])

  scores.think += accumulateSignalScore(source, [
    { pattern: /\b(chart|context|analysis|market structure|scenario|range|levels|session|monitor|watch|headline)\b/, weight: 1.1 },
    { pattern: /\b(flow|liquidity|rotation|confluence|structure|execution|risk reward)\b/, weight: 0.9 },
  ])

  if (message.proposal) {
    const rr = computeRiskReward(message.proposal)
    if (rr >= 2)
      scores.happy += 0.7
    else if (rr < 1)
      scores.sad += 0.8
    else
      scores.think += 0.35
  }

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]) as Array<[Exclude<AvatarExpression, 'neutral'>, number]>
  const [topEmotion, topScore] = ranked[0]
  const secondScore = ranked[1]?.[1] ?? 0

  if (topScore < 1.2)
    return 'neutral' as const
  if (topScore - secondScore < 0.35 && scores.think >= topScore - 0.2)
    return 'think' as const

  return topEmotion
}

function setExpression(expression: AvatarExpression, durationMs = 7200) {
  state.detectedExpression = expression
  if (expressionTimer)
    clearTimeout(expressionTimer)

  expressionTimer = setTimeout(() => {
    state.detectedExpression = 'neutral'
  }, durationMs)
}

function triggerGesture(key: AvatarGestureKey) {
  state.gestureKey = key
  state.gestureToken += 1
}

function triggerGestureFamily(family: 'wave' | 'hip', force?: 'base' | 'mirror') {
  if (force === 'base') {
    triggerGesture(family)
    return
  }

  if (force === 'mirror') {
    triggerGesture(`${family}-mirror` as AvatarGestureKey)
    return
  }

  if (family === 'wave') {
    gestureAlternates.waveMirror = !gestureAlternates.waveMirror
    triggerGesture(gestureAlternates.waveMirror ? 'wave-mirror' : 'wave')
    return
  }

  gestureAlternates.hipMirror = !gestureAlternates.hipMirror
  triggerGesture(gestureAlternates.hipMirror ? 'hip-mirror' : 'hip')
}

function triggerInteractionGesture(reason: 'stage-ready' | 'login' | 'prompt-send' | 'avatar-click' | 'footer-toggle' | 'reset' | 'speech-end' | 'speech-stop') {
  if (reason === 'stage-ready')
    return triggerGestureFamily('wave', 'base')
  if (reason === 'login')
    return triggerGestureFamily('wave', 'base')
  if (reason === 'prompt-send')
    return triggerGestureFamily('wave')
  if (reason === 'speech-end' || reason === 'speech-stop')
    return triggerGestureFamily('hip')

  triggerGestureFamily('hip')
}

function initializeConversationSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.sending.value, (sending) => {
    if (sending) {
      if (expressionTimer)
        clearTimeout(expressionTimer)
    }
  }, { immediate: true })

  watch(() => conversation.latestAssistantMessage.value?.id, () => {
    const message = conversation.latestAssistantMessage.value
    if (!message?.content)
      return

    const nextExpression = detectAvatarExpression(message)
    if (nextExpression !== 'neutral')
      emoteDebugStore.notifyReceived(nextExpression)
    setExpression(nextExpression)
  }, { immediate: true })

  watch(() => wallet.isAuthenticated.value, (authenticated, previousValue) => {
    if (authenticated && !previousValue)
      triggerInteractionGesture('login')
  }, { immediate: true })

  watch(() => speech.responseCompleteRevision.value, () => {
    triggerInteractionGesture('speech-end')
  })

  watch(() => speech.stopRevision.value, () => {
    if (speech.lastStopReason.value === 'manual-stop')
      triggerInteractionGesture('speech-stop')
  })
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
  if (!loadGreetingPlayed) {
    loadGreetingPlayed = true
    triggerInteractionGesture('stage-ready')
  }
}

function handleLoadError(error: unknown) {
  state.loadingState = 'error'
  state.error = error instanceof Error ? error.message : 'Unable to load the avatar runtime.'
}

export function useAvatarPresence() {
  initializeConversationSync()

  const expression = computed<AvatarExpression>(() => {
    if (emoteDebugStore.testEmotion.value !== 'none')
      return emoteDebugStore.testEmotion.value
    if (conversation.sending.value)
      return 'think'
    return state.detectedExpression
  })

  return {
    modelUrl: computed(() => appConfig.avatarModelUrl || null),
    ambientAnimation: computed(() => vrmaStore.selectedVRMAUrl.value),
    expression,
    speaking: computed(() => speech.speaking.value),
    mouthOpenSize: computed(() => speech.mouthOpenSize.value),
    mouthClosure: computed(() => speech.mouthClosure.value),
    visemeWeights: computed(() => speech.visemeWeights.value),
    gestureKey: computed(() => state.gestureKey),
    gestureToken: computed(() => state.gestureToken),
    loadingState: computed(() => state.loadingState),
    loadProgress: computed(() => state.loadProgress),
    error: computed(() => state.error),
    triggerInteractionGesture,
    handleLoadStart,
    handleLoadProgress,
    handleLoadFinish,
    handleLoadError,
  }
}
