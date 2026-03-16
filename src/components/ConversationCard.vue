<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import ConversationMessageItem from '@/components/ConversationMessageItem.vue'
import { truncateMiddle } from '@/lib/format'
import { useConversationState } from '@/modules/conversation/state'
import { useHearingPipeline } from '@/modules/hearing/pipeline'
import { useMarketContext } from '@/modules/market/context'
import { useTradeExecutionPreferences } from '@/modules/product/execution'
import { useWalletSession } from '@/modules/wallet/session'

const conversation = useConversationState()
const hearing = useHearingPipeline()
const marketContext = useMarketContext()
const product = useTradeExecutionPreferences()
const wallet = useWalletSession()
const composer = ref('')
const messagesRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    const host = messagesRef.value
    if (!host)
      return
    host.scrollTop = host.scrollHeight
  })
}

async function handleSubmit() {
  const text = composer.value.trim()
  if (!text)
    return

  composer.value = ''
  await conversation.sendMessage(text)
  scrollToBottom()
}

async function handleSendTranscript() {
  await hearing.flushTranscript(true)
  scrollToBottom()
}

watch(() => wallet.sessionIdentity.value, (identity) => {
  conversation.hydrateForIdentity(identity)
  scrollToBottom()
}, { immediate: true })

watch(() => conversation.messages.value.length, () => {
  scrollToBottom()
})

onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <section class="panel conversation-card">
    <div class="conversation-card__header">
      <div>
        <p class="eyebrow">
          Conversation
        </p>
        <h2>AIR3 conversation</h2>
      </div>

      <div class="conversation-card__meta">
        <span class="meta-chip">{{ marketContext.currentSymbol.value }}</span>
        <span class="meta-chip">{{ truncateMiddle(conversation.conversationId.value || 'new session', 16) }}</span>
        <span v-if="hearing.supported.value" :class="['status-pill', hearing.speechDetected.value ? 'status-pill--success' : '']">
          {{ hearing.listening.value ? (hearing.speechDetected.value ? 'speech live' : 'mic open') : 'mic idle' }}
        </span>
        <label class="conversation-card__toggle">
          <input
            :checked="product.confirmBeforeTrade.value"
            type="checkbox"
            @change="product.setConfirmBeforeTrade(($event.target as HTMLInputElement).checked)"
          >
          Confirm
        </label>
        <label class="conversation-card__toggle">
          <input
            :checked="product.fullAutoMode.value"
            type="checkbox"
            @change="product.setFullAutoMode(($event.target as HTMLInputElement).checked)"
          >
          Auto
        </label>
        <label v-if="hearing.supported.value" class="conversation-card__toggle">
          <input
            :checked="hearing.autoSendEnabled.value"
            type="checkbox"
            @change="hearing.setAutoSendEnabled(($event.target as HTMLInputElement).checked)"
          >
          Auto-send voice
        </label>
        <button class="surface-button surface-button--ghost conversation-card__reset" :disabled="conversation.sending.value" type="button" @click="conversation.resetConversation()">
          Reset
        </button>
      </div>
    </div>

    <div v-if="hearing.supported.value" class="conversation-card__audio-controls">
      <select
        class="conversation-card__select"
        :value="hearing.selectedInputId.value"
        @change="hearing.setSelectedInput(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="input in hearing.availableInputs.value" :key="input.deviceId" :value="input.deviceId">
          {{ input.label || `Microphone ${input.deviceId.slice(0, 6)}` }}
        </option>
      </select>

      <button
        :class="['surface-button', hearing.listening.value ? 'surface-button--secondary' : 'surface-button--primary']"
        type="button"
        @click="hearing.toggleListening()"
      >
        {{ hearing.listening.value ? 'Stop mic' : 'Start mic' }}
      </button>
    </div>

    <div v-if="hearing.supported.value && (hearing.committedTranscript.value || hearing.interimTranscript.value)" class="conversation-card__transcript">
      <div class="conversation-card__transcript-header">
        <span class="eyebrow">Live transcript</span>
        <span class="conversation-card__level">{{ Math.round(hearing.volumeLevel.value * 100) }}%</span>
      </div>
      <p>
        <span>{{ hearing.committedTranscript.value }}</span>
        <span class="conversation-card__transcript-interim">{{ hearing.interimTranscript.value }}</span>
      </p>
      <button
        v-if="!hearing.autoSendEnabled.value && hearing.committedTranscript.value"
        class="surface-button surface-button--secondary conversation-card__transcript-send"
        type="button"
        @click="handleSendTranscript"
      >
        Send transcript
      </button>
    </div>

    <div ref="messagesRef" class="conversation-card__messages">
      <ConversationMessageItem v-for="message in conversation.messages.value" :key="message.id" :message="message" />

      <p v-if="!conversation.messages.value.length" class="conversation-card__empty">
        Start the AIR3 conversation. Wallet identity and market context are already attached to the session.
      </p>
    </div>

    <p v-if="conversation.error.value" class="conversation-card__error">
      {{ conversation.error.value }}
    </p>

    <form class="conversation-card__composer" @submit.prevent="handleSubmit">
      <textarea
        v-model="composer"
        class="conversation-card__textarea"
        rows="4"
        placeholder="Ask for chart context, analysis or a Pacifica-ready setup."
      />

      <div class="conversation-card__composer-footer">
        <span class="conversation-card__hint">
          Session {{ truncateMiddle(wallet.sessionIdentity.value, 14) }}
        </span>
        <button class="surface-button surface-button--primary conversation-card__send" :disabled="conversation.sending.value || !composer.trim()" type="submit">
          {{ conversation.sending.value ? 'Sending...' : 'Send to AIR3' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.conversation-card {
  height: 100%;
  min-height: 100%;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  gap: 14px;
  padding: 16px;
}

.conversation-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.conversation-card__header h2 {
  margin: 10px 0 0;
  font-size: 1.18rem;
  letter-spacing: -0.03em;
}

.conversation-card__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.conversation-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(8, 23, 35, 0.72);
  color: var(--text-1);
  font-size: 0.86rem;
}

.conversation-card__toggle input {
  accent-color: #5bd6ff;
}

.conversation-card__audio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conversation-card__select {
  flex: 1;
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(7, 18, 30, 0.62);
  padding: 0 12px;
}

.conversation-card__transcript {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(138, 218, 255, 0.1);
  background: rgba(8, 20, 33, 0.34);
}

.conversation-card__transcript-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.conversation-card__transcript p {
  margin: 0;
  color: var(--text-1);
  line-height: 1.55;
}

.conversation-card__transcript-interim {
  color: rgba(208, 226, 239, 0.58);
}

.conversation-card__level {
  color: var(--text-2);
  font-size: 0.82rem;
}

.conversation-card__transcript-send {
  justify-self: flex-end;
  min-height: 34px;
  padding: 0 12px;
}

.conversation-card__reset {
  min-height: 34px;
  padding: 0 12px;
}

.conversation-card__messages {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.conversation-card__empty,
.conversation-card__error {
  margin: 0;
  line-height: 1.6;
}

.conversation-card__empty {
  padding: 14px;
  border-radius: 18px;
  border: 1px dashed rgba(138, 218, 255, 0.14);
  background: rgba(8, 20, 33, 0.22);
  color: var(--text-1);
}

.conversation-card__error {
  color: #ffc9d0;
}

.conversation-card__composer {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  border: 1px solid rgba(138, 218, 255, 0.1);
  background: rgba(7, 18, 30, 0.58);
}

.conversation-card__textarea {
  resize: none;
  min-height: 110px;
  border: 0;
  border-radius: 16px;
  background: rgba(2, 12, 21, 0.82);
  padding: 14px;
  outline: none;
}

.conversation-card__composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.conversation-card__hint {
  color: var(--text-2);
  font-size: 0.85rem;
}

.conversation-card__send {
  min-height: 40px;
  padding: 0 16px;
}

@media (max-width: 1180px) {
  .conversation-card {
    min-height: 760px;
  }
}

@media (max-width: 760px) {
  .conversation-card {
    min-height: auto;
  }

  .conversation-card__header,
  .conversation-card__audio-controls,
  .conversation-card__composer-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .conversation-card__meta {
    justify-content: flex-start;
  }
}
</style>
