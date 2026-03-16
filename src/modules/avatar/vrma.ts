import { computed, reactive } from 'vue'

import { BREATH_URL, NO_ANIM_URL, animationUrls } from '@airifica/avatar3d'

type AnimationOption = {
  label: string
  url: string
}

const AUTO_ALIASES = new Set(['auto', 'procedural_idle', 'idle_loop', 'breath'])
const OFF_ALIASES = new Set(['none', 'no anim', 'no_anim', 'off'])

export const VRMA_LIST: AnimationOption[] = [
  { label: 'no anim', url: NO_ANIM_URL },
  { label: 'breath', url: BREATH_URL },
  { label: 'DanceStepping', url: animationUrls.DanceStepping },
  { label: 'DanceArmWave', url: animationUrls.DanceArmWave },
  { label: 'DanceHipSwing', url: animationUrls.DanceHipSwing },
  { label: 'BlingBangBangBorn', url: animationUrls.BlingBangBangBorn },
  { label: 'CherryPop', url: animationUrls.CherryPop },
  { label: 'LoveScream', url: animationUrls.LoveScream },
]

const state = reactive({
  selectedVRMAUrl: BREATH_URL,
  selectedVRMALabel: 'breath',
})

function select(label: string | null) {
  const normalized = String(label || '').trim()
  const lowered = normalized.toLowerCase()

  if (!normalized || AUTO_ALIASES.has(lowered)) {
    state.selectedVRMAUrl = BREATH_URL
    state.selectedVRMALabel = 'breath'
    return
  }

  if (OFF_ALIASES.has(lowered)) {
    state.selectedVRMAUrl = NO_ANIM_URL
    state.selectedVRMALabel = 'no anim'
    return
  }

  const found = VRMA_LIST.find(option => option.label === normalized)
  if (!found)
    return

  state.selectedVRMAUrl = found.url
  state.selectedVRMALabel = found.label
}

export function useVRMAStore() {
  return {
    selectedVRMAUrl: computed(() => state.selectedVRMAUrl),
    selectedVRMALabel: computed(() => state.selectedVRMALabel),
    select,
  }
}
