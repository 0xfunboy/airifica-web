<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

import AvatarStageCard from '@/components/AvatarStageCard.vue'
import ConversationCard from '@/components/ConversationCard.vue'
import MarketContextCard from '@/components/MarketContextCard.vue'
import PacificaAccountCard from '@/components/PacificaAccountCard.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import { appConfig } from '@/config/app'
import { truncateMiddle } from '@/lib/format'
import { useHearingPipeline } from '@/modules/hearing/pipeline'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useSpeechRuntime } from '@/modules/speech/runtime'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const marketContext = useMarketContext()
const pacifica = usePacificaAccount()
const hearing = useHearingPipeline()
const speech = useSpeechRuntime()

const sessionLabel = computed(() => truncateMiddle(wallet.sessionIdentity.value, 18))

const walletStateLabel = computed(() => {
  if (wallet.isAuthenticated.value)
    return 'verified session'
  if (wallet.isConnected.value)
    return 'wallet connected'
  return 'guest session'
})

const walletActionLabel = computed(() => {
  if (wallet.connecting.value)
    return 'Connecting...'
  if (wallet.authenticating.value)
    return 'Verifying...'
  if (!wallet.isConnected.value)
    return 'Connect wallet'
  return 'Sign session'
})

const stageReadinessLabel = computed(() => {
  if (pacifica.readyToExecute.value)
    return 'Pacifica ready'
  if (wallet.isAuthenticated.value)
    return 'Session verified'
  return 'Wallet required'
})

function handleEmbeddedBootstrap(event: MessageEvent) {
  if (!event.data || typeof event.data !== 'object')
    return

  if (event.source !== window.parent)
    return

  if (appConfig.embeddedAllowedOrigin && event.origin !== appConfig.embeddedAllowedOrigin)
    return

  if ((event.data as { type?: string }).type !== 'AIRI3_BOOTSTRAP')
    return

  wallet.hydrateExternalSession({
    address: (event.data as { walletAddress?: string | null }).walletAddress || null,
    token: (event.data as { token?: string | null }).token || null,
    embedded: true,
  })
}

async function handleWalletPrimaryAction() {
  try {
    if (!wallet.isConnected.value)
      await wallet.connect()
    else if (!wallet.isAuthenticated.value)
      await wallet.authenticate()
  }
  catch {
  }
}

async function handleWalletDisconnect() {
  await wallet.disconnect()
}

onMounted(() => {
  wallet.bootstrapFromSearch()
  void wallet.tryRestore()
  window.addEventListener('message', handleEmbeddedBootstrap)
})

onUnmounted(() => {
  window.removeEventListener('message', handleEmbeddedBootstrap)
})
</script>

