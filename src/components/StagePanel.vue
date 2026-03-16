<script setup lang="ts">
import type { Air3MarketContext } from '@airifica/air3-client'
import type { AvatarExpression } from '@airifica/avatar3d'

import { computed, defineAsyncComponent } from 'vue'

import { formatCompact, formatCurrency, formatPercent, formatRelativeMinutes } from '../utils/format'

const AvatarStage = defineAsyncComponent(() =>
  import('@airifica/avatar3d').then(module => module.AvatarStage),
)

const props = defineProps<{
  modelUrl: string | null
  modelLabel: string
  modelSource: 'remote' | 'file'
  speaking: boolean
  expression: AvatarExpression
  market: Air3MarketContext | null
  marketLoading: boolean
  marketError: string
}>()

const emit = defineEmits<{
  (event: 'refresh-market'): void
}>()

const marketTone = computed(() => {
  if (!props.market)
    return ''

  return props.market.changePct >= 0 ? 'stage-panel__tone--up' : 'stage-panel__tone--down'
})

const chartPath = computed(() => {
  const candles = props.market?.data || []
  if (candles.length < 2)
    return ''

  const closes = candles.map(candle => candle.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const width = 280
  const height = 88

  return closes.map((close, index) => {
    const x = (index / (closes.length - 1)) * width
    const y = height - ((close - min) / range) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
})

const chartAreaPath = computed(() => {
  if (!chartPath.value)
    return ''

  return `${chartPath.value} L 280 88 L 0 88 Z`
})
</script>

<template>
  <section class="panel stage-panel">
    <header class="panel__header">
      <div>
        <p class="panel__eyebrow">
          Avatar runtime
        </p>
        <h2 class="panel__title">
          Stage surface
        </h2>
      </div>
      <button class="button button--ghost" type="button" @click="emit('refresh-market')">
        {{ marketLoading ? 'Refreshing...' : 'Refresh market' }}
      </button>
    </header>

    <AvatarStage
      :model-url="modelUrl"
      :speaking="speaking"
      :expression="expression"
    />

    <div class="stage-panel__grid">
      <article class="stage-panel__card">
        <p class="panel__eyebrow">
          Model source
        </p>
        <strong>{{ modelSource === 'file' ? 'Imported VRM' : 'Remote VRM' }}</strong>
        <p>{{ modelLabel }}</p>
      </article>

      <article class="stage-panel__card" :class="marketTone">
        <p class="panel__eyebrow">
          Market focus
        </p>
        <template v-if="market">
          <strong>{{ market.symbol }} · {{ formatCurrency(market.price) }}</strong>
          <p>{{ formatPercent(market.changePct) }} · {{ formatRelativeMinutes(market.updatedAt) }}</p>
          <small>OI {{ formatCompact(market.openInterest) }} · Funding {{ market.funding ?? '--' }}</small>
          <svg v-if="chartPath" class="stage-panel__chart" viewBox="0 0 280 88" preserveAspectRatio="none" aria-hidden="true">
            <path class="stage-panel__chart-area" :d="chartAreaPath" />
            <path class="stage-panel__chart-line" :d="chartPath" />
          </svg>
        </template>
        <template v-else>
          <strong>No market snapshot</strong>
          <p>{{ marketError || 'Set a service API URL to enable the market panel.' }}</p>
        </template>
      </article>
    </div>
  </section>
</template>

<style scoped>
.stage-panel {
  display: grid;
  gap: 1.25rem;
}

.stage-panel__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stage-panel__card {
  display: grid;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 1.1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
}

.stage-panel__card strong {
  font-size: 1rem;
  color: #f8fafc;
}

.stage-panel__card p,
.stage-panel__card small {
  margin: 0;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.5;
}

.stage-panel__chart {
  width: 100%;
  height: 5rem;
  margin-top: 0.3rem;
}

.stage-panel__chart-area {
  fill: rgba(125, 211, 252, 0.14);
}

.stage-panel__chart-line {
  fill: none;
  stroke: rgba(186, 230, 253, 0.92);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.stage-panel__tone--up {
  border-color: rgba(74, 222, 128, 0.24);
}

.stage-panel__tone--down {
  border-color: rgba(248, 113, 113, 0.24);
}

.stage-panel__tone--up .stage-panel__chart-area {
  fill: rgba(74, 222, 128, 0.16);
}

.stage-panel__tone--up .stage-panel__chart-line {
  stroke: rgba(134, 239, 172, 0.92);
}

.stage-panel__tone--down .stage-panel__chart-area {
  fill: rgba(248, 113, 113, 0.14);
}

.stage-panel__tone--down .stage-panel__chart-line {
  stroke: rgba(252, 165, 165, 0.92);
}

@media (max-width: 960px) {
  .stage-panel__grid {
    grid-template-columns: 1fr;
  }
}
</style>
