import { computed, reactive } from 'vue'

import { appConfig } from '@/config/app'
import { readStorage, writeStorage } from '@/lib/storage'

const STORAGE_KEY = 'airifica:avatar-lighting'

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

const DEFAULTS: LightingState = {
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

const stored = readStorage<Partial<LightingState> | null>(getStorageScope(), STORAGE_KEY, null)
const state = reactive<LightingState>({
  brightness: clampValue('brightness', stored?.brightness ?? DEFAULTS.brightness),
  contrast: clampValue('contrast', stored?.contrast ?? DEFAULTS.contrast),
  saturation: clampValue('saturation', stored?.saturation ?? DEFAULTS.saturation),
  exposure: clampValue('exposure', stored?.exposure ?? DEFAULTS.exposure),
  ambientIntensity: clampValue('ambientIntensity', stored?.ambientIntensity ?? DEFAULTS.ambientIntensity),
  hemisphereIntensity: clampValue('hemisphereIntensity', stored?.hemisphereIntensity ?? DEFAULTS.hemisphereIntensity),
  keyIntensity: clampValue('keyIntensity', stored?.keyIntensity ?? DEFAULTS.keyIntensity),
  rimIntensity: clampValue('rimIntensity', stored?.rimIntensity ?? DEFAULTS.rimIntensity),
  fillIntensity: clampValue('fillIntensity', stored?.fillIntensity ?? DEFAULTS.fillIntensity),
})

function persist() {
  writeStorage(getStorageScope(), STORAGE_KEY, { ...state })
}

function setValue(key: keyof LightingState, value: number) {
  state[key] = clampValue(key, value)
  persist()
}

function reset() {
  Object.assign(state, DEFAULTS)
  persist()
}

export function useAvatarLighting() {
  return {
    brightness: computed(() => state.brightness),
    contrast: computed(() => state.contrast),
    saturation: computed(() => state.saturation),
    exposure: computed(() => state.exposure),
    ambientIntensity: computed(() => state.ambientIntensity),
    hemisphereIntensity: computed(() => state.hemisphereIntensity),
    keyIntensity: computed(() => state.keyIntensity),
    rimIntensity: computed(() => state.rimIntensity),
    fillIntensity: computed(() => state.fillIntensity),
    setValue,
    reset,
  }
}
