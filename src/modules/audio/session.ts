import { computed, reactive } from 'vue'

import { readStorage, writeStorage } from '@/lib/storage'

const INPUT_KEY = 'airifica:audio-input-id'

function getStorageScope() {
  return typeof window === 'undefined' ? null : window.localStorage
}

const state = reactive({
  availableInputs: [] as MediaDeviceInfo[],
  selectedInputId: readStorage<string>(getStorageScope(), INPUT_KEY, ''),
  stream: null as MediaStream | null,
  permissionGranted: false,
  enabled: false,
  volumeLevel: 0,
  error: null as string | null,
})

let initialized = false

function persistSelectedInput(deviceId: string) {
  state.selectedInputId = deviceId
  writeStorage(getStorageScope(), INPUT_KEY, deviceId)
}

async function refreshInputs() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices)
    return []

  const devices = await navigator.mediaDevices.enumerateDevices()
  state.availableInputs = devices.filter(device => device.kind === 'audioinput')

  if (!state.selectedInputId && state.availableInputs.length > 0) {
    const defaultDevice = state.availableInputs.find(device => device.deviceId === 'default') || state.availableInputs[0]
    if (defaultDevice)
      persistSelectedInput(defaultDevice.deviceId)
  }

  return state.availableInputs
}

async function ensureInitialized() {
  if (initialized || typeof navigator === 'undefined' || !navigator.mediaDevices)
    return

  initialized = true
  await refreshInputs()
  navigator.mediaDevices.addEventListener('devicechange', () => {
    void refreshInputs()
  })
}

async function startStream() {
  await ensureInitialized()

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Microphone access is unavailable in this browser.')

  if (state.stream)
    return state.stream

  state.error = null

  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: state.selectedInputId ? { exact: state.selectedInputId } : undefined,
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    state.stream = stream
    state.permissionGranted = true
    state.enabled = true
    await refreshInputs()
    return stream
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Unable to access the microphone.'
    throw error
  }
}

function stopStream() {
  state.stream?.getTracks().forEach(track => track.stop())
  state.stream = null
  state.enabled = false
  state.volumeLevel = 0
}

async function requestPermission() {
  const stream = await startStream()
  stopStream()
  state.permissionGranted = true
  return stream
}

async function setSelectedInput(deviceId: string) {
  persistSelectedInput(deviceId)
  if (!state.enabled)
    return

  stopStream()
  await startStream()
}

function setVolumeLevel(value: number) {
  state.volumeLevel = Math.max(0, Math.min(1, value))
}

export function useAudioSession() {
  void ensureInitialized()

  return {
    availableInputs: computed(() => state.availableInputs),
    selectedInputId: computed(() => state.selectedInputId),
    stream: computed(() => state.stream),
    permissionGranted: computed(() => state.permissionGranted),
    enabled: computed(() => state.enabled),
    volumeLevel: computed(() => state.volumeLevel),
    error: computed(() => state.error),
    refreshInputs,
    requestPermission,
    startStream,
    stopStream,
    setSelectedInput,
    setVolumeLevel,
  }
}
