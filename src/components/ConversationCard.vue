<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import ConversationMessageItem from '@/components/ConversationMessageItem.vue'
import CommandGuideOverlay from '@/components/layout/CommandGuideOverlay.vue'
import { useEmoteDebugStore } from '@/modules/avatar/emoteDebug'
import { useAvatarPresence } from '@/modules/avatar/presence'
import { useConversationComposer } from '@/modules/conversation/composer'
import { EXAMPLE_PROMPTS } from '@/modules/conversation/examples'
import { useConversationState } from '@/modules/conversation/state'
import { useHearingPipeline } from '@/modules/hearing/pipeline'
import { useSpeechRuntime } from '@/modules/speech/runtime'
import { useWalletSession } from '@/modules/wallet/session'

const EMOTE_INDICATOR_COLORS: Record<string, string> = {
  happy: '#4ade80',
  sad: '#60a5fa',
  angry: '#f87171',
  surprised: '#facc15',
  think: '#c084fc',
  neutral: '#94a3b8',
}

const conversation = useConversationState()
const composerState = useConversationComposer()
const emoteDebugStore = useEmoteDebugStore()
const avatar = useAvatarPresence()
const hearing = useHearingPipeline()
const speech = useSpeechRuntime()
const wallet = useWalletSession()
const composer = composerState.draft
const messagesRef = ref<HTMLElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const exampleGuideOpen = ref(false)
const COMPOSER_MIN_HEIGHT = 56
const COMPOSER_MAX_HEIGHT = 112
let scrollAnimationFrame = 0
let pendingBottomSettle = false

const emoteIndicatorColor = computed(() =>
  EMOTE_INDICATOR_COLORS[emoteDebugStore.lastReceived.value?.name ?? 'neutral'] ?? '#94a3b8',
)

function syncComposerHeight() {
  nextTick(() => {
    const field = composerRef.value
    if (!field)
      return

    field.style.height = 'auto'
    const nextHeight = Math.max(COMPOSER_MIN_HEIGHT, Math.min(COMPOSER_MAX_HEIGHT, field.scrollHeight))
    field.style.height = `${nextHeight}px`
    field.style.overflowY = field.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  })
}

function handleSelectExample(prompt: string) {
  composerState.applyExample(prompt)
  exampleGuideOpen.value = false
}

function scrollToBottom() {
  nextTick(() => {
    const host = messagesRef.value
    if (!host)
      return
    host.scrollTop = host.scrollHeight
  })
}

function stopScrollAnimation() {
  if (!scrollAnimationFrame)
    return

  window.cancelAnimationFrame(scrollAnimationFrame)
  scrollAnimationFrame = 0
}

function resolveMessageElement(messageId: string) {
  const host = messagesRef.value
  if (!host)
    return null

  const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(messageId)
    : messageId.replace(/"/g, '\\"')
  return host.querySelector<HTMLElement>(`[data-message-id="${escapedId}"]`)
}

function animateHistoryScroll(targetTop: number, durationMs: number, onComplete?: () => void) {
  nextTick(() => {
    const host = messagesRef.value
    if (!host)
      return

    stopScrollAnimation()
    const maxScrollTop = Math.max(0, host.scrollHeight - host.clientHeight)
    const clampedTarget = Math.max(0, Math.min(targetTop, maxScrollTop))
    const startTop = host.scrollTop
    const travel = clampedTarget - startTop
    if (Math.abs(travel) < 2) {
      host.scrollTop = clampedTarget
      onComplete?.()
      return
    }

    const startedAt = performance.now()
    const step = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.min(1, elapsed / durationMs)
      const eased = 1 - (1 - progress) ** 3
      host.scrollTop = startTop + travel * eased

      if (progress >= 1) {
        scrollAnimationFrame = 0
        onComplete?.()
        return
      }

      scrollAnimationFrame = window.requestAnimationFrame(step)
    }

    scrollAnimationFrame = window.requestAnimationFrame(step)
  })
}

function settleProposalReveal() {
  animateHistoryScroll(Number.MAX_SAFE_INTEGER, 680)
}

function queueProposalSettle() {
  if (scrollAnimationFrame) {
    pendingBottomSettle = true
    return
  }

  settleProposalReveal()
}

