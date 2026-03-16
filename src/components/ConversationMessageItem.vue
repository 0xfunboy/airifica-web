<script setup lang="ts">
import TradeProposalCard from '@/components/TradeProposalCard.vue'

import type { ConversationMessage } from '@/modules/conversation/types'

defineProps<{
  message: ConversationMessage
}>()
</script>

<template>
  <article
    :class="[
      'conversation-message',
      `conversation-message--${message.role}`,
    ]"
  >
    <header>
      <span>{{ message.role }}</span>
      <strong>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</strong>
    </header>
    <p>{{ message.content }}</p>
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
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.1);
}

.conversation-message header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.conversation-message header span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.conversation-message p {
  margin: 0;
  line-height: 1.6;
}

.conversation-message--user {
  background: rgba(10, 30, 46, 0.76);
}

.conversation-message--assistant {
  background: rgba(8, 20, 33, 0.62);
}

.conversation-message--system {
  background: rgba(56, 22, 30, 0.52);
  border-color: rgba(255, 143, 155, 0.16);
}

.conversation-message__proposal-state {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
</style>
