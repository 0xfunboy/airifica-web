import { computed, reactive } from 'vue'

const state = reactive({
  draft: '',
  focusToken: 0,
})

export function useConversationComposer() {
  function setDraft(value: string) {
    state.draft = value
  }

  function clearDraft() {
    state.draft = ''
  }

  function requestFocus() {
    state.focusToken = Date.now()
  }

  function applyExample(prompt: string) {
    state.draft = prompt
    requestFocus()
  }

  return {
    draft: computed({
      get: () => state.draft,
      set: (value: string) => setDraft(value),
    }),
    focusToken: computed(() => state.focusToken),
    clearDraft,
    applyExample,
  }
}
