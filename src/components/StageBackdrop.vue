<script setup lang="ts">
import { computed } from 'vue'

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
    <div class="stage-backdrop__watermark">
      {{ marketContext.currentSymbol.value }}
    </div>

    <div class="stage-backdrop__panel">
      <span class="stage-backdrop__eyebrow">Pacifica surface</span>
      <strong>{{ marketContext.currentSymbol.value }}</strong>
      <p>{{ formatUsd(marketContext.market.value?.price) }} · {{ formatChange(marketContext.market.value?.changePct) }}</p>
      <span class="stage-backdrop__status">{{ readinessLabel }}</span>
      <a :href="marketContext.pacificaTradeUrl.value" target="_blank" rel="noreferrer">Open market</a>
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

.stage-backdrop__watermark {
  position: absolute;
  top: 18px;
  right: 20px;
  color: rgba(196, 236, 255, 0.08);
  font-size: clamp(4rem, 14vw, 12rem);
  font-weight: 800;
  letter-spacing: -0.08em;
  line-height: 0.9;
}

.stage-backdrop__panel {
  position: absolute;
  top: 22px;
  left: 22px;
  display: grid;
  gap: 10px;
  width: min(320px, calc(100% - 44px));
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background: rgba(6, 20, 33, 0.68);
  backdrop-filter: blur(18px);
  pointer-events: auto;
}

.stage-backdrop__eyebrow {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.stage-backdrop__panel strong {
  font-size: 2rem;
  letter-spacing: -0.05em;
}

.stage-backdrop__panel p {
  margin: 0;
  color: var(--text-1);
}

.stage-backdrop__status {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(91, 214, 255, 0.12);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
}

.stage-backdrop__panel a {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
  text-decoration: none;
}

@media (max-width: 760px) {
  .stage-backdrop__panel {
    top: 14px;
    left: 14px;
    width: min(280px, calc(100% - 28px));
  }
}
</style>
