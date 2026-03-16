<script setup lang="ts">
import type { AvatarExpression } from '@airifica/avatar3d'

import type { WorkbenchMessage, WorkbenchSettings } from './types'

import {
  Air3Client,
  extractMessageText,
  hasPendingProposal,
} from '@airifica/air3-client'
import { computed, onMounted, ref, watch } from 'vue'

import ChatPanel from './components/ChatPanel.vue'
import StagePanel from './components/StagePanel.vue'
import { useModelRegistry } from './composables/useModelRegistry'
import { usePersistentState } from './composables/usePersistentState'
import { useSpeechSynthesis } from './composables/useSpeechSynthesis'
import { detectAvatarExpression } from './utils/emotion'
import { formatBytes, formatRelativeMinutes } from './utils/format'

function createGuestIdentity() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID()

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const defaultSettings: WorkbenchSettings = {
  runtimeBaseUrl: import.meta.env.VITE_AIR3_RUNTIME_URL || '',
  serviceBaseUrl: import.meta.env.VITE_AIR3_SERVICE_URL || '',
  sessionIdentity: import.meta.env.VITE_AIR3_SESSION_IDENTITY || createGuestIdentity(),
  token: import.meta.env.VITE_AIR3_TOKEN || '',
  marketSymbol: import.meta.env.VITE_AIR3_MARKET_SYMBOL || 'BTC',
  remoteModelUrl: import.meta.env.VITE_AIR3_MODEL_URL || '',
  modelSource: 'remote',
  autoSpeak: ['1', 'true', 'yes', 'on'].includes(String(import.meta.env.VITE_AIR3_AUTO_SPEAK || '').toLowerCase()),
  preferredVoice: '',
}

const settings = usePersistentState<WorkbenchSettings>('airifica:web:settings', defaultSettings)
const messages = ref<WorkbenchMessage[]>([])
const conversationId = ref('')
const chatBusy = ref(false)
const chatError = ref('')
const marketBusy = ref(false)
const marketError = ref('')
const market = ref<Awaited<ReturnType<Air3Client['fetchMarketContext']>> | null>(null)
const stageExpression = ref<AvatarExpression>('neutral')
let expressionTimer: ReturnType<typeof setTimeout> | undefined
let marketRefreshTimer: ReturnType<typeof setTimeout> | undefined

const {
  importedModel,
  activeModelUrl,
  activeModelLabel,
  restoreImportedModel,
  importModelFile,
  clearImportedModel,
  useRemoteModel,
} = useModelRegistry(settings)

const {
  supported: speechSupported,
  speaking,
  voiceOptions,
  speak,
  stop: stopSpeech,
} = useSpeechSynthesis()

const statusCards = computed(() => [
  {
    label: 'Session identity',
    value: settings.value.sessionIdentity,
    detail: conversationId.value || 'new session',
  },
  {
    label: 'Runtime base',
    value: settings.value.runtimeBaseUrl || 'not set',
    detail: settings.value.serviceBaseUrl || 'service fallback disabled',
  },
  {
    label: 'Avatar source',
    value: settings.value.modelSource === 'file' ? 'imported VRM' : 'remote VRM',
    detail: activeModelLabel.value,
  },
])

function createClient() {
  return new Air3Client({
    runtimeBaseUrl: settings.value.runtimeBaseUrl,
    serviceBaseUrl: settings.value.serviceBaseUrl,
    token: settings.value.token || undefined,
  })
}

function pushMessage(message: Omit<WorkbenchMessage, 'id' | 'createdAt'>) {
  messages.value.push({
    id: createMessageId(),
    createdAt: Date.now(),
    ...message,
  })
}

function setExpression(expression: AvatarExpression, durationMs = 3200) {
  stageExpression.value = expression
  if (expressionTimer)
    clearTimeout(expressionTimer)

  expressionTimer = setTimeout(() => {
    stageExpression.value = 'neutral'
  }, durationMs)
}

async function refreshMarket() {
  const symbol = settings.value.marketSymbol.trim().toUpperCase()
  if (!settings.value.serviceBaseUrl.trim()) {
    market.value = null
    marketError.value = 'Service API base URL is empty.'
    return
  }

  if (!symbol) {
    market.value = null
    marketError.value = 'Market symbol is empty.'
    return
  }

  marketBusy.value = true
  marketError.value = ''

  try {
    market.value = await createClient().fetchMarketContext({
      symbol,
      timeframe: '15m',
      limit: 96,
    })
  }
  catch (error) {
    market.value = null
    marketError.value = error instanceof Error ? error.message : 'Unable to refresh market context.'
  }
  finally {
    marketBusy.value = false
  }
}

function scheduleMarketRefresh() {
  if (marketRefreshTimer)
    clearTimeout(marketRefreshTimer)

  marketRefreshTimer = setTimeout(() => {
    void refreshMarket()
  }, 450)
}

