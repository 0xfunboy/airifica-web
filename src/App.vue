<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import AvatarStageCard from '@/components/AvatarStageCard.vue'
import ConversationCard from '@/components/ConversationCard.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import StageMarketSurface from '@/components/StageMarketSurface.vue'
import InteractiveArea from '@/components/layout/InteractiveArea.vue'
import StageFooter from '@/components/layout/StageFooter.vue'
import StageHeader from '@/components/layout/StageHeader.vue'
import { useAvatarPresence } from '@/modules/avatar/presence'
import { useConversationState } from '@/modules/conversation/state'
import { appConfig } from '@/config/app'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const avatar = useAvatarPresence()
const conversation = useConversationState()
const mobileLayout = ref(false)
const mobilePanel = ref<'chat' | 'market'>('chat')
const mobilePanelExpanded = ref(false)
const mobileResetConfirmOpen = ref(false)
const mobileSheetHeight = ref(0)
const mobileSheetDragging = ref(false)
const mobileSheetPointerId = ref<number | null>(null)
const mobileSheetDragMoved = ref(false)

function getMobileSheetMinHeight() {
  if (typeof window === 'undefined')
    return 232
  return Math.min(300, Math.max(208, Math.round(window.innerHeight * 0.24)))
}

function getMobileSheetMaxHeight() {
  if (typeof window === 'undefined')
    return 640
  return Math.max(getMobileSheetMinHeight() + 120, Math.round(window.innerHeight - 84))
}

function clampMobileSheetHeight(height: number) {
  return Math.min(getMobileSheetMaxHeight(), Math.max(getMobileSheetMinHeight(), Math.round(height)))
}

function syncMobileSheetHeight(targetHeight?: number) {
  if (!mobileLayout.value) {
    mobileSheetHeight.value = 0
    mobilePanelExpanded.value = false
    return
  }

  const nextHeight = clampMobileSheetHeight(targetHeight ?? (mobileSheetHeight.value || getMobileSheetMinHeight()))
  mobileSheetHeight.value = nextHeight
  const threshold = getMobileSheetMinHeight() + (getMobileSheetMaxHeight() - getMobileSheetMinHeight()) * 0.72
  mobilePanelExpanded.value = nextHeight >= threshold
}

function syncLayoutMode() {
  mobileLayout.value = window.innerWidth <= 980
  if (!mobileLayout.value) {
    mobilePanelExpanded.value = false
    mobileSheetHeight.value = 0
    return
  }

  syncMobileSheetHeight(mobileSheetHeight.value || getMobileSheetMinHeight())
}

function handleMobileReset() {
  mobileResetConfirmOpen.value = false
  avatar.triggerInteractionGesture('reset')
  conversation.resetConversation()
}

function handleMobileSheetToggle() {
  syncMobileSheetHeight(mobilePanelExpanded.value ? getMobileSheetMinHeight() : getMobileSheetMaxHeight())
}

function updateMobileSheetHeightFromPointer(clientY: number) {
  if (!mobileLayout.value || typeof window === 'undefined')
    return

  const bottomInset = 10
  const nextHeight = window.innerHeight - clientY - bottomInset
  syncMobileSheetHeight(nextHeight)
}

