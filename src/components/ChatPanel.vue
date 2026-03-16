<script setup lang="ts">
import type { WorkbenchMessage } from '../types'

import { computed, ref } from 'vue'

import ChatMessageBubble from './ChatMessageBubble.vue'

const props = defineProps<{
  messages: WorkbenchMessage[]
  busy: boolean
  error: string
  conversationId: string
}>()

const emit = defineEmits<{
  (event: 'send', message: string): void
  (event: 'reset'): void
}>()

const draft = ref('')

const helperText = computed(() => {
  if (props.busy)
    return 'AIR3 is processing the current turn.'
  if (props.error)
    return props.error
  if (props.conversationId)
    return `Conversation ${props.conversationId}`
  return 'No conversation started yet.'
})

function submit() {
  const text = draft.value.trim()
  if (!text || props.busy)
    return

  emit('send', text)
  draft.value = ''
}
</script>

<template>
  <section class="panel chat-panel">
    <header class="panel__header">
      <div>
        <p class="panel__eyebrow">
          AIR3 dialogue
        </p>
        <h2 class="panel__title">
          Operator console
        </h2>
      </div>
      <button class="button button--ghost" type="button" @click="$emit('reset')">
        Reset
      </button>
    </header>

    <p class="chat-panel__helper">
      {{ helperText }}
    </p>

    <div class="chat-stream">
      <p v-if="!messages.length" class="chat-stream__empty">
        Ask for market context, proposals or a quick summary to initialize the session.
      </p>
      <ChatMessageBubble
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
    </div>

    <div class="chat-compose">
      <label class="field">
        <span class="field__label">Message</span>
        <textarea
          v-model="draft"
          class="field__control chat-compose__textarea"
          rows="5"
          placeholder="Ask AIR3 for analysis, a trade setup or a market summary."
          @keydown.enter.exact.prevent="submit"
        />
      </label>
      <button class="button" type="button" :disabled="busy" @click="submit">
        {{ busy ? 'Sending...' : 'Send message' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.chat-panel {
  min-height: min(70vh, 58rem);
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 1rem;
}

.chat-panel__helper {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(191, 219, 254, 0.78);
}

.chat-stream {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  min-height: 18rem;
  max-height: min(46vh, 34rem);
  overflow: auto;
  padding-right: 0.35rem;
}

.chat-stream__empty {
  margin: 0;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px dashed rgba(125, 211, 252, 0.16);
  color: rgba(191, 219, 254, 0.72);
}

.chat-compose {
  display: grid;
  gap: 0.85rem;
}

.chat-compose__textarea {
  min-height: 8rem;
  resize: vertical;
}
</style>

