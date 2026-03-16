<script setup lang="ts">
import { ref } from 'vue'

import HeaderLink from '@/components/layout/HeaderLink.vue'
import PacificaTradeButton from '@/components/layout/PacificaTradeButton.vue'
import WalletConnectButton from '@/components/layout/WalletConnectButton.vue'
import { EMOTE_DEBUG_OPTIONS, useEmoteDebugStore } from '@/modules/avatar/emoteDebug'
import { useVRMAStore, VRMA_LIST } from '@/modules/avatar/vrma'
import { useHearingPipeline } from '@/modules/hearing/pipeline'
import { useMarketContext } from '@/modules/market/context'
import { useSpeechRuntime } from '@/modules/speech/runtime'

const vrmaStore = useVRMAStore()
const emoteDebugStore = useEmoteDebugStore()
const hearing = useHearingPipeline()
const speech = useSpeechRuntime()
const marketContext = useMarketContext()

const settingsOpen = ref(false)

function onAnimChange(event: Event) {
  vrmaStore.select((event.target as HTMLSelectElement).value)
}

function onEmoteChange(event: Event) {
  emoteDebugStore.setTestEmotion((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <header class="stage-header">
    <HeaderLink />

    <div class="stage-header__controls">
      <label class="stage-header__select-shell">
        <span>Anim:</span>
        <select :value="vrmaStore.selectedVRMALabel.value" @change="onAnimChange">
          <option v-for="animation in VRMA_LIST" :key="animation.label" :value="animation.label">
            {{ animation.label }}
          </option>
        </select>
      </label>

      <label class="stage-header__select-shell">
        <span>Emote:</span>
        <select :value="emoteDebugStore.testEmotion.value" @change="onEmoteChange">
          <option v-for="emotion in EMOTE_DEBUG_OPTIONS" :key="emotion" :value="emotion">
            {{ emotion }}
          </option>
        </select>
      </label>

      <PacificaTradeButton />
      <WalletConnectButton />

      <div class="stage-header__settings">
        <button
          class="stage-header__settings-button"
          type="button"
          title="Settings"
          aria-label="Settings"
          @click="settingsOpen = !settingsOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="m19.4 15-.8 1.4 1 1.8-1.6 1.6-1.8-1-.1.1-1.4.8-.5 2.1h-2.2l-.5-2.1-1.4-.8-.1-.1-1.8 1-1.6-1.6 1-1.8L4.6 15 2.5 14.5v-2.2l2.1-.5.8-1.4-1-1.8 1.6-1.6 1.8 1 .1-.1 1.4-.8.5-2.1h2.2l.5 2.1 1.4.8.1.1 1.8-1 1.6 1.6-1 1.8.8 1.4 2.1.5v2.2z" />
          </svg>
        </button>

        <div v-if="settingsOpen" class="stage-header__settings-popover">
          <button class="stage-header__utility" type="button" @click="marketContext.refreshMarketContext()">
            <span>Refresh market</span>
          </button>
          <button class="stage-header__utility" type="button" @click="hearing.toggleListening()">
            <span>{{ hearing.listening.value ? 'Stop mic' : 'Start mic' }}</span>
          </button>
          <button class="stage-header__utility" :disabled="!speech.speaking.value" type="button" @click="speech.stop()">
            <span>Stop speech</span>
          </button>
          <a class="stage-header__utility" :href="marketContext.pacificaPortfolioUrl.value" target="_blank" rel="noopener noreferrer">
            <span>Open portfolio</span>
          </a>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.stage-header {
  position: relative;
  z-index: 12;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.stage-header__controls {
  position: relative;
  z-index: 12;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-header__select-shell {
  position: relative;
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(248, 251, 255, 0.74);
  color: #122232;
  font-size: 0.78rem;
  font-weight: 600;
  backdrop-filter: blur(16px);
}

.stage-header__select-shell select {
  min-width: 112px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.76rem;
  outline: none;
}

.stage-header__settings {
  position: relative;
  z-index: 14;
}

.stage-header__settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(248, 251, 255, 0.74);
  color: #122232;
  backdrop-filter: blur(16px);
}

.stage-header__settings-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.stage-header__settings-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 8;
  isolation: isolate;
  display: grid;
  gap: 6px;
  width: 180px;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(6, 21, 33, 0.86);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(18px);
}

.stage-header__utility {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 0;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
  text-align: left;
  text-decoration: none;
}

.stage-header__utility:disabled {
  opacity: 0.5;
}

@media (max-width: 1080px) {
  .stage-header {
    flex-direction: column;
    align-items: stretch;
  }

  .stage-header__controls {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .stage-header__controls {
    gap: 6px;
  }

  .stage-header__select-shell {
    flex: 1 1 calc(50% - 6px);
    min-width: 0;
  }

  .stage-header__select-shell select {
    min-width: 0;
    width: 100%;
  }
}
</style>
