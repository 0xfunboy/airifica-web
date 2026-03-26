<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import AvatarStageCard from '@/components/AvatarStageCard.vue'
import ConversationCard from '@/components/ConversationCard.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import StageMarketSurface from '@/components/StageMarketSurface.vue'
import InteractiveArea from '@/components/layout/InteractiveArea.vue'
import StageFooter from '@/components/layout/StageFooter.vue'
import StageHeader from '@/components/layout/StageHeader.vue'
import { appConfig } from '@/config/app'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const mobileLayout = ref(false)

function syncLayoutMode() {
  mobileLayout.value = window.innerWidth <= 980
}

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
  syncLayoutMode()
  window.addEventListener('message', handleEmbeddedBootstrap)
  window.addEventListener('resize', syncLayoutMode)
})

onUnmounted(() => {
  window.removeEventListener('message', handleEmbeddedBootstrap)
  window.removeEventListener('resize', syncLayoutMode)
})
</script>

<template>
  <div class="stage-page">
    <StageBackdrop :show-market-surface="!mobileLayout" />

    <div class="stage-page__root">
      <div class="stage-page__header">
        <StageHeader />
      </div>

      <div class="stage-page__content">
        <div class="stage-page__scene">
          <AvatarStageCard />
        </div>

        <div v-if="mobileLayout" class="stage-page__mobile-panels">
          <StageMarketSurface class="stage-page__mobile-market-surface" />
          <InteractiveArea class="stage-page__mobile-interactive">
            <ConversationCard />
          </InteractiveArea>
        </div>

        <InteractiveArea v-else class="stage-page__interactive">
          <ConversationCard />
        </InteractiveArea>
      </div>

      <div class="stage-page__footer">
        <StageFooter />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-page {
  --stage-footer-bar-height: 58px;
  --stage-side-panel-height: min(82dvh, calc(100dvh - 184px));
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
}

.stage-page__root {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.stage-page__header {
  position: relative;
  z-index: 20;
  width: 100%;
  padding: 4px 0;
  pointer-events: auto;
}

.stage-page__content {
  position: relative;
  display: flex;
  flex: 1;
  gap: 8px;
  padding-bottom: 0;
}

.stage-page__scene {
  position: relative;
  flex: 1 1 auto;
  min-width: 50%;
  z-index: 1;
  pointer-events: none;
}

.stage-page__mobile-market-surface {
  position: relative;
  z-index: 12;
  pointer-events: auto;
}

.stage-page__mobile-panels {
  display: none;
}

:deep(.stage-page__interactive) {
  position: absolute;
  top: 0;
  right: 16px;
  z-index: 10;
  height: var(--stage-side-panel-height);
  bottom: auto;
  pointer-events: auto;
}

.stage-page__footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 18;
  pointer-events: auto;
}

@media (min-width: 768px) {
  .stage-page__header {
    padding: 12px;
  }
}

@media (max-width: 980px) {
  .stage-page {
    height: 100dvh;
    min-height: 100dvh;
    overflow: hidden;
  }

  .stage-page__root {
    overflow: hidden;
  }

  .stage-page__content {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0;
  }

  .stage-page__scene {
    min-height: 0;
    height: 100%;
  }

  .stage-page__mobile-panels {
    position: absolute;
    top: 6px;
    right: 12px;
    bottom: calc(var(--stage-footer-bar-height) + env(safe-area-inset-bottom) + 18px);
    z-index: 14;
    display: grid;
    grid-template-rows: minmax(220px, 0.88fr) minmax(0, 1.3fr);
    gap: 12px;
    width: clamp(220px, 62vw, 320px);
    max-width: calc(100vw - 24px);
    pointer-events: none;
  }

  .stage-page__mobile-market-surface,
  :deep(.stage-page__mobile-interactive) {
    min-width: 0;
    min-height: 0;
    pointer-events: auto;
  }

  :deep(.stage-page__mobile-interactive) {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .stage-page__footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 18;
    height: 0;
  }
}
</style>
