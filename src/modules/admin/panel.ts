import { computed, reactive } from 'vue'

type AdminTab = 'overview' | 'users' | 'trading' | 'telegram' | 'runtime'

const state = reactive({
  open: false,
  activeTab: 'overview' as AdminTab,
})

export function useAdminPanel() {
  return {
    open: computed(() => state.open),
    activeTab: computed(() => state.activeTab),
    openPanel(tab: AdminTab = 'overview') {
      state.activeTab = tab
      state.open = true
    },
    closePanel() {
      state.open = false
    },
    togglePanel() {
      state.open = !state.open
    },
    setTab(tab: AdminTab) {
      state.activeTab = tab
    },
  }
}
