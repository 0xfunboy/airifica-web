<script setup lang="ts">
import { computed } from 'vue'

import TradeProposalCard from '@/components/TradeProposalCard.vue'
import { appConfig } from '@/config/app'

import type { ConversationMessage } from '@/modules/conversation/types'

const props = defineProps<{
  message: ConversationMessage
}>()

const chartImageUrl = computed(() => {
  const image = props.message.image
  if (!image)
    return null

  return /^(data:|https?:|blob:|\/)/.test(image)
    ? image
    : `data:image/png;base64,${image}`
})

const speakerLabel = computed(() => {
  if (props.message.role === 'assistant')
    return appConfig.brandName.toLowerCase()
  if (props.message.role === 'user')
    return 'you'
  return 'system'
})

const normalizedContent = computed(() => {
  const text = props.message.content || ''
  if (!text)
    return ''

  return text
    .replace(/\r\n/g, '\n')
    .replace(/```/g, '')
    .replace(/[*`]/g, '')
    .replace(/(^|[\s([{])_+|_+(?=[\s)\]},.!?:;]|$)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
})
</script>

<template>
  <article
    :class="[
      'conversation-message',
      `conversation-message--${message.role}`,
    ]"
  >
    <div class="conversation-message__bubble">
      <header class="conversation-message__header">
        <span>{{ speakerLabel }}</span>
        <strong>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</strong>
      </header>

      <div v-if="normalizedContent" class="conversation-message__body">
        {{ normalizedContent }}
      </div>

      <div v-else-if="message.pending" class="conversation-message__loader" aria-label="Awaiting reply">
        <span />
        <span />
        <span />
      </div>

      <img
        v-if="chartImageUrl"
        :src="chartImageUrl"
        alt="AIR3 chart"
        class="conversation-message__chart"
      >

      <div v-if="message.proposalPending && !message.proposal" class="conversation-message__proposal-state">
        Proposal follow-up in progress.
      </div>

      <TradeProposalCard
        v-if="message.proposal"
        :proposal="message.proposal"
        :conversation-id="message.conversationId"
        :message-id="message.id"
        :created-at="message.createdAt"
      />
    </div>

    <p v-if="message.pending && message.statusNote" class="conversation-message__activity">
      {{ message.statusNote }}
    </p>
  </article>
</template>

<style scoped>
.conversation-message {
  display: grid;
  gap: 8px;
  max-width: calc(100% - 20px);
}

.conversation-message__bubble {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(138, 218, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.conversation-message__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.conversation-message__header span {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.conversation-message__header strong {
  color: rgba(220, 234, 245, 0.7);
  font-size: 0.8rem;
  font-weight: 600;
}

.conversation-message__body {
  margin: 0;
  color: var(--text-1);
  white-space: pre-wrap;
  line-height: 1.72;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.conversation-message--assistant .conversation-message__bubble {
  margin-right: 18px;
  background: linear-gradient(180deg, rgba(8, 24, 36, 0.82), rgba(6, 17, 28, 0.78));
}

.conversation-message--user .conversation-message__bubble {
  margin-left: 18px;
  background: linear-gradient(180deg, rgba(11, 38, 56, 0.84), rgba(8, 23, 35, 0.82));
}

.conversation-message--system .conversation-message__bubble {
  max-width: 100%;
  background: rgba(55, 21, 30, 0.54);
  border-color: rgba(255, 143, 155, 0.14);
}

.conversation-message__loader {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.conversation-message__loader span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(120, 233, 255, 0.92);
  animation: conversation-message-loader 1.2s ease-in-out infinite;
}

.conversation-message__loader span:nth-child(2) {
  animation-delay: 0.16s;
}

.conversation-message__loader span:nth-child(3) {
  animation-delay: 0.32s;
}

.conversation-message__proposal-state {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.conversation-message__activity {
  margin: 0 14px;
  color: rgba(186, 230, 253, 0.68);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.conversation-message__chart {
  display: block;
  width: 100%;
  max-height: 320px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  border-radius: 16px;
  object-fit: cover;
  background: rgba(8, 20, 33, 0.46);
}

@media (max-width: 760px) {
  .conversation-message,
  .conversation-message--assistant .conversation-message__bubble,
  .conversation-message--user .conversation-message__bubble {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }
}

@keyframes conversation-message-loader {
  0%,
  80%,
  100% {
    transform: scale(0.68);
    opacity: 0.38;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