async function handleSendMessage(text: string) {
  const message = text.trim()
  if (!message || chatBusy.value)
    return

  if (!settings.value.sessionIdentity.trim())
    settings.value.sessionIdentity = createGuestIdentity()

  pushMessage({
    role: 'user',
    content: message,
  })

  chatBusy.value = true
  chatError.value = ''

  try {
    const response = await createClient().sendConversationMessage({
      sessionIdentity: settings.value.sessionIdentity,
      conversationId: conversationId.value || undefined,
      text: message,
    })

    conversationId.value = response.conversationId

    if (!response.responses.length) {
      pushMessage({
        role: 'system',
        content: 'AIR3 returned an empty response payload.',
      })
      setExpression('sad')
      return
    }

    const assistantMessages = response.responses.map((envelope) => {
      const content = extractMessageText(envelope)
      return {
        role: 'assistant' as const,
        content: content || 'Response received without textual content.',
        proposal: envelope.message.proposal,
        image: envelope.message.image,
        pendingProposal: hasPendingProposal(envelope),
      }
    })

    assistantMessages.forEach(pushMessage)

    const combinedResponse = assistantMessages
      .map(nextMessage => nextMessage.content)
      .join('\n\n')
      .trim()

    setExpression(detectAvatarExpression(combinedResponse), 4200)

    if (settings.value.autoSpeak && speechSupported)
      void speak(combinedResponse, settings.value.preferredVoice)

    scheduleMarketRefresh()
  }
  catch (error) {
    chatError.value = error instanceof Error ? error.message : 'Failed to contact AIR3.'
    pushMessage({
      role: 'system',
      content: chatError.value,
    })
    setExpression('sad')
  }
  finally {
    chatBusy.value = false
  }
}

function resetConversation() {
  conversationId.value = ''
  messages.value = []
  chatError.value = ''
  stopSpeech()
  stageExpression.value = 'neutral'
}

async function handleImportModel(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  await importModelFile(file)
  target.value = ''
}

onMounted(async () => {
  await restoreImportedModel()
  if (!settings.value.sessionIdentity)
    settings.value.sessionIdentity = createGuestIdentity()
  if (settings.value.serviceBaseUrl)
    void refreshMarket()
})

