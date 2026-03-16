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
  const height = 220
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

  return `${path} L 720 220 L 0 220 Z`
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
          Market context
        </p>
        <h2>{{ marketContext.currentSymbol.value }}</h2>
      </div>
      <button class="market-card__refresh" :disabled="marketContext.loading.value" @click="marketContext.refreshMarketContext()">
        {{ marketContext.loading.value ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <div class="market-card__quote">
      <strong>{{ formatUsd(marketContext.market.value?.price) }}</strong>
      <span :class="['market-card__trend', trendClass]">
        {{ formatChange(marketContext.market.value?.changePct) }}
      </span>
    </div>

    <div class="market-card__chart">
      <svg viewBox="0 0 720 220" preserveAspectRatio="none">
        <path v-if="chartAreaPath" :d="chartAreaPath" class="market-card__chart-area" />
        <path v-if="chartPath" :d="chartPath" class="market-card__chart-line" />
      </svg>
    </div>

    <p v-if="marketContext.error.value" class="market-card__error">
      {{ marketContext.error.value }}
    </p>

    <div class="market-card__stats">
      <article class="market-card__stat">
        <span>High</span>
        <strong>{{ formatUsd(marketContext.market.value?.high) }}</strong>
      </article>
      <article class="market-card__stat">
        <span>Low</span>
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
      <a :href="marketContext.pacificaTradeUrl.value" target="_blank" rel="noreferrer">Trade</a>
      <a :href="marketContext.pacificaPortfolioUrl.value" target="_blank" rel="noreferrer">Portfolio</a>
      <a :href="marketContext.pacificaDepositUrl.value" target="_blank" rel="noreferrer">Deposit</a>
      <a :href="marketContext.pacificaWithdrawUrl.value" target="_blank" rel="noreferrer">Withdraw</a>
    </div>
  </section>
</template>

<style scoped>
.market-card {
  padding: 22px;
  display: grid;
  gap: 18px;
}

.market-card__header,
.market-card__quote {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.market-card__header h2 {
  margin: 12px 0 0;
  font-size: 1.8rem;
}

.market-card__refresh {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
}

.market-card__quote strong {
  font-size: 1.9rem;
  letter-spacing: -0.05em;
}

.market-card__trend {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.market-card__trend--up {
  border-color: rgba(73, 211, 154, 0.16);
  background: rgba(18, 54, 43, 0.7);
  color: #c7f6e2;
}

.market-card__trend--down {
  border-color: rgba(255, 143, 155, 0.16);
  background: rgba(61, 21, 31, 0.58);
  color: #ffd4da;
}

.market-card__chart {
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(146, 198, 229, 0.1);
  background: rgba(8, 20, 33, 0.62);
  padding: 12px;
}

.market-card__chart svg {
  display: block;
  width: 100%;
  height: 220px;
}

.market-card__chart-area {
  fill: rgba(91, 214, 255, 0.08);
}

.market-card__chart-line {
  fill: none;
  stroke: #5bd6ff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.market-card__error {
  margin: 0;
  color: #ffc3cb;
}

.market-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.market-card__stat {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.1);
  background: rgba(8, 20, 33, 0.62);
}

.market-card__stat span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.market-card__links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.market-card__links a {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
  text-decoration: none;
}

@media (max-width: 760px) {
  .market-card__header,
  .market-card__quote {
    flex-direction: column;
  }

  .market-card__stats {
    grid-template-columns: 1fr;
  }
}
</style>
