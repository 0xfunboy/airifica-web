<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

import AvatarStageCard from '@/components/AvatarStageCard.vue'
import ConversationCard from '@/components/ConversationCard.vue'
import MarketContextCard from '@/components/MarketContextCard.vue'
import PacificaAccountCard from '@/components/PacificaAccountCard.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import WalletSessionCard from '@/components/WalletSessionCard.vue'
import { appConfig } from '@/config/app'
import { describeUrl, truncateMiddle } from '@/lib/format'
import { useMarketContext } from '@/modules/market/context'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const marketContext = useMarketContext()

const endpointCards = computed(() => [
  {
    label: 'Runtime',
    value: describeUrl(appConfig.runtimeBaseUrl, 'not configured'),
    detail: 'AIR3 session, message and proposal flow',
  },
  {
    label: 'Service API',
    value: describeUrl(appConfig.serviceApiBaseUrl, 'not configured'),
    detail: 'Pacifica actions, challenge and market context',
  },
  {
    label: 'Avatar',
    value: describeUrl(appConfig.avatarModelUrl, 'pending'),
    detail: appConfig.avatarModelUrl ? truncateMiddle(appConfig.avatarModelUrl, 44) : 'VRM model mounts in the avatar runtime step',
  },
])

const sessionLabel = computed(() => truncateMiddle(wallet.sessionIdentity.value, 24))

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
    <header class="app-topbar panel">
      <div>
        <p class="eyebrow">
          {{ appConfig.brandName }}
        </p>
        <h1 class="app-topbar__title">
          AIR3 trading stage
        </h1>
        <p class="app-topbar__copy">
          Wallet-authenticated conversation, Pacifica execution flow, VRM avatar runtime and market context stay wired inside one stage surface.
        </p>
      </div>
        <div class="app-topbar__meta">
        <span class="meta-chip">{{ marketContext.currentSymbol.value }} market</span>
        <span class="meta-chip">{{ wallet.isAuthenticated.value ? 'verified session' : 'guest session' }}</span>
        <span class="meta-chip">{{ sessionLabel }}</span>
        <span class="meta-chip">{{ appConfig.brandName }}</span>
      </div>
    </header>

    <main class="app-grid">
      <section class="stage-column">
        <div class="stage-shell panel">
          <StageBackdrop />
          <div class="stage-shell__header">
            <div>
              <p class="eyebrow">
                Stage runtime
              </p>
              <h2>Primary avatar surface</h2>
            </div>
            <span class="stage-shell__status">{{ sessionLabel }}</span>
          </div>
          <AvatarStageCard />

          <div class="endpoint-grid">
            <article v-for="card in endpointCards" :key="card.label" class="endpoint-card">
              <p class="endpoint-card__label">
                {{ card.label }}
              </p>
              <strong>{{ card.value }}</strong>
              <span>{{ card.detail }}</span>
            </article>
          </div>
        </div>
      </section>

      <aside class="workspace-column">
        <ConversationCard />
        <div class="workspace-support">
          <WalletSessionCard />
          <PacificaAccountCard />
          <MarketContextCard />
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: clamp(18px, 2.4vw, 30px);
  display: grid;
  gap: clamp(18px, 2vw, 24px);
}

.app-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  padding: clamp(20px, 2.4vw, 30px);
}

.app-topbar__title {
  margin: 12px 0 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 0.96;
  letter-spacing: -0.05em;
}

.app-topbar__copy {
  max-width: 54rem;
  margin: 14px 0 0;
  color: var(--text-1);
  line-height: 1.6;
}

.app-topbar__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.app-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(380px, 0.95fr);
  gap: clamp(18px, 2vw, 24px);
  align-items: start;
}

.stage-column,
.workspace-column {
  min-width: 0;
}

.stage-shell {
  position: relative;
  padding: 20px;
  display: grid;
  gap: 18px;
  overflow: hidden;
}

.stage-shell__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-shell__header h2 {
  margin: 12px 0 0;
  font-size: 1.28rem;
}

.stage-shell__status {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background: rgba(8, 20, 33, 0.62);
  color: var(--text-1);
}

.workspace-column {
  display: grid;
  gap: 18px;
}

.workspace-support {
  display: grid;
  gap: 18px;
}

@media (max-width: 1180px) {
  .app-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .app-topbar,
  .stage-shell__header {
    flex-direction: column;
  }

  .app-topbar__meta {
    justify-content: flex-start;
  }
}
</style>
