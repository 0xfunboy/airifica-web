import { computed, reactive, watch } from 'vue'

import type { AvatarExpression } from '@airifica/avatar3d'

import { appConfig } from '@/config/app'
import { useAvatarModelStore } from '@/modules/avatar/model'
import { useConversationState } from '@/modules/conversation/state'
import { useEmoteDebugStore } from '@/modules/avatar/emoteDebug'
import { useVRMAStore } from '@/modules/avatar/vrma'
import { useSpeechRuntime } from '@/modules/speech/runtime'
import { computeRiskReward } from '@/modules/trade/proposalMetrics'
import { useWalletSession } from '@/modules/wallet/session'

import type { ConversationMessage } from '@/modules/conversation/types'

type AvatarGestureKey = 'wave' | 'wave-mirror' | 'hip' | 'hip-mirror'

const state = reactive({
  transientExpression: 'neutral' as AvatarExpression,
  transientIntensity: 0,
  speechExpression: 'neutral' as AvatarExpression,
  speechIntensity: 0,
  loadingState: appConfig.avatarModelUrl ? 'idle' as 'idle' | 'loading' | 'ready' | 'error' : 'empty' as 'idle' | 'loading' | 'ready' | 'error' | 'empty',
  loadProgress: 0,
  error: null as string | null,
  gestureKey: null as AvatarGestureKey | null,
  gestureToken: 0,
})

const conversation = useConversationState()
const speech = useSpeechRuntime()
const vrmaStore = useVRMAStore()
const avatarModelStore = useAvatarModelStore()
const emoteDebugStore = useEmoteDebugStore()
const wallet = useWalletSession()
let initialized = false
let expressionPeakTimer: ReturnType<typeof setTimeout> | undefined
let expressionTailTimer: ReturnType<typeof setTimeout> | undefined
let loadGreetingPlayed = false
const gestureAlternates = reactive({
  waveMirror: false,
  hipMirror: false,
})