<template>
  <div class="stage-shell">
    <StageBackdrop />

    <header class="stage-topbar panel">
      <div class="stage-topbar__brand">
        <div class="brand-lockup">
          <img class="brand-lockup__icon" :src="appConfig.brandIconUrl" alt="AIR3">
          <img class="brand-lockup__logo" :src="appConfig.brandLogoUrl" alt="AIRewardrop">
        </div>

        <div class="stage-topbar__chips">
          <span class="status-pill stage-topbar__product">{{ appConfig.productName }}</span>
          <span class="meta-chip">Pacifica</span>
          <span class="meta-chip">{{ marketContext.currentSymbol.value }} market</span>
        </div>
      </div>

      <div class="stage-topbar__controls">
        <div class="stage-topbar__identity">
          <span :class="['status-pill', wallet.isAuthenticated.value ? 'status-pill--success' : '']">
            {{ walletStateLabel }}
          </span>
          <span class="meta-chip">{{ sessionLabel }}</span>
        </div>

        <div class="stage-topbar__actions">
          <button
            class="icon-button"
            :disabled="marketContext.loading.value"
            type="button"
            aria-label="Refresh market context"
            title="Refresh market context"
            @click="marketContext.refreshMarketContext()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>

          <button
            :class="['icon-button', hearing.listening.value ? 'icon-button--active' : '']"
            :disabled="!hearing.supported.value"
            type="button"
            aria-label="Toggle microphone"
            title="Toggle microphone"
            @click="hearing.toggleListening()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
              <path d="M19 10a7 7 0 0 1-14 0" />
              <path d="M12 17v4" />
              <path d="M8 21h8" />
            </svg>
          </button>

          <button
            :class="['icon-button', speech.speaking.value ? 'icon-button--active' : '']"
            :disabled="!speech.speaking.value"
            type="button"
            aria-label="Stop speech playback"
            title="Stop speech playback"
            @click="speech.stop()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 8v8" />
              <path d="M10 5v14" />
              <path d="M14 8v8" />
              <path d="M18 5v14" />
            </svg>
          </button>

          <a
            class="icon-button"
            :href="marketContext.pacificaPortfolioUrl.value"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Pacifica portfolio"
            title="Open Pacifica portfolio"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
              <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
            </svg>
          </a>

          <a
            class="icon-button"
            :href="marketContext.pacificaTradeUrl.value"
            target="_blank"
            rel="noreferrer"
            aria-label="Open Pacifica trade"
            title="Open Pacifica trade"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
              <path d="M5 5h5" />
              <path d="M19 19h-5" />
            </svg>
          </a>

          <button
            v-if="!wallet.isAuthenticated.value"
            class="surface-button surface-button--primary"
            :disabled="wallet.connecting.value || wallet.authenticating.value"
            type="button"
            @click="handleWalletPrimaryAction"
          >
            {{ walletActionLabel }}
          </button>

          <button
            v-else
            class="surface-button surface-button--secondary"
            type="button"
            @click="handleWalletDisconnect"
          >
            {{ wallet.shortAddress.value || 'Disconnect' }}
          </button>
        </div>
      </div>
    </header>

    <div class="stage-scene">
      <AvatarStageCard />
    </div>

    <aside class="stage-panel stage-panel--left">
      <MarketContextCard />
      <PacificaAccountCard />
    </aside>

    <aside class="stage-panel stage-panel--right">
      <ConversationCard />
    </aside>

    <footer class="stage-footer">
      <span class="meta-chip">stage {{ stageReadinessLabel }}</span>
      <span class="meta-chip">{{ hearing.listening.value ? (hearing.speechDetected.value ? 'voice active' : 'mic open') : 'voice idle' }}</span>
      <span class="meta-chip">speech {{ speech.speaking.value ? 'playing' : 'idle' }}</span>
    </footer>
  </div>
</template>

<style scoped>
.stage-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.stage-topbar,
.stage-panel,
.stage-footer {
  position: absolute;
  z-index: 4;
}

.stage-topbar {
  top: 18px;
  left: 18px;
  right: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.stage-topbar__brand,
.stage-topbar__controls,
.stage-topbar__actions,
.stage-topbar__identity,
.stage-topbar__chips {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage-topbar__brand,
.stage-topbar__controls {
  flex-wrap: wrap;
}

.stage-topbar__controls {
  justify-content: flex-end;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-lockup__icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(117, 212, 249, 0.14);
}

.brand-lockup__logo {
  width: min(210px, 34vw);
  height: auto;
  object-fit: contain;
}

.stage-topbar__product {
  letter-spacing: 0.24em;
}

.stage-scene {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.stage-panel {
  display: grid;
  gap: 16px;
  pointer-events: auto;
}

.stage-panel--left {
  left: 18px;
  top: 98px;
  width: min(340px, calc(100vw - 36px));
}

.stage-panel--right {
  top: 98px;
  right: 18px;
  bottom: 70px;
  width: min(430px, calc(100vw - 36px));
}

.stage-footer {
  left: 50%;
  bottom: 18px;
  display: flex;
  gap: 10px;
  transform: translateX(-50%);
  pointer-events: auto;
}

@media (max-width: 1080px) {
  .stage-shell {
    display: grid;
    gap: 14px;
    padding: 14px;
  }

  .stage-topbar,
  .stage-panel,
  .stage-footer,
  .stage-scene {
    position: relative;
    inset: auto;
    left: auto;
    right: auto;
    top: auto;
    bottom: auto;
    width: auto;
    transform: none;
  }

  .stage-topbar {
    padding: 14px;
  }

  .stage-scene {
    min-height: 58vh;
  }

  .stage-panel--right {
    min-height: 760px;
  }

  .stage-footer {
    flex-wrap: wrap;
    justify-content: center;
  }
}

@media (max-width: 760px) {
  .stage-topbar,
  .stage-topbar__brand,
  .stage-topbar__controls,
  .stage-topbar__identity,
  .stage-topbar__chips {
    display: grid;
    gap: 10px;
  }

  .stage-topbar__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .brand-lockup__logo {
    width: min(210px, 56vw);
  }
}
</style>
