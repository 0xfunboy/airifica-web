<script setup lang="ts">
import { computed } from 'vue'

import TradeProposalCard from '@/components/TradeProposalCard.vue'

import type { ConversationMessage } from '@/modules/conversation/types'

const props = defineProps<{
  message: ConversationMessage
}>()

const chartImageUrl = computed(() => {
  const image = props.message.image
  if (!image)
    return null

  return image.startsWith('data:')
    ? image
    : `data:image/png;base64,${image}`
})
</script>

<template>
  <article
    :class="[
      'conversation-message',
      `conversation-message--${message.role}`,
    ]"
  >
    <header class="conversation-message__header">
      <span>{{ message.role }}</span>
      <strong>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</strong>
    </header>

    <p>{{ message.content }}</p>

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
  </article>
</template>

<style scoped>
.conversation-message {
  display: grid;
  gap: 10px;
  max-width: calc(100% - 20px);
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

.conversation-message p {
  margin: 0;
  color: var(--text-1);
  line-height: 1.58;
}

.conversation-message--assistant {
  margin-right: 18px;
  background: linear-gradient(180deg, rgba(8, 24, 36, 0.82), rgba(6, 17, 28, 0.78));
}

.conversation-message--user {
  margin-left: 18px;
  background: linear-gradient(180deg, rgba(11, 38, 56, 0.84), rgba(8, 23, 35, 0.82));
}

.conversation-message--system {
  max-width: 100%;
  background: rgba(55, 21, 30, 0.54);
  border-color: rgba(255, 143, 155, 0.14);
}

.conversation-message__proposal-state {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.18em;
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
  .conversation-message--assistant,
  .conversation-message--user {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }
}
</style>