type ExpressionProfile = {
  expression: AvatarExpression
  peakIntensity: number
  sustainIntensity: number
  peakMs: number
  tailMs: number
  sustainWhileSpeaking?: boolean
}

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
    { pattern: /\b(happy|glad|joy|joyful|delighted|smile|smiling|cheerful|felice|contenta|contento|sorrid)\b/, weight: 1.55 },
  ])

  scores.sad += accumulateSignalScore(source, [
    { pattern: /\b(bearish|risk|drawdown|caution|stop loss|rejection|weakness|invalidated|downside)\b/, weight: 1.5 },
    { pattern: /\b(failed|breakdown|fade|under pressure|fragile)\b/, weight: 1.15 },
    { pattern: /\b(sad|unhappy|disappointed|hurt|down|triste|giu|demoralized)\b/, weight: 1.4 },
  ])

  scores.angry += accumulateSignalScore(source, [
    { pattern: /\b(liquidation|panic|capitulation|flush|violent|aggressive selloff|rug)\b/, weight: 1.8 },
    { pattern: /\b(crash|forced unwind|cascade)\b/, weight: 1.5 },
    { pattern: /\b(angry|mad|furious|annoyed|upset|arrabbiat|nervos)\b/, weight: 1.45 },
  ])

  scores.surprised += accumulateSignalScore(source, [
    { pattern: /\b(breakout|reversal|squeeze|spike|surge|explosive|unexpected)\b/, weight: 1.55 },
    { pattern: /\b(sudden|shock|fast move|volatile expansion)\b/, weight: 1.25 },
    { pattern: /\b(surprised|wow|shocked|impressed|stunned|sorpres)\b/, weight: 1.4 },
  ])

  scores.think += accumulateSignalScore(source, [
    { pattern: /\b(chart|context|analysis|market structure|scenario|range|levels|session|monitor|watch|headline)\b/, weight: 1.1 },
    { pattern: /\b(flow|liquidity|rotation|confluence|structure|execution|risk reward)\b/, weight: 0.9 },
    { pattern: /\b(think|thinking|ponder|consider|considering|reflect|reason|pondering|pensi|pensare|riflett)\b/, weight: 1.1 },
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

function detectPromptEmotionRequest(content: string): AvatarExpression {
  const source = content.toLowerCase()
  if (/\b(smile|smiling|grin|be happy|look happy|sorrid|felice)\b/.test(source))
    return 'happy'
  if (/\b(sad|triste|be sad|look sad)\b/.test(source))
    return 'sad'
  if (/\b(angry|mad|arrabbiat|furious)\b/.test(source))
    return 'angry'
  if (/\b(surpris|shock|wow)\b/.test(source))
    return 'surprised'
  if (/\b(think|ponder|reflect|pens)\b/.test(source))
    return 'think'
  return 'neutral'
}

function clearExpressionTimers() {
  if (expressionPeakTimer)
    clearTimeout(expressionPeakTimer)
  if (expressionTailTimer)
    clearTimeout(expressionTailTimer)
  expressionPeakTimer = undefined
  expressionTailTimer = undefined
}

function clearSpeechExpression() {
  state.speechExpression = 'neutral'
  state.speechIntensity = 0
}

function applyTransientExpression(profile: ExpressionProfile) {
  clearExpressionTimers()
  state.transientExpression = profile.expression
  state.transientIntensity = profile.peakIntensity

  expressionPeakTimer = setTimeout(() => {
    state.transientExpression = profile.expression
    state.transientIntensity = profile.sustainIntensity
  }, profile.peakMs)

  expressionTailTimer = setTimeout(() => {
    state.transientExpression = 'neutral'
    state.transientIntensity = 0
    if (!profile.sustainWhileSpeaking || !speech.speaking.value)
      clearSpeechExpression()
  }, profile.peakMs + profile.tailMs)
}

function primeSpeechExpression(expression: AvatarExpression, intensity: number) {
  state.speechExpression = expression
  state.speechIntensity = intensity
}

function resolveExpressionProfile(message: ConversationMessage, expression: AvatarExpression): ExpressionProfile {
  const source = `${message.content} ${message.proposal?.thesis || ''}`.toLowerCase()
  const directUserRequest = message.role === 'user' && detectPromptEmotionRequest(message.content) === expression
  const conversational = /\b(happy|glad|smile|smiling|felice|sorrid|sad|triste|angry|arrabbiat|surpris|wow|think|ponder|pens)\b/.test(source)

  if (expression === 'think') {
    return {
      expression,
      peakIntensity: directUserRequest ? 0.7 : 0.52,
      sustainIntensity: 0.38,
      peakMs: 700,
      tailMs: 1200,
      sustainWhileSpeaking: true,
    }
  }

  if (directUserRequest) {
    return {
      expression,
      peakIntensity: 0.92,
      sustainIntensity: 0.54,
      peakMs: 900,
      tailMs: 1500,
      sustainWhileSpeaking: true,
    }
  }

  if (conversational) {
    return {
      expression,
      peakIntensity: 0.72,
      sustainIntensity: 0.44,
      peakMs: 850,
      tailMs: 1400,
      sustainWhileSpeaking: true,
    }
  }

  return {
    expression,
    peakIntensity: 0.58,
    sustainIntensity: 0.34,
    peakMs: 680,
    tailMs: 1100,
    sustainWhileSpeaking: true,
  }
}

function triggerExpressionProfile(profile: ExpressionProfile) {
  if (profile.expression === 'neutral') {
    clearExpressionTimers()
    state.transientExpression = 'neutral'
    state.transientIntensity = 0
    clearSpeechExpression()
    return
  }

  primeSpeechExpression(profile.expression, profile.sustainIntensity)
  applyTransientExpression(profile)
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
  if (reason === 'speech-end')
    return triggerGestureFamily('wave')
  if (reason === 'speech-stop')
    return triggerGestureFamily('hip')

  triggerGestureFamily('hip')
}

function initializeConversationSync() {
  if (initialized)
    return

  initialized = true

  watch(() => conversation.sending.value, (sending) => {
    if (sending) {
      clearExpressionTimers()
      state.transientExpression = 'neutral'
      state.transientIntensity = 0
    }
  }, { immediate: true })

  watch(() => conversation.messages.value.at(-1)?.id, () => {
    const message = conversation.messages.value.at(-1)
    if (!message?.content || message.role !== 'user' || message.restored)
      return

    const requestedExpression = detectPromptEmotionRequest(message.content)
    if (requestedExpression === 'neutral')
      return

    const profile = resolveExpressionProfile(message, requestedExpression)
    emoteDebugStore.notifyReceived(requestedExpression)
    triggerExpressionProfile(profile)
  })

  watch(() => conversation.latestAssistantMessage.value?.id, () => {
    const message = conversation.latestAssistantMessage.value
    if (!message?.content)
      return

    const nextExpression = detectAvatarExpression(message)
    if (nextExpression !== 'neutral')
      emoteDebugStore.notifyReceived(nextExpression)
    triggerExpressionProfile(resolveExpressionProfile(message, nextExpression))
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

    if (state.speechExpression !== 'neutral') {
      clearExpressionTimers()
      state.transientExpression = state.speechExpression
      state.transientIntensity = Math.max(0.24, state.speechIntensity * 0.7)
      expressionTailTimer = setTimeout(() => {
        state.transientExpression = 'neutral'
        state.transientIntensity = 0
        clearSpeechExpression()
      }, 900)
    }
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
    if (state.transientExpression !== 'neutral')
      return state.transientExpression
    if (speech.speaking.value && state.speechExpression !== 'neutral')
      return state.speechExpression
    return 'neutral'
  })

  const expressionIntensity = computed(() => {
    if (emoteDebugStore.testEmotion.value !== 'none')
      return 0.72
    if (conversation.sending.value)
      return 0.42
    if (state.transientExpression !== 'neutral')
      return state.transientIntensity
    if (speech.speaking.value && state.speechExpression !== 'neutral')
      return state.speechIntensity
    return 0
  })

  return {
    modelUrl: computed(() => avatarModelStore.modelUrl.value || appConfig.avatarModelUrl || null),
    ambientAnimation: computed(() => vrmaStore.selectedVRMAUrl.value),
    expression,
    expressionIntensity,
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
