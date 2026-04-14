import { computed, reactive } from 'vue'

type SpotCloseIntent = {
  mintAddress: string
  symbol: string
  marketQuery: string
  closePct: number
  source: 'telegram' | 'web'
}

const state = reactive({
  pending: null as SpotCloseIntent | null,
})

function normalizePct(value: number) {
  if (!Number.isFinite(value))
    return 100
  return Math.min(100, Math.max(1, Math.round(value)))
}

export function useSpotCloseIntent() {
  function setIntent(intent: SpotCloseIntent | null) {
    state.pending = intent
      ? {
          ...intent,
          closePct: normalizePct(intent.closePct),
        }
      : null
  }

  function clearIntent() {
    state.pending = null
  }

  return {
    pending: computed(() => state.pending),
    setIntent,
    clearIntent,
  }
}
