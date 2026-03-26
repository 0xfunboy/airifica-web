<script setup lang="ts">
import { computed } from 'vue'

import StageMarketSurface from '@/components/StageMarketSurface.vue'
import { appConfig } from '@/config/app'
import { useMarketContext } from '@/modules/market/context'

const props = withDefaults(defineProps<{
  showMarketSurface?: boolean
}>(), {
  showMarketSurface: true,
})

const marketContext = useMarketContext()
const symbolWatermark = computed(() => marketContext.currentSymbol.value)
</script>

<template>
  <div class="stage-backdrop">
    <img :src="appConfig.stageBackgroundUrl" alt="" class="stage-backdrop__image" loading="eager" decoding="async">

    <div class="stage-backdrop__wash" />
    <div class="stage-backdrop__grid" />

    <div class="stage-backdrop__symbol-watermark">
      {{ symbolWatermark }}
    </div>

    <StageMarketSurface v-if="props.showMarketSurface" class="stage-backdrop__market-surface" />
  </div>
</template>

<style scoped>
.stage-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.stage-backdrop__image,
.stage-backdrop__wash,
.stage-backdrop__grid,
.stage-backdrop__symbol-watermark {
  position: absolute;
  inset: 0;
}

.stage-backdrop__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.stage-backdrop__wash {
  z-index: 0;
  background:
    radial-gradient(circle at top right, rgba(30, 199, 255, 0.08), transparent 24%),
    radial-gradient(circle at 18% 24%, rgba(30, 199, 255, 0.04), transparent 22%),
    linear-gradient(180deg, rgba(1, 9, 20, 0.08), rgba(1, 9, 20, 0.62) 52%, rgba(1, 9, 20, 0.94));
}

.stage-backdrop__grid {
  z-index: 0;
  opacity: 0.34;
  background-image:
    linear-gradient(rgba(0, 175, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 175, 255, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.14));
}

.stage-backdrop__symbol-watermark {
  z-index: 0;
  inset: auto -16px auto auto;
  top: 32px;
  display: flex;
  justify-content: flex-end;
  color: rgba(165, 243, 252, 0.06);
  font-size: clamp(120px, 22vw, 360px);
  font-weight: 900;
  line-height: 0.9;
  letter-spacing: -0.08em;
  user-select: none;
}

.stage-backdrop__market-surface {
  position: absolute;
  top: 72px;
  left: 12px;
  z-index: 1;
  width: min(384px, calc(100vw - 24px));
  height: var(--stage-side-panel-height, 85dvh);
  max-height: var(--stage-side-panel-height, 85dvh);
}

@media (max-width: 1180px) {
  .stage-backdrop__market-surface {
    width: min(352px, calc(100vw - 24px));
  }
}
</style>