function revealAssistantMessage(messageId: string) {
  nextTick(() => {
    const host = messagesRef.value
    const messageElement = resolveMessageElement(messageId)
    if (!host || !messageElement)
      return

    const hostRect = host.getBoundingClientRect()
    const messageRect = messageElement.getBoundingClientRect()
    const messageTop = messageRect.top - hostRect.top + host.scrollTop
    const messageBottom = messageRect.bottom - hostRect.top + host.scrollTop
    const topTarget = Math.max(0, messageTop - 10)
    const bottomTarget = Math.max(topTarget, messageBottom - host.clientHeight + 14)

    if (bottomTarget - topTarget < Math.max(48, host.clientHeight * 0.18)) {
      host.scrollTop = Math.max(0, host.scrollHeight - host.clientHeight)
      return
    }

    host.scrollTop = topTarget
    animateHistoryScroll(bottomTarget, 3000, () => {
      if (!pendingBottomSettle)
        return

      pendingBottomSettle = false
      settleProposalReveal()
    })
  })
}

async function handleSubmit() {
  const text = composer.value.trim()
  if (!text)
    return

  avatar.triggerInteractionGesture('prompt-send')
  composerState.clearDraft()
  syncComposerHeight()
  await conversation.sendMessage(text)
}

async function handleSendTranscript() {
  avatar.triggerInteractionGesture('prompt-send')
  await hearing.flushTranscript(true)
}

function handleResetConversation() {
  avatar.triggerInteractionGesture('reset')
  conversation.resetConversation()
}

function handleStopSpeech() {
  speech.stop()
}

async function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey)
    return

  event.preventDefault()
  if (composer.value.trim())
    await handleSubmit()
}

watch(() => wallet.sessionIdentity.value, (identity) => {
  conversation.hydrateForIdentity(identity)
  stopScrollAnimation()
  scrollToBottom()
}, { immediate: true })

watch(() => conversation.messages.value.at(-1)?.id, (messageId, previousMessageId) => {
  if (!messageId || messageId === previousMessageId) {
    scrollToBottom()
    return
  }

  if (!previousMessageId) {
    scrollToBottom()
    return
  }

  const latestMessage = conversation.messages.value.at(-1)
  if (latestMessage?.role === 'assistant') {
    pendingBottomSettle = false
    revealAssistantMessage(messageId)
    return
  }

  stopScrollAnimation()
  scrollToBottom()
}, { immediate: true })

watch(() => conversation.pendingMessage.value?.statusNote, (statusNote) => {
  if (statusNote)
    scrollToBottom()
})

watch(
  () => {
    const message = conversation.latestAssistantMessage.value
    if (!message)
      return ''

    return `${message.id}:${Number(Boolean(message.proposalPending))}:${Number(Boolean(message.proposal))}`
  },
  (signature, previousSignature) => {
    if (!signature || !previousSignature || signature === previousSignature)
      return

    const [messageId, pendingFlag, proposalFlag] = signature.split(':')
    const [previousMessageId, previousPendingFlag, previousProposalFlag] = previousSignature.split(':')
    if (messageId !== previousMessageId)
      return

    const proposalAttached = previousProposalFlag === '0' && proposalFlag === '1'
    const proposalResolved = previousPendingFlag === '1' && pendingFlag === '0'
    if (proposalAttached || proposalResolved)
      queueProposalSettle()
  },
)

watch(composer, () => {
  syncComposerHeight()
})

watch(() => composerState.focusToken.value, () => {
  nextTick(() => {
    composerRef.value?.focus()
    const length = composer.value.length
    composerRef.value?.setSelectionRange(length, length)
  })
})

onMounted(() => {
  scrollToBottom()
  syncComposerHeight()
})

onBeforeUnmount(() => {
  stopScrollAnimation()
})
</script>

