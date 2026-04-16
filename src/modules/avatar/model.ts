import { computed, reactive } from 'vue'

import { appConfig } from '@/config/app'

type AvatarModelKey = 'air3' | 'pacifica'

const STORAGE_KEY = 'airifica.avatar-model'
const PACIFICA_AVATAR_URL = '/brand/Pacifica_VRM_Avatar.vrm'

function readStoredAvatarModel(): AvatarModelKey {
  if (typeof window === 'undefined')
    return 'air3'

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'pacifica' ? 'pacifica' : 'air3'
}

function persistAvatarModel(key: AvatarModelKey) {
  if (typeof window === 'undefined')
    return

  window.localStorage.setItem(STORAGE_KEY, key)
}

const state = reactive({
  selected: readStoredAvatarModel() as AvatarModelKey,
})

function setAvatarModel(key: AvatarModelKey) {
  state.selected = key
  persistAvatarModel(key)
}

function toggleAvatarModel() {
  setAvatarModel(state.selected === 'air3' ? 'pacifica' : 'air3')
}

export function useAvatarModelStore() {
  return {
    selectedKey: computed(() => state.selected),
    selectedLabel: computed(() => (state.selected === 'pacifica' ? 'Pacifica' : 'AIR3')),
    modelUrl: computed(() => (state.selected === 'pacifica'
      ? PACIFICA_AVATAR_URL
      : appConfig.avatarModelUrl || '/brand/AIR3_Dress_Final.vrm')),
    setAvatarModel,
    toggleAvatarModel,
  }
}

