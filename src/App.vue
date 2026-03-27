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
const mobilePanel = ref<'chat' | 'market'>('chat')

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

        <div v-if="mobileLayout" class="stage-page__mobile-sheet">
          <div class="stage-page__mobile-sheet-tabs">
            <button
              type="button"
              :class="['stage-page__mobile-tab', { 'stage-page__mobile-tab--active': mobilePanel === 'chat' }]"
              @click="mobilePanel = 'chat'"
            >
              Chat
            </button>
            <button
              type="button"
              :class="['stage-page__mobile-tab', { 'stage-page__mobile-tab--active': mobilePanel === 'market' }]"
              @click="mobilePanel = 'market'"
            >
              Market
            </button>
          </div>

          <div class="stage-page__mobile-sheet-body">
            <InteractiveArea v-show="mobilePanel === 'chat'" class="stage-page__mobile-interactive">
              <ConversationCard />
            </InteractiveArea>
            <StageMarketSurface v-show="mobilePanel === 'market'" class="stage-page__mobile-market-surface" />
          </div>
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

.stage-page__mobile-sheet {
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

  .stage-page__mobile-sheet {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: calc(env(safe-area-inset-bottom) + 58px);
    z-index: 14;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    height: min(46dvh, 420px);
    pointer-events: auto;
  }

  .stage-page__mobile-sheet-tabs {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    padding: 4px;
    border-radius: 999px;
    background: rgba(5, 20, 31, 0.58);
    border: 1px solid rgba(103, 232, 249, 0.12);
    box-shadow: 0 14px 34px rgba(5, 23, 36, 0.24);
    backdrop-filter: blur(18px);
  }

  .stage-page__mobile-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(224, 242, 254, 0.7);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stage-page__mobile-tab--active {
    background: rgba(103, 232, 249, 0.16);
    color: rgba(240, 249, 255, 0.98);
    box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.12);
  }

  .stage-page__mobile-sheet-body {
    position: relative;
    min-height: 0;
    border-radius: 24px;
    background: rgba(6, 22, 34, 0.56);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }

  .stage-page__mobile-market-surface,
  :deep(.stage-page__mobile-interactive) {
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
  }

  :deep(.stage-page__mobile-interactive) {
    position: relative;
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