<template>
  <div class="conversation-shell-wrap">
    <section class="conversation-shell">
      <div v-if="conversation.sending.value" class="conversation-shell__scan">
        <div class="conversation-shell__scan-bar" />
      </div>

      <div ref="messagesRef" class="conversation-shell__history">
        <ConversationMessageItem v-for="message in conversation.messages.value" :key="message.id" :message="message" />
        <ConversationMessageItem v-if="conversation.pendingMessage.value" :message="conversation.pendingMessage.value" />

        <p v-if="!conversation.messages.value.length" class="conversation-shell__empty">
          AIR3 is ready. Wallet identity, conversation session and market context are attached to the stage runtime.
        </p>
      </div>

      <p v-if="conversation.error.value" class="conversation-shell__error">
        {{ conversation.error.value }}
      </p>

      <div v-if="hearing.supported.value && (hearing.committedTranscript.value || hearing.interimTranscript.value)" class="conversation-shell__transcript">
        <div class="conversation-shell__transcript-head">
          <span>Voice transcript</span>
          <span>{{ Math.round(hearing.volumeLevel.value * 100) }}%</span>
        </div>
        <p>
          <span>{{ hearing.committedTranscript.value }}</span>
          <span class="conversation-shell__transcript-interim">{{ hearing.interimTranscript.value }}</span>
        </p>
        <div class="conversation-shell__transcript-actions">
          <label class="conversation-shell__toggle">
            <input
              :checked="hearing.autoSendEnabled.value"
              type="checkbox"
              @change="hearing.setAutoSendEnabled(($event.target as HTMLInputElement).checked)"
            >
            Auto-send voice
          </label>

          <select
            class="conversation-shell__select"
            :value="hearing.selectedInputId.value"
            @change="hearing.setSelectedInput(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="input in hearing.availableInputs.value" :key="input.deviceId" :value="input.deviceId">
              {{ input.label || `Microphone ${input.deviceId.slice(0, 6)}` }}
            </option>
          </select>

          <button
            v-if="!hearing.autoSendEnabled.value && hearing.committedTranscript.value"
            class="conversation-shell__secondary"
            type="button"
            @click="handleSendTranscript"
          >
            Send transcript
          </button>
        </div>
      </div>

      <form class="conversation-shell__composer" @submit.prevent="handleSubmit">
        <textarea
          ref="composerRef"
          v-model="composer"
          class="conversation-shell__textarea"
          rows="2"
          placeholder="Ask for chart context, analysis or a Pacifica-ready trade setup."
          @keydown="handleComposerKeydown"
        />

        <div class="conversation-shell__composer-bar">
          <div class="conversation-shell__left-actions">
            <button
              v-if="speech.speaking.value"
              class="conversation-shell__control conversation-shell__control--stop"
              type="button"
              @click="handleStopSpeech"
            >
              Stop speech
            </button>

            <div class="conversation-shell__emotion-indicator" title="Last emotion token received">
              <span class="conversation-shell__emotion-dot" :style="{ backgroundColor: emoteIndicatorColor }" />
              <span>{{ emoteDebugStore.lastReceived.value?.name ?? '—' }}</span>
            </div>

            <button
              :class="['conversation-shell__icon-button', hearing.listening.value ? 'conversation-shell__icon-button--active' : '']"
              type="button"
              :title="hearing.listening.value ? 'Stop microphone' : 'Start microphone'"
              @click="hearing.toggleListening()"
            >
              <span v-if="hearing.listening.value" class="conversation-shell__mic-level">
                <span :style="{ transform: `scaleY(${Math.max(0.18, hearing.volumeLevel.value)})` }" />
              </span>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
                <path d="M19 10a7 7 0 0 1-14 0" />
                <path d="M12 17v4" />
                <path d="M8 21h8" />
              </svg>
            </button>
          </div>

          <div class="conversation-shell__right-actions">
            <button class="conversation-shell__ghost conversation-shell__ghost--example" type="button" @click="exampleGuideOpen = true">
              Example
            </button>
            <button class="conversation-shell__send" :disabled="conversation.sending.value || !composer.trim()" type="submit">
              {{ conversation.sending.value ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </div>
      </form>
    </section>

    <button
      class="conversation-shell__reset-fab"
      :disabled="conversation.sending.value"
      type="button"
      title="Reset conversation"
      aria-label="Reset conversation"
      @click="handleResetConversation"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9.5 3h5l1 2H8.5l1-2Z" />
        <path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    </button>
  </div>

  <CommandGuideOverlay
    :open="exampleGuideOpen"
    :prompts="EXAMPLE_PROMPTS"
    :show-mention-note="false"
    @close="exampleGuideOpen = false"
    @select="handleSelectExample"
  />
</template>

<style scoped>
.conversation-shell-wrap {
  position: relative;
  height: 100%;
  min-height: 0;
}

.conversation-shell {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 2px solid rgba(125, 211, 252, 0.16);
  border-radius: 20px;
  background: rgba(6, 22, 34, 0.72);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.conversation-shell__scan {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 4px;
  overflow: hidden;
  background: rgba(91, 214, 255, 0.14);
}

.conversation-shell__scan-bar {
  width: 32%;
  height: 100%;
  background: #5bd6ff;
  transform-origin: left center;
  animation: conversation-shell-scan 2s linear infinite;
}

.conversation-shell__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(8, 23, 35, 0.68);
  color: var(--text-1);
  font-size: 0.78rem;
}

.conversation-shell__toggle input {
  accent-color: #5bd6ff;
}

.conversation-shell__ghost,
.conversation-shell__secondary,
.conversation-shell__send,
.conversation-shell__control,
.conversation-shell__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(138, 218, 255, 0.14);
}

.conversation-shell__ghost,
.conversation-shell__secondary,
.conversation-shell__control {
  padding: 0 12px;
  background: rgba(8, 23, 35, 0.76);
}

.conversation-shell__history {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 16px 16px 0;
}

.conversation-shell__empty {
  margin: auto 0;
  color: rgba(223, 236, 247, 0.6);
  line-height: 1.65;
}

.conversation-shell__error {
  margin: 0;
  padding: 0 16px;
  color: #ffb2bb;
}

.conversation-shell__transcript {
  display: grid;
  gap: 8px;
  margin: 0 16px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.1);
  background: rgba(9, 27, 40, 0.42);
}

