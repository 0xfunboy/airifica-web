<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

import AvatarStageCard from '@/components/AvatarStageCard.vue'
import ConversationCard from '@/components/ConversationCard.vue'
import MarketContextCard from '@/components/MarketContextCard.vue'
import PacificaAccountCard from '@/components/PacificaAccountCard.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import { appConfig } from '@/config/app'
import { truncateMiddle } from '@/lib/format'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const marketContext = useMarketContext()
const pacifica = usePacificaAccount()

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
  <div class="app-shell">
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

    <main class="stage-layout">
      <aside class="stage-sidebar stage-sidebar--left">
        <MarketContextCard />
        <PacificaAccountCard />
      </aside>

      <section class="stage-surface panel">
        <StageBackdrop />

        <div class="stage-surface__content">
          <div class="stage-surface__headline">
            <div>
              <p class="eyebrow">
                Stage surface
              </p>
              <h1>{{ appConfig.productName }} avatar</h1>
            </div>

            <span :class="['status-pill', pacifica.readyToExecute.value ? 'status-pill--success' : '']">
              {{ stageReadinessLabel }}
            </span>
          </div>

          <AvatarStageCard />

          <div class="stage-surface__footer">
            <span class="meta-chip">conversation linked</span>
            <span class="meta-chip">{{ marketContext.currentSymbol.value }} context</span>
            <span class="meta-chip">session {{ wallet.isAuthenticated.value ? 'verified' : 'guest' }}</span>
          </div>
        </div>
      </section>

      <aside class="stage-sidebar stage-sidebar--right">
        <ConversationCard />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: clamp(14px, 1.8vw, 24px);
  display: grid;
  gap: clamp(14px, 1.6vw, 20px);
}

.stage-topbar {
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

.stage-topbar__brand {
  min-width: 0;
  flex-wrap: wrap;
}

.stage-topbar__controls {
  justify-content: flex-end;
  flex-wrap: wrap;
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
  width: min(210px, 36vw);
  height: auto;
  object-fit: contain;
}

.stage-topbar__product {
  letter-spacing: 0.24em;
}

.stage-layout {
  display: grid;
  grid-template-columns: minmax(292px, 340px) minmax(0, 1fr) minmax(360px, 420px);
  gap: clamp(14px, 1.6vw, 20px);
  align-items: stretch;
}

.stage-sidebar {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.stage-surface {
  position: relative;
  overflow: hidden;
  min-height: calc(100vh - 150px);
}

.stage-surface::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  pointer-events: none;
}

.stage-surface__content {
  position: relative;
  z-index: 1;
  min-height: inherit;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  padding: 20px;
}

.stage-surface__headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-surface__headline h1 {
  margin: 10px 0 0;
  font-size: 1.34rem;
  letter-spacing: -0.05em;
}

.stage-surface__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 1380px) {
  .stage-layout {
    grid-template-columns: minmax(268px, 320px) minmax(0, 1fr) minmax(320px, 380px);
  }

  .brand-lockup__logo {
    width: min(180px, 32vw);
  }
}

@media (max-width: 1180px) {
  .stage-layout {
    grid-template-columns: 1fr;
  }

  .stage-surface {
    min-height: auto;
    order: -1;
  }

  .stage-sidebar--left,
  .stage-sidebar--right {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .stage-topbar,
  .stage-topbar__controls,
  .stage-topbar__actions,
  .stage-topbar__identity,
  .stage-surface__headline {
    align-items: stretch;
  }

  .stage-topbar,
  .stage-topbar__brand,
  .stage-topbar__controls,
  .stage-topbar__actions,
  .stage-topbar__identity,
  .stage-topbar__chips,
  .stage-surface__headline {
    flex-direction: column;
  }

  .brand-lockup {
    width: 100%;
  }

  .brand-lockup__logo {
    width: min(210px, 52vw);
  }

  .stage-surface__content {
    padding: 14px;
  }
}
</style>