function handleMobileSheetPointerDown(event: PointerEvent) {
  if (!mobileLayout.value)
    return

  mobileSheetDragging.value = true
  mobileSheetPointerId.value = event.pointerId
  mobileSheetDragMoved.value = false
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function handleWindowPointerMove(event: PointerEvent) {
  if (!mobileSheetDragging.value)
    return

  mobileSheetDragMoved.value = true
  updateMobileSheetHeightFromPointer(event.clientY)
}

function stopMobileSheetDrag() {
  mobileSheetDragging.value = false
  mobileSheetPointerId.value = null
}

function handleWindowPointerUp(event: PointerEvent) {
  if (!mobileSheetDragging.value)
    return

  if (mobileSheetPointerId.value !== null && event.pointerId !== mobileSheetPointerId.value)
    return

  stopMobileSheetDrag()
}

function handleMobileSheetHandleClick() {
  if (mobileSheetDragMoved.value) {
    mobileSheetDragMoved.value = false
    return
  }

  handleMobileSheetToggle()
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
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('pointercancel', handleWindowPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('message', handleEmbeddedBootstrap)
  window.removeEventListener('resize', syncLayoutMode)
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.removeEventListener('pointercancel', handleWindowPointerUp)
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

        <div
          v-if="mobileLayout"
          :class="['stage-page__mobile-sheet', { 'stage-page__mobile-sheet--expanded': mobilePanelExpanded }]"
          :style="{ height: `${mobileSheetHeight}px` }"
        >
          <div :class="['stage-page__mobile-sheet-tabs', { 'stage-page__mobile-sheet-tabs--expanded': mobilePanelExpanded }]">
            <div class="stage-page__mobile-sheet-actions">
              <button
                type="button"
                class="stage-page__mobile-tab stage-page__mobile-tab--icon stage-page__mobile-tab--expand"
                :title="mobilePanelExpanded ? 'Collapse panel' : 'Expand panel'"
                :aria-label="mobilePanelExpanded ? 'Collapse panel' : 'Expand panel'"
                @pointerdown="handleMobileSheetPointerDown"
                @click="handleMobileSheetHandleClick"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 10.5 12 5.5l5 5" />
                  <path d="M7 13.5 12 18.5l5-5" />
                </svg>
              </button>

              <button
                type="button"
                class="stage-page__mobile-tab stage-page__mobile-tab--icon stage-page__mobile-tab--reset"
                title="Reset conversation"
                aria-label="Reset conversation"
                @click="mobileResetConfirmOpen = !mobileResetConfirmOpen"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M9.5 3h5l1 2H8.5l1-2Z" />
                  <path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" />
                  <path d="M10 11v5" />
                  <path d="M14 11v5" />
                </svg>
              </button>
            </div>

            <div class="stage-page__mobile-sheet-tab-group">
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
          </div>

          <div :class="['stage-page__mobile-sheet-body', { 'stage-page__mobile-sheet-body--expanded': mobilePanelExpanded }]">
            <InteractiveArea v-show="mobilePanel === 'chat'" class="stage-page__mobile-interactive">
              <ConversationCard />
            </InteractiveArea>
            <StageMarketSurface v-show="mobilePanel === 'market'" class="stage-page__mobile-market-surface" />
          </div>

          <div v-if="mobileResetConfirmOpen" class="stage-page__mobile-reset-confirm">
            <span>Delete chat history?</span>
            <div class="stage-page__mobile-reset-confirm-actions">
              <button type="button" class="stage-page__mobile-confirm-button" @click="handleMobileReset">
                Yes
              </button>
              <button type="button" class="stage-page__mobile-confirm-button stage-page__mobile-confirm-button--ghost" @click="mobileResetConfirmOpen = false">
                No
              </button>
            </div>
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
    bottom: max(10px, env(safe-area-inset-bottom));
    z-index: 14;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    height: min(66dvh, 620px);
    pointer-events: auto;
    touch-action: none;
  }

  .stage-page__mobile-sheet-tabs {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }

  .stage-page__mobile-sheet-tab-group,
  .stage-page__mobile-sheet-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
    border-radius: 999px;
    background: rgba(5, 20, 31, 0.28);
    border: 1px solid rgba(103, 232, 249, 0.08);
    box-shadow: 0 12px 28px rgba(5, 23, 36, 0.18);
    backdrop-filter: blur(12px);
  }

  .stage-page__mobile-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(224, 242, 254, 0.72);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stage-page__mobile-tab--icon {
    width: 26px;
    padding: 0;
  }

  .stage-page__mobile-sheet-actions {
    flex: 0 0 auto;
  }

  .stage-page__mobile-tab--expand {
    width: 36px;
    cursor: ns-resize;
    touch-action: none;
    color: rgba(167, 243, 208, 0.96);
    background: rgba(16, 185, 129, 0.16);
    box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.18);
  }

  .stage-page__mobile-tab--reset {
    color: rgba(254, 202, 202, 0.94);
    background: rgba(239, 68, 68, 0.16);
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.16);
  }

  .stage-page__mobile-tab--icon svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stage-page__mobile-tab--active {
    background: rgba(103, 232, 249, 0.14);
    color: rgba(240, 249, 255, 0.98);
    box-shadow: inset 0 0 0 1px rgba(103, 232, 249, 0.12);
  }

  .stage-page__mobile-sheet-body {
    position: relative;
    min-height: 0;
    border-radius: 10px;
    background: rgba(6, 22, 34, 0.08);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(14px);
  }

  .stage-page__mobile-sheet-body--expanded {
    background: rgba(6, 22, 34, 0.04);
  }

  .stage-page__mobile-reset-confirm {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    display: grid;
    gap: 8px;
    width: min(180px, 56vw);
    padding: 10px;
    border-radius: 10px;
    background: rgba(22, 12, 15, 0.82);
    border: 1px solid rgba(248, 113, 113, 0.22);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(16px);
    color: rgba(255, 236, 236, 0.94);
    font-size: 0.58rem;
    letter-spacing: 0.04em;
    pointer-events: auto;
  }

  .stage-page__mobile-reset-confirm-actions {
    display: flex;
    gap: 6px;
  }

  .stage-page__mobile-confirm-button {
    flex: 1 1 0;
    min-height: 24px;
    border: 0;
    border-radius: 7px;
    background: rgba(248, 113, 113, 0.24);
    color: rgba(255, 240, 240, 0.96);
    font-size: 0.54rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .stage-page__mobile-confirm-button--ghost {
    background: rgba(148, 163, 184, 0.14);
    color: rgba(226, 232, 240, 0.92);
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
