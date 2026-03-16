<script setup lang="ts">
import { computed } from 'vue'

import { useMarketContext } from '@/modules/market/context'

const marketContext = useMarketContext()

const chartPath = computed(() => {
  const candles = marketContext.market.value?.data || []
  if (candles.length < 2)
    return ''

  const closes = candles.map(candle => candle.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const width = 720
  const height = 180
  const range = max - min || 1

  return closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width
      const y = height - ((close - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const chartAreaPath = computed(() => {
  const path = chartPath.value
  if (!path)
    return ''

  return `${path} L 720 180 L 0 180 Z`
})

const trendClass = computed(() =>
  (marketContext.market.value?.changePct || 0) >= 0 ? 'market-card__trend--up' : 'market-card__trend--down',
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
  <section class="panel market-card">
    <div class="market-card__header">
      <div>
        <p class="eyebrow">
          Market surface
        </p>
        <div class="market-card__title-row">
          <h2>{{ marketContext.currentSymbol.value }}</h2>
          <span :class="['market-card__trend', trendClass]">
            {{ formatChange(marketContext.market.value?.changePct) }}
          </span>
        </div>
      </div>

      <button
        class="surface-button surface-button--secondary market-card__refresh"
        :disabled="marketContext.loading.value"
        type="button"
        @click="marketContext.refreshMarketContext()"
      >
        {{ marketContext.loading.value ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <div class="market-card__quote">
      <strong>{{ formatUsd(marketContext.market.value?.price) }}</strong>
      <span>{{ marketContext.loading.value ? 'Syncing 15m context' : '15m market context' }}</span>
    </div>

    <div class="market-card__chart">
      <svg viewBox="0 0 720 180" preserveAspectRatio="none">
        <path v-if="chartAreaPath" :d="chartAreaPath" class="market-card__chart-area" />
        <path v-if="chartPath" :d="chartPath" class="market-card__chart-line" />
      </svg>
    </div>

    <p v-if="marketContext.error.value" class="market-card__error">
      {{ marketContext.error.value }}
    </p>

    <div class="market-card__stats">
      <article class="market-card__stat">
        <span>Session high</span>
        <strong>{{ formatUsd(marketContext.market.value?.high) }}</strong>
      </article>
      <article class="market-card__stat">
        <span>Session low</span>
        <strong>{{ formatUsd(marketContext.market.value?.low) }}</strong>
      </article>
      <article class="market-card__stat">
        <span>Funding</span>
        <strong>{{ marketContext.market.value?.funding?.toFixed(6) || '--' }}</strong>
      </article>
      <article class="market-card__stat">
        <span>Open interest</span>
        <strong>{{ marketContext.market.value?.openInterest?.toLocaleString() || '--' }}</strong>
      </article>
    </div>

    <div class="market-card__links">
      <a class="surface-link" :href="marketContext.pacificaTradeUrl.value" target="_blank" rel="noreferrer">Trade</a>
      <a class="surface-link" :href="marketContext.pacificaPortfolioUrl.value" target="_blank" rel="noreferrer">Portfolio</a>
      <a class="surface-link" :href="marketContext.pacificaDepositUrl.value" target="_blank" rel="noreferrer">Deposit</a>
      <a class="surface-link" :href="marketContext.pacificaWithdrawUrl.value" target="_blank" rel="noreferrer">Withdraw</a>
    </div>
  </section>
</template>

<style scoped>
.market-card {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.market-card__header,
.market-card__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.market-card__header {
  align-items: flex-start;
}

.market-card__title-row {
  margin-top: 10px;
}

.market-card__title-row h2 {
  margin: 0;
  font-size: 2rem;
  letter-spacing: -0.08em;
}

.market-card__refresh {
  min-height: 36px;
  padding: 0 14px;
}

.market-card__quote {
  display: grid;
  gap: 4px;
}

.market-card__quote strong {
  font-size: 1.28rem;
  letter-spacing: -0.04em;
}

.market-card__quote span {
  color: var(--text-2);
  font-size: 0.9rem;
}

.market-card__trend {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.88rem;
}

.market-card__trend--up {
  border-color: rgba(73, 211, 154, 0.2);
  background: rgba(16, 53, 40, 0.64);
  color: #cdf7e6;
}

.market-card__trend--down {
  border-color: rgba(255, 143, 155, 0.2);
  background: rgba(57, 20, 28, 0.64);
  color: #ffd5db;
}

.market-card__chart {
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(10, 28, 43, 0.68), rgba(5, 15, 25, 0.88));
  padding: 10px;
}

.market-card__chart svg {
  display: block;
  width: 100%;
  height: 140px;
}

.market-card__chart-area {
  fill: rgba(91, 214, 255, 0.1);
}

.market-card__chart-line {
  fill: none;
  stroke: #68e3ff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-card__error {
  margin: 0;
  color: #ffc9d0;
  font-size: 0.92rem;
}

.market-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.market-card__stat {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background: rgba(8, 20, 33, 0.42);
}

.market-card__stat span {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.market-card__stat strong {
  font-size: 0.96rem;
}

.market-card__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.market-card__links :deep(.surface-link) {
  min-height: 34px;
  padding: 0 12px;
}

@media (max-width: 760px) {
  .market-card__header,
  .market-card__title-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
