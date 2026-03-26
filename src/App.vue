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

        <StageMarketSurface v-if="mobileLayout" class="stage-page__mobile-market-surface" />

        <InteractiveArea class="stage-page__interactive">
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
    height: auto;
    min-height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .stage-page__root {
    min-height: 100dvh;
    overflow: visible;
  }

  .stage-page__header {
    position: sticky;
    top: 0;
    z-index: 24;
  }

  .stage-page__content {
    flex-direction: column;
    gap: 14px;
    padding: 0 12px calc(var(--stage-footer-bar-height) + 98px);
  }

  .stage-page__scene {
    flex: none;
    min-height: min(58dvh, 640px);
    height: min(58dvh, 640px);
  }

  :deep(.stage-page__interactive) {
    position: relative;
    top: auto;
    bottom: auto;
    right: auto;
    z-index: 12;
    height: auto;
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
