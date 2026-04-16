import { computed, reactive } from 'vue'

import { appConfig } from '@/config/app'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAvatarModelStore } from '@/modules/avatar/model'

type LightingState = {
  brightness: number
  contrast: number
  saturation: number
  exposure: number
  ambientIntensity: number
  hemisphereIntensity: number
  keyIntensity: number
  rimIntensity: number
  fillIntensity: number
}

type LightingProfileKey = 'air3' | 'pacifica'

type LightingProfiles = Record<LightingProfileKey, LightingState>

type LightingStoragePayload = {
  version: 2
  profiles: Partial<Record<LightingProfileKey, Partial<LightingState>>>
}

const STORAGE_KEY = 'airifica:avatar-lighting'

const AIR3_DEFAULTS: LightingState = {
  brightness: appConfig.stageBrightness,
  contrast: appConfig.stageContrast,
  saturation: appConfig.stageSaturation,
  exposure: appConfig.stageExposure,
  ambientIntensity: appConfig.stageAmbientIntensity,
  hemisphereIntensity: appConfig.stageHemisphereIntensity,
  keyIntensity: appConfig.stageKeyIntensity,
  rimIntensity: appConfig.stageRimIntensity,
  fillIntensity: appConfig.stageFillIntensity,
}

const PACIFICA_DEFAULTS: LightingState = {
  brightness: 0.8,
  contrast: 1.31,
  saturation: 1.2,
  exposure: 0.92,
  ambientIntensity: 0,
  hemisphereIntensity: 0.2,
  keyIntensity: 2.2,
  rimIntensity: 0,
  fillIntensity: 1.2,
}

const DEFAULTS: LightingProfiles = {
  air3: AIR3_DEFAULTS,
  pacifica: PACIFICA_DEFAULTS,
}

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function clampValue(key: keyof LightingState, value: number) {
  const ranges: Record<keyof LightingState, { min: number, max: number }> = {
    brightness: { min: 0.6, max: 1.6 },
    contrast: { min: 0.75, max: 1.45 },
    saturation: { min: 0.5, max: 1.5 },
    exposure: { min: 0.5, max: 1.7 },
    ambientIntensity: { min: 0, max: 1.6 },
    hemisphereIntensity: { min: 0, max: 2.2 },
    keyIntensity: { min: 0, max: 2.8 },
    rimIntensity: { min: 0, max: 1.4 },
    fillIntensity: { min: 0, max: 1.2 },
  }

  const range = ranges[key]
  return Math.min(range.max, Math.max(range.min, value))
}

function normalizeState(defaults: LightingState, source?: Partial<LightingState> | null): LightingState {
  return {
    brightness: clampValue('brightness', source?.brightness ?? defaults.brightness),
    contrast: clampValue('contrast', source?.contrast ?? defaults.contrast),
    saturation: clampValue('saturation', source?.saturation ?? defaults.saturation),
    exposure: clampValue('exposure', source?.exposure ?? defaults.exposure),
    ambientIntensity: clampValue('ambientIntensity', source?.ambientIntensity ?? defaults.ambientIntensity),
    hemisphereIntensity: clampValue('hemisphereIntensity', source?.hemisphereIntensity ?? defaults.hemisphereIntensity),
    keyIntensity: clampValue('keyIntensity', source?.keyIntensity ?? defaults.keyIntensity),
    rimIntensity: clampValue('rimIntensity', source?.rimIntensity ?? defaults.rimIntensity),
    fillIntensity: clampValue('fillIntensity', source?.fillIntensity ?? defaults.fillIntensity),
  }
}

function isLightingStoragePayload(value: LightingStoragePayload | Partial<LightingState>): value is LightingStoragePayload {
  return 'version' in value && value.version === 2 && 'profiles' in value
}

function resolveStoredProfiles() {
  const storedPayload = readStorage<LightingStoragePayload | Partial<LightingState> | null>(getStorageScope(), STORAGE_KEY, null)

  if (!storedPayload)
    return {
      air3: normalizeState(DEFAULTS.air3),
      pacifica: normalizeState(DEFAULTS.pacifica),
    }

  if (isLightingStoragePayload(storedPayload)) {
    return {
      air3: normalizeState(DEFAULTS.air3, storedPayload.profiles.air3),
      pacifica: normalizeState(DEFAULTS.pacifica, storedPayload.profiles.pacifica),
    }
  }

  return {
    air3: normalizeState(DEFAULTS.air3, storedPayload),
    pacifica: normalizeState(DEFAULTS.pacifica),
  }
}

const state = reactive<LightingProfiles>(resolveStoredProfiles())
const avatarModel = useAvatarModelStore()

function persist() {
  writeStorage(getStorageScope(), STORAGE_KEY, {
    version: 2,
    profiles: {
      air3: { ...state.air3 },
      pacifica: { ...state.pacifica },
    },
  } satisfies LightingStoragePayload)
}

function resolveActiveProfileKey(): LightingProfileKey {
  return avatarModel.selectedKey.value === 'pacifica' ? 'pacifica' : 'air3'
}

function setValue(key: keyof LightingState, value: number) {
  const profileKey = resolveActiveProfileKey()
  state[profileKey][key] = clampValue(key, value)
  persist()
}

function reset() {
  const profileKey = resolveActiveProfileKey()
  Object.assign(state[profileKey], DEFAULTS[profileKey])
  persist()
}

export function useAvatarLighting() {
  const activeProfile = computed(() => state[resolveActiveProfileKey()])

  return {
    brightness: computed(() => activeProfile.value.brightness),
    contrast: computed(() => activeProfile.value.contrast),
    saturation: computed(() => activeProfile.value.saturation),
    exposure: computed(() => activeProfile.value.exposure),
    ambientIntensity: computed(() => activeProfile.value.ambientIntensity),
    hemisphereIntensity: computed(() => activeProfile.value.hemisphereIntensity),
    keyIntensity: computed(() => activeProfile.value.keyIntensity),
    rimIntensity: computed(() => activeProfile.value.rimIntensity),
    fillIntensity: computed(() => activeProfile.value.fillIntensity),
    setValue,
    reset,
  }
}