.conversation-shell__transcript-head,
.conversation-shell__transcript-actions,
.conversation-shell__composer-bar,
.conversation-shell__left-actions,
.conversation-shell__right-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.conversation-shell__transcript-head {
  color: rgba(186, 230, 253, 0.72);
  font-size: 0.76rem;
}

.conversation-shell__transcript p {
  margin: 0;
  color: var(--text-1);
  line-height: 1.5;
}

.conversation-shell__transcript-interim {
  color: rgba(208, 226, 239, 0.56);
}

.conversation-shell__select {
  flex: 1;
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(7, 18, 30, 0.62);
  padding: 0 10px;
}

.conversation-shell__composer {
  display: grid;
  gap: 10px;
  padding: 0 16px 6px;
}

.conversation-shell__textarea {
  width: 100%;
  min-height: 56px;
  max-height: 112px;
  border: 0;
  border-radius: 18px 18px 0 0;
  background: rgba(17, 42, 60, 0.28);
  color: var(--text-0);
  padding: 12px 14px 14px;
  resize: none;
  outline: none;
}

.conversation-shell__composer-bar {
  margin-top: 0;
  padding-inline: 10px;
  min-height: 34px;
}

.conversation-shell__left-actions,
.conversation-shell__right-actions {
  flex-wrap: wrap;
}

.conversation-shell__control--stop {
  color: #f5fbff;
}

.conversation-shell__emotion-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(8, 23, 35, 0.76);
  color: var(--text-1);
  font-size: 0.76rem;
  font-weight: 600;
}

.conversation-shell__emotion-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.conversation-shell__icon-button {
  width: 34px;
  padding: 0;
  background: rgba(8, 23, 35, 0.76);
}

.conversation-shell__icon-button--active {
  border-color: rgba(91, 214, 255, 0.26);
  background: rgba(15, 46, 63, 0.84);
}

.conversation-shell__icon-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.conversation-shell__mic-level {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  width: 10px;
  height: 16px;
}

.conversation-shell__mic-level span {
  width: 4px;
  height: 100%;
  border-radius: 999px;
  background: #74efff;
  transform-origin: center bottom;
}

.conversation-shell__send {
  padding: 0 14px;
  background: #5bd6ff;
  color: #04111c;
  font-weight: 700;
}

.conversation-shell__ghost--example {
  color: rgba(223, 236, 247, 0.84);
  font-size: 0.74rem;
  font-weight: 600;
}

.conversation-shell__reset-fab {
  position: absolute;
  right: 18px;
  bottom: -66px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(8, 23, 35, 0.92);
  color: rgba(223, 236, 247, 0.84);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(18px);
}

.conversation-shell__reset-fab svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.conversation-shell__reset-fab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@keyframes conversation-shell-scan {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

@media (max-width: 980px) {
  .conversation-shell {
    min-height: 720px;
  }

  .conversation-shell__reset-fab {
    bottom: -62px;
  }
}

@media (max-width: 720px) {
  .conversation-shell__transcript-actions,
  .conversation-shell__composer-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .conversation-shell__right-actions {
    justify-content: space-between;
  }
}
</style>
