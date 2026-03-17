<script setup lang="ts">
import { computed } from 'vue'

import type { StrategySummary } from '@/modules/trade/proposalFallback'

const props = defineProps<{
  summary: StrategySummary
}>()

const stanceTone = computed(() => {
  if (props.summary.stance === 'LONG') {
    return {
      label: 'LONG BIAS',
      style: {
        color: 'rgba(216, 255, 233, 0.96)',
        borderColor: 'rgba(34, 197, 94, 0.26)',
        background: 'rgba(11, 60, 36, 0.72)',
      },
    }
  }

  if (props.summary.stance === 'SHORT') {
    return {
      label: 'SHORT BIAS',
      style: {
        color: 'rgba(255, 235, 235, 0.96)',
        borderColor: 'rgba(239, 68, 68, 0.26)',
        background: 'rgba(80, 24, 24, 0.72)',
      },
    }
  }

  return {
    label: 'STAY OUT',
    style: {
      color: 'rgba(255, 244, 214, 0.96)',
      borderColor: 'rgba(250, 204, 21, 0.28)',
      background: 'rgba(88, 62, 12, 0.7)',
    },
  }
})
</script>

<template>
  <section class="strategy-summary">
    <header class="strategy-summary__header">
      <div class="strategy-summary__symbol-wrap">
        <strong>${{ summary.symbol }}</strong>
        <span>{{ summary.timeframe }}</span>
      </div>
      <span class="strategy-summary__stance" :style="stanceTone.style">
        {{ stanceTone.label }}
      </span>
    </header>

    <p class="strategy-summary__eyebrow">
      Action strategy
    </p>
    <p class="strategy-summary__thesis">
      {{ summary.thesis }}
    </p>

    <p v-if="summary.stance === 'STAY_OUT'" class="strategy-summary__note">
      No Pacifica trade is opened from this setup yet.
    </p>
  </section>
</template>

<style scoped>
.strategy-summary {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background:
    linear-gradient(180deg, rgba(8, 20, 31, 0.9), rgba(5, 14, 22, 0.82));
}

.strategy-summary__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.strategy-summary__symbol-wrap {
  display: grid;
  gap: 2px;
}

.strategy-summary__symbol-wrap strong {
  color: rgba(245, 250, 255, 0.96);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.strategy-summary__symbol-wrap span,
.strategy-summary__eyebrow,
.strategy-summary__note {
  color: rgba(180, 228, 246, 0.68);
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.strategy-summary__stance {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.strategy-summary__eyebrow,
.strategy-summary__note {
  margin: 0;
}

.strategy-summary__thesis {
  margin: 0;
  color: rgba(237, 246, 255, 0.9);
  font-size: 0.86rem;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
