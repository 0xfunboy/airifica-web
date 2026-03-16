<script setup lang="ts">
import type { WorkbenchMessage } from '../types'

import { computed } from 'vue'

import { formatClockTime } from '../utils/format'

const props = defineProps<{
  message: WorkbenchMessage
}>()

const tone = computed(() => `chat-bubble--${props.message.role}`)
</script>

<template>
  <article class="chat-bubble" :class="tone">
    <div class="chat-bubble__meta">
      <span>{{ message.role }}</span>
      <span>{{ formatClockTime(message.createdAt) }}</span>
    </div>
    <p class="chat-bubble__content">
      {{ message.content }}
    </p>

    <div v-if="message.proposal" class="proposal-card">
      <div class="proposal-card__row">
        <span>{{ message.proposal.symbol }}</span>
        <strong>{{ message.proposal.side }}</strong>
      </div>
      <div class="proposal-card__grid">
        <span>Entry {{ message.proposal.entry }}</span>
        <span>TP {{ message.proposal.tp }}</span>
        <span>SL {{ message.proposal.sl }}</span>
        <span>{{ message.proposal.timeframe }}</span>
      </div>
      <p class="proposal-card__thesis">
        {{ message.proposal.thesis }}
      </p>
    </div>

    <div v-if="message.pendingProposal" class="proposal-pending">
      Proposal extraction is still pending in this response.
    </div>
  </article>
</template>

<style scoped>
.chat-bubble {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 1.35rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.55);
}

.chat-bubble--user {
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.2), rgba(12, 74, 110, 0.24));
  border-color: rgba(56, 189, 248, 0.22);
}

.chat-bubble--assistant {
  background: rgba(15, 23, 42, 0.74);
}

.chat-bubble--system {
  background: rgba(127, 29, 29, 0.24);
  border-color: rgba(248, 113, 113, 0.22);
}

.chat-bubble__meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 0.82);
}

.chat-bubble__content {
  margin: 0;
  line-height: 1.65;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.proposal-card {
  display: grid;
  gap: 0.8rem;
  padding: 0.85rem;
  border-radius: 1rem;
  background: rgba(8, 47, 73, 0.55);
  border: 1px solid rgba(34, 211, 238, 0.16);
}

.proposal-card__row,
.proposal-card__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  justify-content: space-between;
}

.proposal-card__row {
  font-size: 0.9rem;
  color: #bae6fd;
}

.proposal-card__grid {
  font-size: 0.8rem;
  color: #cbd5e1;
}

.proposal-card__thesis {
  margin: 0;
  color: #e0f2fe;
  line-height: 1.55;
}

.proposal-pending {
  font-size: 0.8rem;
  color: #fde68a;
}
</style>

