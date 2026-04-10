<script setup lang="ts">
import { computed } from 'vue'

import { useMarketContext } from '@/modules/market/context'

const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const marketContext = useMarketContext()
const executionVenue = computed(() => marketContext.market.value?.executionVenue === 'jupiter' ? 'jupiter' : 'pacifica')
const href = computed(() => executionVenue.value === 'jupiter'
  ? marketContext.jupiterTradeUrl.value
  : marketContext.pacificaTradeUrl.value)
const label = computed(() => {
  if (props.compact)
    return marketContext.currentSymbol.value
  return `${executionVenue.value === 'jupiter' ? 'Jupiter' : 'Pacifica'} ${marketContext.currentSymbol.value}`
})
const visible = computed(() => executionVenue.value === 'jupiter'
  ? Boolean(marketContext.jupiterTradeUrl.value)
  : marketContext.market.value?.supportedOnPacifica !== false)
const title = computed(() => executionVenue.value === 'jupiter'
  ? `Open ${marketContext.currentSymbol.value} on Jupiter`
  : `Open ${marketContext.currentSymbol.value} on Pacifica`)
</script>

<template>
  <a
    v-if="visible"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="[
      'pacifica-trade-button',
      compact ? 'pacifica-trade-button--compact' : '',
      executionVenue === 'jupiter' ? 'pacifica-trade-button--jupiter' : '',
    ]"
    :title="title"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16 9.5 10.5l3 3L20 6" />
      <path d="M14 6h6v6" />
    </svg>
    <span>{{ label }}</span>
  </a>
</template>

<style scoped>
.pacifica-trade-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(8, 23, 35, 0.74);
  color: var(--text-0);
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 600;
  backdrop-filter: blur(16px);
  transition: transform 160ms ease, background-color 160ms ease;
}

.pacifica-trade-button:hover {
  transform: translateY(-1px);
  background: rgba(11, 31, 45, 0.86);
}

.pacifica-trade-button--compact {
  padding: 0 12px;
}

.pacifica-trade-button--jupiter {
  border-color: rgba(127, 246, 165, 0.2);
  background: rgba(9, 28, 28, 0.78);
}

.pacifica-trade-button--jupiter:hover {
  background: rgba(12, 38, 34, 0.9);
}

.pacifica-trade-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
