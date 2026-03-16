<script setup lang="ts">
import type { Air3MarketContext } from '@airifica/air3-client'
import type { AvatarExpression } from '@airifica/avatar3d'

import { AvatarStage } from '@airifica/avatar3d'

import { computed } from 'vue'

import { formatCompact, formatCurrency, formatPercent, formatRelativeMinutes } from '../utils/format'

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

.stage-panel__tone--up {
  border-color: rgba(74, 222, 128, 0.24);
}

.stage-panel__tone--down {
  border-color: rgba(248, 113, 113, 0.24);
}

@media (max-width: 960px) {
  .stage-panel__grid {
    grid-template-columns: 1fr;
  }
}
</style>

