import type { Ref } from 'vue'

import { ref, watch } from 'vue'

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function usePersistentState<T extends object>(key: string, defaults: T): Ref<T> {
  const state = ref(cloneValue(defaults)) as Ref<T>

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>
        state.value = {
          ...cloneValue(defaults),
          ...parsed,
        }
      }
    }
    catch (error) {
      console.warn(`Failed to restore local state for ${key}`, error)
    }

    watch(state, (value) => {
      window.localStorage.setItem(key, JSON.stringify(value))
    }, { deep: true })
  }

  return state
}
