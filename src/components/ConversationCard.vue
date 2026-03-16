<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import { useConversationState } from '@/modules/conversation/state'
import { useWalletSession } from '@/modules/wallet/session'

const conversation = useConversationState()
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
        <h2>AIR3 chat flow</h2>
      </div>
      <div class="conversation-card__meta">
        <span>{{ conversation.conversationId.value || 'new session' }}</span>
        <button class="conversation-card__reset" :disabled="conversation.sending.value" @click="conversation.resetConversation()">
          Reset
        </button>
      </div>
    </div>

    <div ref="messagesRef" class="conversation-card__messages">
      <article
        v-for="message in conversation.messages.value"
        :key="message.id"
        :class="[
          'conversation-card__message',
          `conversation-card__message--${message.role}`,
        ]"
      >
        <header>
          <span>{{ message.role }}</span>
          <strong>{{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</strong>
        </header>
        <p>{{ message.content }}</p>
        <div v-if="message.proposal || message.proposalPending" class="conversation-card__proposal">
          <span>{{ message.proposalPending ? 'Proposal pending' : 'Trade setup ready' }}</span>
          <strong v-if="message.proposal">
            {{ message.proposal.symbol }} · {{ message.proposal.side }} · {{ message.proposal.timeframe }}
          </strong>
        </div>
      </article>

      <p v-if="!conversation.messages.value.length" class="conversation-card__empty">
        Start the AIR3 conversation. The current session identity is already attached to every request.
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
        placeholder="Ask for chart context, analysis or a Pacifica-ready market setup."
      />
      <button class="conversation-card__send" :disabled="conversation.sending.value || !composer.trim()">
        {{ conversation.sending.value ? 'Sending...' : 'Send to AIR3' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.conversation-card {
  padding: 22px;
  display: grid;
  gap: 18px;
}

.conversation-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.conversation-card__header h2 {
  margin: 12px 0 0;
  font-size: 1.22rem;
}

.conversation-card__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  font-size: 12px;
}

.conversation-card__reset {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
}

.conversation-card__messages {
  display: grid;
  gap: 12px;
  max-height: 420px;
  overflow: auto;
  padding-right: 4px;
}

.conversation-card__message {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.1);
}

.conversation-card__message header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.conversation-card__message header span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.conversation-card__message p,
.conversation-card__empty,
.conversation-card__error {
  margin: 0;
  line-height: 1.6;
}

.conversation-card__message--user {
  background: rgba(10, 30, 46, 0.76);
}

.conversation-card__message--assistant {
  background: rgba(8, 20, 33, 0.62);
}

.conversation-card__message--system {
  background: rgba(56, 22, 30, 0.52);
  border-color: rgba(255, 143, 155, 0.16);
}

.conversation-card__proposal {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(91, 214, 255, 0.08);
}

.conversation-card__proposal span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.conversation-card__error {
  color: #ffc3cb;
}

.conversation-card__composer {
  display: grid;
  gap: 10px;
}

.conversation-card__textarea {
  resize: vertical;
  min-height: 108px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(8, 20, 33, 0.62);
  padding: 14px;
  outline: none;
}

.conversation-card__send {
  justify-self: flex-end;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(135deg, #5bd6ff, #2eaad7);
  color: #03111b;
}

.conversation-card__send:disabled,
.conversation-card__reset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .conversation-card__header {
    flex-direction: column;
  }

  .conversation-card__meta {
    flex-wrap: wrap;
  }

  .conversation-card__send {
    width: 100%;
  }
}
</style>
