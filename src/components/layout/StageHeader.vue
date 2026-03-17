<script setup lang="ts">
import { ref } from 'vue'

import HeaderLink from '@/components/layout/HeaderLink.vue'
import PacificaTradeButton from '@/components/layout/PacificaTradeButton.vue'
import WalletConnectButton from '@/components/layout/WalletConnectButton.vue'
import { useAvatarLighting } from '@/modules/avatar/lighting'
import { useHearingPipeline } from '@/modules/hearing/pipeline'
import { useMarketContext } from '@/modules/market/context'
import { useSpeechRuntime } from '@/modules/speech/runtime'

const lighting = useAvatarLighting()
const hearing = useHearingPipeline()
const speech = useSpeechRuntime()
const marketContext = useMarketContext()

const settingsOpen = ref(false)
</script>

<template>
  <header class="stage-header">
    <HeaderLink />

    <div class="stage-header__controls">
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

          <div class="stage-header__tts-panel">
            <div class="stage-header__lighting-head">
              <span>TTS Mode</span>
              <strong>{{ speech.activeMode.value || 'off' }}</strong>
            </div>
            <div class="stage-header__mode-toggle">
              <button
                class="stage-header__mode-option"
                :class="{ 'stage-header__mode-option--active': speech.preferredMode.value === 'browser' }"
                :disabled="!speech.availableModes.value.browser"
                title="Use browser speech synthesis"
                type="button"
                @click="speech.setPreferredMode('browser')"
              >
                Browser
              </button>
              <button
                class="stage-header__mode-option"
                :class="{ 'stage-header__mode-option--active': speech.preferredMode.value === 'external' }"
                :disabled="!speech.availableModes.value.external"
                :title="speech.availableModes.value.external ? 'Use external TTS server' : 'External server unavailable in env. Restart the dev server after editing env.'"
                type="button"
                @click="speech.setPreferredMode('external')"
              >
                External
              </button>
            </div>
            <p v-if="speech.availableModes.value.external && speech.externalEndpoint.value" class="stage-header__mode-hint">
              {{ speech.externalEndpoint.value }}
            </p>
            <p v-else class="stage-header__mode-hint">
              External server unavailable in env.
            </p>
          </div>

          <div class="stage-header__lighting-panel">
            <div class="stage-header__lighting-head">
              <span>Avatar lighting</span>
              <button class="stage-header__utility stage-header__utility--ghost" type="button" @click="lighting.reset()">
                Reset
              </button>
            </div>

            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Brightness</span><strong>{{ lighting.brightness.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0.6" max="1.6" step="0.02" :value="lighting.brightness.value" @input="lighting.setValue('brightness', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Contrast</span><strong>{{ lighting.contrast.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0.75" max="1.45" step="0.02" :value="lighting.contrast.value" @input="lighting.setValue('contrast', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Saturation</span><strong>{{ lighting.saturation.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0.5" max="1.5" step="0.02" :value="lighting.saturation.value" @input="lighting.setValue('saturation', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Exposure</span><strong>{{ lighting.exposure.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0.5" max="1.7" step="0.02" :value="lighting.exposure.value" @input="lighting.setValue('exposure', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Ambient</span><strong>{{ lighting.ambientIntensity.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0" max="1.6" step="0.02" :value="lighting.ambientIntensity.value" @input="lighting.setValue('ambientIntensity', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Hemisphere</span><strong>{{ lighting.hemisphereIntensity.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0" max="2.2" step="0.02" :value="lighting.hemisphereIntensity.value" @input="lighting.setValue('hemisphereIntensity', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Key</span><strong>{{ lighting.keyIntensity.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0" max="2.8" step="0.02" :value="lighting.keyIntensity.value" @input="lighting.setValue('keyIntensity', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Rim</span><strong>{{ lighting.rimIntensity.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0" max="1.4" step="0.02" :value="lighting.rimIntensity.value" @input="lighting.setValue('rimIntensity', Number(($event.target as HTMLInputElement).value))">
            </label>
            <label class="stage-header__slider-row">
              <div class="stage-header__slider-head"><span>Fill</span><strong>{{ lighting.fillIntensity.value.toFixed(2) }}</strong></div>
              <input class="stage-header__slider" type="range" min="0" max="1.2" step="0.02" :value="lighting.fillIntensity.value" @input="lighting.setValue('fillIntensity', Number(($event.target as HTMLInputElement).value))">
            </label>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.stage-header {
  position: relative;
  z-index: 32;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.stage-header__controls {
  position: relative;
  z-index: 32;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-header__settings {
  position: relative;
  z-index: 40;
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
  z-index: 48;
  isolation: isolate;
  display: grid;
  gap: 6px;
  width: 300px;
  max-height: min(72vh, 640px);
  overflow: auto;
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

.stage-header__utility--ghost {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.stage-header__utility:disabled {
  opacity: 0.5;
}

.stage-header__lighting-panel {
  display: grid;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(138, 218, 255, 0.1);
}

.stage-header__tts-panel {
  display: grid;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(138, 218, 255, 0.1);
}

.stage-header__lighting-head,
.stage-header__slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stage-header__lighting-head span,
.stage-header__slider-head span {
  color: rgba(186, 230, 253, 0.72);
  font-size: 0.66rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.stage-header__slider-head strong {
  color: rgba(240, 249, 255, 0.92);
  font-size: 0.72rem;
  font-weight: 600;
}

.stage-header__slider-row {
  display: grid;
  gap: 6px;
}

.stage-header__slider {
  width: 100%;
  accent-color: #67e8f9;
}

.stage-header__mode-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.stage-header__mode-option {
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}

.stage-header__mode-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.stage-header__mode-option--active {
  border-color: rgba(103, 232, 249, 0.24);
  background: rgba(103, 232, 249, 0.14);
  color: rgba(240, 249, 255, 0.96);
}

.stage-header__mode-hint {
  margin: 0;
  color: rgba(186, 230, 253, 0.62);
  font-size: 0.7rem;
  line-height: 1.45;
  word-break: break-word;
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
}
</style>