watch(() => [settings.value.serviceBaseUrl, settings.value.marketSymbol], () => {
  scheduleMarketRefresh()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__copy">
        <p class="app-header__eyebrow">
          Airifica Web
        </p>
        <h1 class="app-header__title">
          Lean AIR3 stage and operator console.
        </h1>
        <p class="app-header__intro">
          Single root application, VRM-only runtime, typed AIR3 client and no bundled media payload.
        </p>
      </div>

      <div class="app-header__stats">
        <article v-for="card in statusCards" :key="card.label" class="summary-card">
          <p class="summary-card__label">
            {{ card.label }}
          </p>
          <strong class="summary-card__value">
            {{ card.value }}
          </strong>
          <span class="summary-card__detail">
            {{ card.detail }}
          </span>
        </article>
      </div>
    </header>

    <main class="workspace">
      <aside class="workspace__aside">
        <section class="panel settings-panel">
          <header class="panel__header">
            <div>
              <p class="panel__eyebrow">
                Runtime
              </p>
              <h2 class="panel__title">
                Connection surface
              </h2>
            </div>
          </header>

          <label class="field">
            <span class="field__label">AIR3 runtime URL</span>
            <input v-model.trim="settings.runtimeBaseUrl" class="field__control" placeholder="https://runtime.example.com" type="url">
          </label>

          <label class="field">
            <span class="field__label">Service API URL</span>
            <input v-model.trim="settings.serviceBaseUrl" class="field__control" placeholder="https://service.example.com/api" type="url">
          </label>

          <label class="field">
            <span class="field__label">Session identity</span>
            <input v-model.trim="settings.sessionIdentity" class="field__control" placeholder="wallet or guest identity" type="text">
          </label>

          <label class="field">
            <span class="field__label">Bearer token</span>
            <input v-model.trim="settings.token" class="field__control" placeholder="Optional Pacifica token" type="password">
          </label>

          <div class="settings-panel__row">
            <label class="field">
              <span class="field__label">Market symbol</span>
              <input v-model.trim="settings.marketSymbol" class="field__control" placeholder="BTC" type="text">
            </label>
            <button class="button" type="button" @click="refreshMarket">
              {{ marketBusy ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>

          <p class="settings-panel__note">
            Latest market update: {{ market ? formatRelativeMinutes(market.updatedAt) : 'not available' }}
          </p>
        </section>

        <section class="panel settings-panel">
          <header class="panel__header">
            <div>
              <p class="panel__eyebrow">
                Avatar input
              </p>
              <h2 class="panel__title">
                Model registry
              </h2>
            </div>
          </header>

          <label class="field">
            <span class="field__label">Remote VRM URL</span>
            <input v-model.trim="settings.remoteModelUrl" class="field__control" placeholder="https://cdn.example.com/avatar.vrm" type="url">
          </label>

          <div class="settings-panel__row settings-panel__row--stack">
            <button class="button button--ghost" type="button" @click="useRemoteModel">
              Use remote source
            </button>
            <label class="button button--secondary settings-panel__upload">
              <input accept=".vrm" class="settings-panel__upload-input" type="file" @change="handleImportModel">
              Import local VRM
            </label>
          </div>

          <div class="model-card">
            <p class="model-card__title">
              Active source
            </p>
            <strong>{{ settings.modelSource === 'file' ? 'Imported file' : 'Remote URL' }}</strong>
            <p>{{ activeModelLabel }}</p>
            <p v-if="importedModel" class="model-card__meta">
              {{ importedModel.name }} · {{ formatBytes(importedModel.size) }} · imported {{ formatRelativeMinutes(importedModel.updatedAt) }}
            </p>
          </div>

          <button class="button button--ghost" type="button" :disabled="!importedModel" @click="clearImportedModel">
            Remove imported file
          </button>
        </section>

        <section class="panel settings-panel">
          <header class="panel__header">
            <div>
              <p class="panel__eyebrow">
                Speech
              </p>
              <h2 class="panel__title">
                Voice bridge
              </h2>
            </div>
          </header>

          <label class="toggle">
            <input v-model="settings.autoSpeak" type="checkbox">
            <span>Read assistant messages with browser speech synthesis</span>
          </label>

          <label class="field">
            <span class="field__label">Preferred voice</span>
            <select v-model="settings.preferredVoice" class="field__control" :disabled="!speechSupported || !voiceOptions.length">
              <option value="">
                System default
              </option>
              <option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
                {{ voice.label }}
              </option>
            </select>
          </label>

          <p class="settings-panel__note">
            Speech runtime: {{ speechSupported ? 'available' : 'not available in this browser' }} · Avatar expression {{ stageExpression }}
          </p>
        </section>
      </aside>

      <section class="workspace__stage">
        <StagePanel
          :model-url="activeModelUrl"
          :model-label="activeModelLabel"
          :model-source="settings.modelSource"
          :speaking="speaking"
          :expression="stageExpression"
          :market="market"
          :market-loading="marketBusy"
          :market-error="marketError"
          @refresh-market="refreshMarket"
        />
      </section>

      <aside class="workspace__chat">
        <ChatPanel
          :messages="messages"
          :busy="chatBusy"
          :error="chatError"
          :conversation-id="conversationId"
          @send="handleSendMessage"
          @reset="resetConversation"
        />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  gap: 1.5rem;
  padding: var(--page-gutter);
}

.app-header {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  align-items: start;
}

.app-header__eyebrow {
  margin: 0 0 0.85rem;
  color: var(--text-muted);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  font-size: 0.78rem;
}

.app-header__title {
  margin: 0;
  font-size: clamp(2.2rem, 4vw, 4.4rem);
  line-height: 0.96;
  max-width: 12ch;
}

.app-header__intro {
  margin: 1rem 0 0;
  max-width: 45rem;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.65;
}

.app-header__stats {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.summary-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.48);
  border: 1px solid rgba(125, 211, 252, 0.12);
}

.summary-card__label {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.summary-card__value {
  color: #f8fafc;
  font-size: 0.98rem;
  line-height: 1.45;
  word-break: break-word;
}

.summary-card__detail {
  color: rgba(191, 219, 254, 0.7);
  font-size: 0.88rem;
}

.workspace {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr) minmax(22rem, 28rem);
  align-items: start;
}

.workspace__aside,
.workspace__chat {
  display: grid;
  gap: 1rem;
}

.settings-panel {
  display: grid;
  gap: 1rem;
}

.settings-panel__row {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.settings-panel__row--stack {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-panel__note {
  margin: 0;
  color: rgba(191, 219, 254, 0.74);
  line-height: 1.55;
}

.settings-panel__upload {
  position: relative;
  justify-content: center;
  overflow: hidden;
}

.settings-panel__upload-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.model-card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 1.1rem;
  background: rgba(15, 23, 42, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.model-card__title,
.model-card__meta {
  margin: 0;
  color: rgba(226, 232, 240, 0.72);
}

.toggle {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  color: #e2e8f0;
}

.toggle input {
  width: 1rem;
  height: 1rem;
}

@media (max-width: 1280px) {
  .workspace {
    grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
  }

  .workspace__chat {
    grid-column: 1 / -1;
  }
}

@media (max-width: 960px) {
  .app-header,
  .workspace,
  .app-header__stats,
  .settings-panel__row,
  .settings-panel__row--stack {
    grid-template-columns: 1fr;
  }
}
</style>
