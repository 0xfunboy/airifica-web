<script setup lang="ts">
import { computed } from 'vue'

import { appConfig } from '@/config/app'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'

const marketContext = useMarketContext()
const pacifica = usePacificaAccount()

const readinessLabel = computed(() => {
  if (pacifica.readyToExecute.value)
    return 'execution ready'
  if (pacifica.status.value.hasBinding)
    return 'builder pending'
  return 'wallet required'
})

const trendClass = computed(() =>
  (marketContext.market.value?.changePct || 0) >= 0 ? 'stage-backdrop__quote-change--up' : 'stage-backdrop__quote-change--down',
)

function formatUsd(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number(value) >= 100 ? 2 : 4,
  }).format(Number(value))
}

function formatChange(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numericValue = Number(value)
  return `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)}%`
}
</script>

<template>
  <div class="stage-backdrop">
    <img
      :src="appConfig.stageBackgroundUrl"
      alt=""
      class="stage-backdrop__image"
      loading="eager"
      decoding="async"
    >
    <div class="stage-backdrop__wash" />
    <div class="stage-backdrop__grid" />

    <div class="stage-backdrop__brand-mark">
      <img :src="appConfig.brandIconUrl" alt="">
    </div>

    <div class="stage-backdrop__watermark">
      {{ marketContext.currentSymbol.value }}
    </div>

    <div class="stage-backdrop__quicklook">
      <div class="stage-backdrop__quicklook-header">
        <span class="stage-backdrop__eyebrow">Pacifica market</span>
        <span class="stage-backdrop__status">{{ readinessLabel }}</span>
      </div>

      <strong class="stage-backdrop__symbol">
        {{ marketContext.currentSymbol.value }}
      </strong>

      <div class="stage-backdrop__quote">
        <span class="stage-backdrop__quote-price">{{ formatUsd(marketContext.market.value?.price) }}</span>
        <span :class="['stage-backdrop__quote-change', trendClass]">
          {{ formatChange(marketContext.market.value?.changePct) }}
        </span>
      </div>

      <div class="stage-backdrop__stats">
        <article>
          <span>Session high</span>
          <strong>{{ formatUsd(marketContext.market.value?.high) }}</strong>
        </article>
        <article>
          <span>Session low</span>
          <strong>{{ formatUsd(marketContext.market.value?.low) }}</strong>
        </article>
      </div>

      <a :href="marketContext.pacificaTradeUrl.value" target="_blank" rel="noreferrer">
        Open market
      </a>
    </div>
  </div>
</template>

<style scoped>
.stage-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.stage-backdrop__image,
.stage-backdrop__wash,
.stage-backdrop__grid {
  position: absolute;
  inset: 0;
}

.stage-backdrop__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stage-backdrop__wash {
  background:
    radial-gradient(circle at 72% 18%, rgba(68, 221, 255, 0.18), transparent 24%),
    radial-gradient(circle at 18% 28%, rgba(68, 221, 255, 0.14), transparent 26%),
    linear-gradient(180deg, rgba(1, 9, 20, 0.2), rgba(1, 11, 22, 0.7) 52%, rgba(1, 8, 17, 0.94));
}

.stage-backdrop__grid {
  opacity: 0.28;
  background-image:
    linear-gradient(rgba(0, 183, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 183, 255, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.1));
}

.stage-backdrop__brand-mark {
  position: absolute;
  top: 22px;
  right: 22px;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 24px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(6, 18, 30, 0.54);
  backdrop-filter: blur(18px);
}

.stage-backdrop__brand-mark img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  opacity: 0.9;
}

.stage-backdrop__watermark {
  position: absolute;
  right: 22px;
  bottom: 14px;
  color: rgba(202, 242, 255, 0.08);
  font-size: clamp(5rem, 12vw, 10rem);
  font-weight: 800;
  letter-spacing: -0.08em;
  line-height: 0.88;
}

.stage-backdrop__quicklook {
  position: absolute;
  top: 22px;
  left: 22px;
  display: grid;
  gap: 12px;
  width: min(310px, calc(100% - 44px));
  padding: 18px 18px 16px;
  border-radius: 24px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(5, 17, 28, 0.56);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.stage-backdrop__quicklook-header,
.stage-backdrop__quote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stage-backdrop__eyebrow {
  color: rgba(188, 214, 234, 0.76);
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.stage-backdrop__status {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(71, 201, 255, 0.12);
  color: #d7f7ff;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.stage-backdrop__symbol {
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  letter-spacing: -0.07em;
  line-height: 0.9;
}

.stage-backdrop__quote-price {
  font-size: 1.18rem;
  color: rgba(241, 248, 255, 0.94);
}

.stage-backdrop__quote-change {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.9rem;
}

.stage-backdrop__quote-change--up {
  border-color: rgba(80, 224, 173, 0.18);
  background: rgba(13, 57, 43, 0.56);
  color: #c5f6e2;
}

.stage-backdrop__quote-change--down {
  border-color: rgba(255, 143, 155, 0.18);
  background: rgba(58, 19, 29, 0.56);
  color: #ffd4da;
}

.stage-backdrop__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stage-backdrop__stats article {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background: rgba(8, 20, 33, 0.38);
}

.stage-backdrop__stats span {
  color: rgba(188, 214, 234, 0.7);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.stage-backdrop__stats strong {
  font-size: 0.95rem;
}

.stage-backdrop__quicklook a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(138, 218, 255, 0.16);
  background: rgba(8, 25, 39, 0.64);
  text-decoration: none;
}

@media (max-width: 760px) {
  .stage-backdrop__quicklook,
  .stage-backdrop__brand-mark {
    top: 14px;
  }

  .stage-backdrop__quicklook {
    left: 14px;
    width: min(280px, calc(100% - 28px));
  }

  .stage-backdrop__brand-mark {
    right: 14px;
    width: 58px;
    height: 58px;
    border-radius: 18px;
  }

  .stage-backdrop__brand-mark img {
    width: 30px;
    height: 30px;
  }

  .stage-backdrop__watermark {
    font-size: 4.4rem;
    right: 14px;
    bottom: 10px;
  }
}
</style>
