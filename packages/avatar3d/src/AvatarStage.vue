<script setup lang="ts">
import type { AvatarExpression } from './types'

import type { AnimationAction, AnimationClip, Object3D } from 'three'

import {
  AmbientLight,
  AnimationMixer,
  AnimationUtils,
  Box3,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Quaternion,
  QuaternionKeyframeTrack,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  VRMHumanBoneName,
  VRMLookAtBoneApplier,
  VRMLookAtRangeMap,
  VRMUtils,
  type VRM,
} from '@pixiv/three-vrm'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { animationUrls, BREATH_SOURCE_URL, BREATH_URL, NO_ANIM_URL } from './assets'
import { clipFromVRMAnimation, ensureLookAtTarget, loadVRMAnimation, reAnchorRootPositionTrack, useBlink, useIdleEyeSaccades } from './animation'
import { useVRMLoader } from './loader'
import { createBreathClip } from './proceduralIdle'

const props = withDefaults(defineProps<{
  modelUrl?: string | null
  speaking?: boolean
  manualMouthOpen?: number
  expression?: AvatarExpression
  ambientAnimation?: string
}>(), {
  modelUrl: null,
  speaking: false,
  manualMouthOpen: 0,
  expression: 'neutral',
  ambientAnimation: BREATH_URL,
})

const emit = defineEmits<{
  (event: 'load-start'): void
  (event: 'load-progress', value: number): void
  (event: 'load-finish'): void
  (event: 'error', error: unknown): void
}>()

type ResolvedExpressions = {
  aa: string | null
  ee: string | null
  ih: string | null
  oh: string | null
  ou: string | null
  happy: string | null
  sad: string | null
  angry: string | null
  surprised: string | null
  relaxed: string | null
}

type BreathGestureRuntime = {
  key: string
  label: string
  sourceUrl: string
  excerptSeconds?: number
  intervalSeconds: number
  fadeInSeconds: number
  fadeOutSeconds: number
  action: AnimationAction | null
  nextTriggerAt: number
  endsAt: number | null
  fadeOutAt: number | null
  activeFadeInSeconds: number
  activeFadeOutSeconds: number
  fadeOutStarted: boolean
}

const BREATH_GESTURE_SPECS = [
  {
    key: 'bling-bang-bang-born',
    label: 'BlingBangBangBorn',
    sourceUrl: animationUrls.BlingBangBangBorn,
    excerptSeconds: 4,
    intervalSeconds: 125,
    fadeInSeconds: 0.75,
    fadeOutSeconds: 1.1,
  },
  {
    key: 'cherry-pop',
    label: 'CherryPop',
    sourceUrl: animationUrls.CherryPop,
    excerptSeconds: 2.5,
    intervalSeconds: 25,
    fadeInSeconds: 0.6,
    fadeOutSeconds: 0.9,
  },
  {
    key: 'love-scream',
    label: 'LoveScream',
    sourceUrl: animationUrls.LoveScream,
    excerptSeconds: 3,
    intervalSeconds: 33,
    fadeInSeconds: 0.55,
    fadeOutSeconds: 0.85,
  },
  {
    key: 'dance-arm-wave',
    label: 'DanceArmWave',
    sourceUrl: animationUrls.DanceArmWave,
    intervalSeconds: 307,
    fadeInSeconds: 0.8,
    fadeOutSeconds: 1.2,
  },
  {
    key: 'dance-hip-swing',
    label: 'DanceHipSwing',
    sourceUrl: animationUrls.DanceHipSwing,
    intervalSeconds: 543,
    fadeInSeconds: 0.9,
    fadeOutSeconds: 1.3,
  },
] as const

const hostRef = ref<HTMLDivElement | null>(null)
const rendererRef = shallowRef<WebGLRenderer>()
const cameraRef = shallowRef<PerspectiveCamera>()
const sceneRef = shallowRef<Scene>()
const avatarGroupRef = shallowRef<Group>()
const vrmRef = shallowRef<VRM | null>(null)
const animationMixerRef = shallowRef<AnimationMixer>()
const status = ref<'empty' | 'loading' | 'ready' | 'error'>('empty')
const errorMessage = ref('')
const loadProgress = ref(0)
const overlayLabel = computed(() => {
  if (status.value === 'loading')
    return 'Preparing AIR3 avatar runtime'
  if (status.value === 'error')
    return errorMessage.value || 'Unable to mount the AIR3 avatar'
  return 'AIR3 stage runtime ready'
})

const clock = new Clock()
const pointer = new Vector2(0, 0)
const raycaster = new Raycaster()
const focusTarget = { x: 0, y: 1.45, z: 2.2 }
const modelHeadHeight = ref(1.45)
const pointerActive = ref(false)
const frameHandle = ref<number>()
const animationCache = new Map<string, AnimationClip>()
const gestureClipCache = new Map<string, AnimationClip>()
const gestureClipPromises = new Map<string, Promise<AnimationClip | null>>()
const activeAnimationUrl = ref<string | null>(null)
const activeAnimationAction = shallowRef<AnimationAction | null>(null)
const resolvedExpressions = ref<ResolvedExpressions | null>(null)
const lookAtBuffer = new Vector3()
const trackingEuler = new Euler()
const trackingDeltaQuaternion = new Quaternion()
const trackingBaseQuaternion = new Quaternion()
const emotionState = {
  happy: 0,
  sad: 0,
  angry: 0,
  surprised: 0,
  relaxed: 0,
}
const secondaryTrackingState = {
  chestYaw: 0,
  chestPitch: 0,
  upperChestYaw: 0,
  upperChestPitch: 0,
  neckYaw: 0,
  neckPitch: 0,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  shoulderYaw: 0,
  shoulderRoll: 0,
}
let resizeObserver: ResizeObserver | undefined
let activeLoadToken = 0
let pointerIdleTimer: ReturnType<typeof setTimeout> | undefined
let ambientRequestId = 0
let breathGestureSessionId = 0
let breathGestureElapsedSeconds = 0
let breathGestureRuntimes: BreathGestureRuntime[] = []

const blink = useBlink()
const idleEyeSaccades = useIdleEyeSaccades()

function resolveExpressionName(map: Record<string, unknown>, ...candidates: string[]) {
  const available = Object.keys(map)
  for (const candidate of candidates) {
    if (candidate in map)
      return candidate

    const caseInsensitiveMatch = available.find(name => name.toLowerCase() === candidate.toLowerCase())
    if (caseInsensitiveMatch)
      return caseInsensitiveMatch
  }

  return null
}

function resolveExpressionBindings(vrm: VRM): ResolvedExpressions {
  const map = vrm.expressionManager?.expressionMap || {}
  return {
    aa: resolveExpressionName(map, 'aa', 'A', 'a'),
    ee: resolveExpressionName(map, 'ee', 'E', 'e'),
    ih: resolveExpressionName(map, 'ih', 'I', 'i'),
    oh: resolveExpressionName(map, 'oh', 'O', 'o'),
    ou: resolveExpressionName(map, 'ou', 'U', 'u'),
    happy: resolveExpressionName(map, 'happy', 'joy', 'fun'),
    sad: resolveExpressionName(map, 'sad', 'sorrow'),
    angry: resolveExpressionName(map, 'angry'),
    surprised: resolveExpressionName(map, 'surprised', 'Surprised'),
    relaxed: resolveExpressionName(map, 'relaxed', 'neutral', 'Neutral'),
  }
}

function installCorrectLookAtBoneApplier(vrm: VRM) {
  if (!vrm.lookAt || !vrm.humanoid)
    return

  const leftEye = vrm.humanoid.getRawBoneNode('leftEye')
  const rightEye = vrm.humanoid.getRawBoneNode('rightEye')
  if (!leftEye || !rightEye)
    return

  const horizontalRange = new VRMLookAtRangeMap(15, 12)
  const verticalRange = new VRMLookAtRangeMap(15, 8)

  const applier = new VRMLookAtBoneApplier(
    vrm.humanoid,
    horizontalRange,
    horizontalRange,
    verticalRange,
    verticalRange,
  )

  ;(vrm.lookAt as any).applier = applier
  vrm.lookAt.autoUpdate = true
}

function setPointerActivity(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  pointerActive.value = true

  if (pointerIdleTimer)
    clearTimeout(pointerIdleTimer)

  pointerIdleTimer = setTimeout(() => {
    pointerActive.value = false
  }, 140)
}

function resetPointerActivity() {
  pointerActive.value = false
  pointer.set(0, 0)
  if (pointerIdleTimer)
    clearTimeout(pointerIdleTimer)
}

function setupStage() {
  if (!hostRef.value || rendererRef.value)
    return

  const scene = new Scene()
  scene.background = null

  const camera = new PerspectiveCamera(32, 1, 0.01, 100)
  camera.position.set(0, 1.45, 2.35)

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = false
  renderer.domElement.className = 'avatar-stage__canvas'

  const ambient = new AmbientLight(new Color('#f5f8fc'), 0.78)
  const hemi = new HemisphereLight(new Color('#f4fbff'), new Color('#0a1420'), 1.2)
  const key = new DirectionalLight(new Color('#ffffff'), 1.58)
  key.position.set(2.2, 3.6, 2.4)
  const rim = new DirectionalLight(new Color('#8be7ff'), 0.38)
  rim.position.set(-3.4, 2.2, -1.8)
  const fill = new DirectionalLight(new Color('#f0f7ff'), 0.22)
  fill.position.set(0, 1.2, 3.5)

  const floor = new Mesh(
    new CircleGeometry(1.65, 96),
    new MeshBasicMaterial({
      color: new Color('#67dcff'),
      opacity: 0.12,
      transparent: true,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.02

  scene.add(ambient, hemi, key, rim, fill, floor)

  hostRef.value.appendChild(renderer.domElement)
  sceneRef.value = scene
  cameraRef.value = camera
  rendererRef.value = renderer

  resizeObserver = new ResizeObserver(() => syncSize())
  resizeObserver.observe(hostRef.value)
  syncSize()
  animate()
}

function syncSize() {
  if (!hostRef.value || !rendererRef.value || !cameraRef.value)
    return

  const bounds = hostRef.value.getBoundingClientRect()
  if (!bounds.width || !bounds.height)
    return

  rendererRef.value.setSize(bounds.width, bounds.height, false)
  cameraRef.value.aspect = bounds.width / bounds.height
  cameraRef.value.updateProjectionMatrix()
}

function disposeAvatar() {
  activeAnimationAction.value?.stop()
  activeAnimationAction.value = null
  activeAnimationUrl.value = null
  animationMixerRef.value?.stopAllAction()
  animationMixerRef.value = undefined
  resetBreathGestureState()

  const vrm = vrmRef.value
  if (vrm?.lookAt?.target)
    vrm.lookAt.target.removeFromParent()

  const avatarGroup = avatarGroupRef.value
  if (avatarGroup) {
    sceneRef.value?.remove(avatarGroup)
    VRMUtils.deepDispose(avatarGroup as unknown as Object3D)
  }

  vrmRef.value = null
  avatarGroupRef.value = undefined
  resolvedExpressions.value = null
  animationCache.clear()
  gestureClipCache.clear()
  gestureClipPromises.clear()
}

function disposeStage() {
  if (frameHandle.value)
    cancelAnimationFrame(frameHandle.value)

  resizeObserver?.disconnect()
  resizeObserver = undefined
  disposeAvatar()

  if (rendererRef.value) {
    rendererRef.value.dispose()
    rendererRef.value.domElement.remove()
  }

  rendererRef.value = undefined
  cameraRef.value = undefined
  sceneRef.value = undefined
}

async function resolveAnimationClip(vrm: VRM, url: string) {
  const cached = animationCache.get(url)
  if (cached)
    return cached

  if (url === NO_ANIM_URL)
    return null

  if (url === BREATH_URL) {
    const source = await resolveAnimationClip(vrm, BREATH_SOURCE_URL)
    if (!source)
      return null

    const clip = createBreathClip(vrm, source)
    if (!clip)
      return null

    reAnchorRootPositionTrack(clip, vrm, { axes: { x: true, y: true, z: true } })
    animationCache.set(url, clip)
    return clip
  }

  const animation = await loadVRMAnimation(url)
  const clip = await clipFromVRMAnimation(vrm, animation || undefined)
  if (!clip)
    return null

  reAnchorRootPositionTrack(clip, vrm, { axes: { x: true, y: true, z: true } })
  animationCache.set(url, clip)
  return clip
}

function ensureAnimationMixer(vrm: VRM) {
  if (!animationMixerRef.value)
    animationMixerRef.value = new AnimationMixer(vrm.scene)

  return animationMixerRef.value
}

function createBreathGestureClip(sourceClip: AnimationClip, runtime: BreathGestureRuntime) {
  if (!runtime.excerptSeconds)
    return sourceClip.clone()

  const endFrame = Math.max(1, Math.round(runtime.excerptSeconds * 30))
  const clip = AnimationUtils.subclip(
    sourceClip,
    `${sourceClip.name || runtime.label}-${runtime.excerptSeconds}s`,
    0,
    endFrame,
    30,
  )
  clip.resetDuration()
  return clip
}

async function resolveBreathGestureClip(vrm: VRM, runtime: BreathGestureRuntime) {
  const cacheKey = `${runtime.key}:${runtime.excerptSeconds || 'full'}`
  const cached = gestureClipCache.get(cacheKey)
  if (cached)
    return cached

  const pending = gestureClipPromises.get(cacheKey)
  if (pending)
    return pending

  const clipPromise = (async () => {
    const sourceClip = await resolveAnimationClip(vrm, runtime.sourceUrl)
    if (!sourceClip)
      return null

    const clip = createBreathGestureClip(sourceClip, runtime)
    gestureClipCache.set(cacheKey, clip)
    return clip
  })().finally(() => {
    gestureClipPromises.delete(cacheKey)
  })

  gestureClipPromises.set(cacheKey, clipPromise)
  return clipPromise
}

async function applyAmbientAnimation(url: string | null | undefined) {
  const vrm = vrmRef.value
  if (!vrm)
    return

  const nextUrl = url || BREATH_URL
  const requestId = ++ambientRequestId
  if (activeAnimationUrl.value === nextUrl)
    return

  if (nextUrl === NO_ANIM_URL) {
    resetBreathGestureState()
    activeAnimationAction.value?.stop()
    activeAnimationAction.value = null
    activeAnimationUrl.value = nextUrl
    animationMixerRef.value?.stopAllAction()
    vrm.humanoid?.resetNormalizedPose()
    vrm.scene.updateMatrixWorld(true)
    return
  }

  const clip = await resolveAnimationClip(vrm, nextUrl)
  if (!clip || requestId !== ambientRequestId)
    return

  const mixer = ensureAnimationMixer(vrm)
  mixer.stopAllAction()
  vrm.humanoid?.resetNormalizedPose()
  vrm.scene.updateMatrixWorld(true)

  const nextAction = mixer.clipAction(clip)
  nextAction.enabled = true
  nextAction.paused = false
  nextAction.clampWhenFinished = false
  nextAction.setLoop(LoopRepeat, Infinity)
  nextAction.setEffectiveWeight(1)
  nextAction.reset()
  nextAction.play()

  activeAnimationAction.value = nextAction
  activeAnimationUrl.value = nextUrl

  if (nextUrl === BREATH_URL)
    initializeBreathGestureState(vrm)
  else
    resetBreathGestureState()
}

function stopBreathGestureAction(runtime: BreathGestureRuntime) {
  runtime.action?.stop()
  runtime.action = null
  runtime.endsAt = null
  runtime.fadeOutAt = null
  runtime.activeFadeInSeconds = 0
  runtime.activeFadeOutSeconds = 0
  runtime.fadeOutStarted = false
}

function resetBreathGestureState() {
  breathGestureSessionId += 1
  breathGestureElapsedSeconds = 0
  for (const runtime of breathGestureRuntimes)
    stopBreathGestureAction(runtime)
  breathGestureRuntimes = []
}

function initializeBreathGestureState(vrm?: VRM) {
  breathGestureSessionId += 1
  breathGestureElapsedSeconds = 0
  breathGestureRuntimes = BREATH_GESTURE_SPECS.map(spec => ({
    ...spec,
    action: null,
    nextTriggerAt: spec.intervalSeconds,
    endsAt: null,
    fadeOutAt: null,
    activeFadeInSeconds: 0,
    activeFadeOutSeconds: 0,
    fadeOutStarted: false,
  }))

  if (vrm) {
    for (const runtime of breathGestureRuntimes)
      void resolveBreathGestureClip(vrm, runtime)
  }
}

async function triggerBreathGesture(runtime: BreathGestureRuntime) {
  const vrm = vrmRef.value
  const mixer = animationMixerRef.value
  const sessionId = breathGestureSessionId
  if (!vrm || !mixer || activeAnimationUrl.value !== BREATH_URL)
    return

  const clip = await resolveBreathGestureClip(vrm, runtime)
  if (!clip || breathGestureSessionId !== sessionId || activeAnimationUrl.value !== BREATH_URL)
    return

  const activeFadeInSeconds = Math.min(runtime.fadeInSeconds, Math.max(0.18, clip.duration * 0.24))
  const activeFadeOutSeconds = runtime.key === 'dance-hip-swing'
    ? Math.min(runtime.fadeOutSeconds, Math.max(0.14, clip.duration * 0.16))
    : Math.min(runtime.fadeOutSeconds, Math.max(0.18, clip.duration * 0.3))
  const action = mixer.clipAction(clip)
  action.stop()
  action.enabled = true
  action.clampWhenFinished = false
  action.setLoop(LoopOnce, 1)
  action.setEffectiveTimeScale(1)
  action.reset()
  action.setEffectiveWeight(1)
  action.fadeIn(activeFadeInSeconds)
  action.play()

  runtime.action = action
  runtime.fadeOutStarted = false
  runtime.activeFadeInSeconds = activeFadeInSeconds
  runtime.activeFadeOutSeconds = activeFadeOutSeconds
  runtime.nextTriggerAt += runtime.intervalSeconds
  runtime.endsAt = breathGestureElapsedSeconds + clip.duration
  runtime.fadeOutAt = Math.max(breathGestureElapsedSeconds, runtime.endsAt - activeFadeOutSeconds)
}

function updateBreathGestures(delta: number) {
  if (activeAnimationUrl.value !== BREATH_URL) {
    if (breathGestureRuntimes.length > 0)
      resetBreathGestureState()
    return
  }

  if (!breathGestureRuntimes.length)
    initializeBreathGestureState(vrmRef.value || undefined)

  breathGestureElapsedSeconds += delta

  for (const runtime of breathGestureRuntimes) {
    if (!runtime.action)
      continue

    const action = runtime.action
    if (!runtime.fadeOutStarted && runtime.fadeOutAt !== null && breathGestureElapsedSeconds >= runtime.fadeOutAt) {
      action.fadeOut(runtime.activeFadeOutSeconds || runtime.fadeOutSeconds)
      runtime.fadeOutStarted = true
    }

    if (runtime.endsAt !== null && breathGestureElapsedSeconds >= runtime.endsAt + 0.05)
      stopBreathGestureAction(runtime)
  }

  if (breathGestureRuntimes.some(runtime => runtime.action))
    return

  const nextDueGesture = [...breathGestureRuntimes]
    .filter(runtime => breathGestureElapsedSeconds >= runtime.nextTriggerAt)
    .sort((left, right) => left.nextTriggerAt - right.nextTriggerAt)[0]

  if (!nextDueGesture)
    return

  void triggerBreathGesture(nextDueGesture)
}

function computeLookAtMouse() {
  const camera = cameraRef.value
  if (!camera)
    return resolveCameraTrackingTarget()

  raycaster.setFromCamera(pointer, camera)
  const planeZ = Math.max(0.3, camera.position.z * 0.5)
  const plane = new Plane(new Vector3(0, 0, 1), -planeZ)
  const intersection = new Vector3()
  if (!raycaster.ray.intersectPlane(plane, intersection))
    return resolveCameraTrackingTarget()

  return {
    x: intersection.x,
    y: intersection.y,
    z: intersection.z,
  }
}

function resolveCameraTrackingTarget() {
  const camera = cameraRef.value
  if (!camera) {
    return {
      x: 0,
      y: modelHeadHeight.value,
      z: 2.2,
    }
  }

  return {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  }
}

function resolveTrackingInput() {
  const camera = cameraRef.value
  if (pointerActive.value)
    return { x: pointer.x, y: pointer.y, influence: 1 }

  if (!camera) {
    return { x: 0, y: 0, influence: 0.35 }
  }

  const target = resolveCameraTrackingTarget()
  return {
    x: MathUtils.clamp(target.x / Math.max(0.42, camera.position.z * 0.16), -1, 1),
    y: MathUtils.clamp((target.y - modelHeadHeight.value) / Math.max(0.28, modelHeadHeight.value * 0.22), -1, 1),
    influence: 0.4,
  }
}

function applyEyeTracking(vrm: VRM, delta: number) {
  const target = pointerActive.value ? computeLookAtMouse() : resolveCameraTrackingTarget()
  focusTarget.x = target.x
  focusTarget.y = target.y
  focusTarget.z = target.z

  const lookTarget = ensureLookAtTarget(vrm)
  if (lookTarget) {
    lookAtBuffer.set(target.x, target.y, target.z)
    lookTarget.position.lerp(lookAtBuffer, Math.min(1, delta * (pointerActive.value ? 16 : 4.2)))
    lookTarget.updateMatrixWorld(true)
  }

  if (!pointerActive.value && lookTarget && lookTarget.position.distanceTo(lookAtBuffer) < 0.06)
    idleEyeSaccades.update(vrm, target, delta)
}

function applyAdditiveBoneOffset(bone: Object3D | null | undefined, pitch: number, yaw: number, roll = 0) {
  if (!bone)
    return

  trackingBaseQuaternion.copy(bone.quaternion)
  trackingEuler.set(pitch, yaw, roll, 'XYZ')
  trackingDeltaQuaternion.setFromEuler(trackingEuler)
  bone.quaternion.copy(trackingBaseQuaternion.multiply(trackingDeltaQuaternion))
}

function applyHeadTracking(vrm: VRM, delta: number) {
  const humanoid = vrm.humanoid
  if (!humanoid)
    return

  const tracking = resolveTrackingInput()
  const chest = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest)
  const upperChest = humanoid.getNormalizedBoneNode(VRMHumanBoneName.UpperChest)
  const leftShoulder = humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftShoulder)
  const rightShoulder = humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightShoulder)
  const neck = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Neck)
  const head = humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
  const sourceYaw = tracking.x * tracking.influence
  const sourcePitch = -tracking.y * tracking.influence
  const bodyLambda = pointerActive.value ? 8 : 1.35
  const neckLambda = pointerActive.value ? 9.4 : 1.2
  const headLambda = pointerActive.value ? 10.4 : 1.15

  secondaryTrackingState.chestYaw = MathUtils.damp(secondaryTrackingState.chestYaw, sourceYaw * 0.038, bodyLambda, delta)
  secondaryTrackingState.chestPitch = MathUtils.damp(secondaryTrackingState.chestPitch, sourcePitch * 0.024, bodyLambda, delta)
  secondaryTrackingState.upperChestYaw = MathUtils.damp(secondaryTrackingState.upperChestYaw, sourceYaw * 0.056, bodyLambda, delta)
  secondaryTrackingState.upperChestPitch = MathUtils.damp(secondaryTrackingState.upperChestPitch, sourcePitch * 0.034, bodyLambda, delta)
  secondaryTrackingState.neckYaw = MathUtils.damp(secondaryTrackingState.neckYaw, sourceYaw * 0.082, neckLambda, delta)
  secondaryTrackingState.neckPitch = MathUtils.damp(secondaryTrackingState.neckPitch, sourcePitch * 0.058, neckLambda, delta)
  secondaryTrackingState.headYaw = MathUtils.damp(secondaryTrackingState.headYaw, sourceYaw * 0.11, headLambda, delta)
  secondaryTrackingState.headPitch = MathUtils.damp(secondaryTrackingState.headPitch, sourcePitch * 0.082, headLambda, delta)
  secondaryTrackingState.headRoll = MathUtils.damp(secondaryTrackingState.headRoll, -sourceYaw * 0.018, headLambda, delta)
  secondaryTrackingState.shoulderYaw = MathUtils.damp(secondaryTrackingState.shoulderYaw, sourceYaw * 0.028, bodyLambda, delta)
  secondaryTrackingState.shoulderRoll = MathUtils.damp(secondaryTrackingState.shoulderRoll, sourceYaw * 0.024, bodyLambda, delta)

  applyAdditiveBoneOffset(chest, secondaryTrackingState.chestPitch, secondaryTrackingState.chestYaw)
  applyAdditiveBoneOffset(upperChest, secondaryTrackingState.upperChestPitch, secondaryTrackingState.upperChestYaw)
  applyAdditiveBoneOffset(leftShoulder, secondaryTrackingState.chestPitch * 0.18, secondaryTrackingState.shoulderYaw, secondaryTrackingState.shoulderRoll)
  applyAdditiveBoneOffset(rightShoulder, secondaryTrackingState.chestPitch * 0.18, secondaryTrackingState.shoulderYaw, -secondaryTrackingState.shoulderRoll)
  applyAdditiveBoneOffset(neck, secondaryTrackingState.neckPitch, secondaryTrackingState.neckYaw)
  applyAdditiveBoneOffset(head, secondaryTrackingState.headPitch, secondaryTrackingState.headYaw, secondaryTrackingState.headRoll)
}

function normalizeManualMouthOpen(value: number | undefined) {
  const numeric = Number(value || 0)
  if (Number.isNaN(numeric) || numeric <= 0)
    return 0
  if (numeric <= 1.25)
    return Math.max(0, Math.min(1, numeric))
  return Math.max(0, Math.min(1, numeric / 100))
}

function applySpeechExpressions(vrm: VRM, elapsed: number) {
  const manager = vrm.expressionManager
  const bindings = resolvedExpressions.value
  if (!manager || !bindings)
    return

  const manualStrength = normalizeManualMouthOpen(props.manualMouthOpen)
  const fallbackTalking = props.speaking ? (0.18 + (Math.sin(elapsed * 16) * 0.5 + 0.5) * 0.32) : 0
  const mouth = Math.max(manualStrength, fallbackTalking)
  const a = Math.min(0.82, mouth)
  const o = Math.min(0.58, mouth * 0.66)
  const i = Math.min(0.42, mouth * 0.34)

  if (bindings.aa)
    manager.setValue(bindings.aa, a)
  if (bindings.ou)
    manager.setValue(bindings.ou, o)
  if (bindings.oh)
    manager.setValue(bindings.oh, o * 0.82)
  if (bindings.ih)
    manager.setValue(bindings.ih, i)
  if (bindings.ee)
    manager.setValue(bindings.ee, i * 0.72)
}

function applyEmotionExpressions(vrm: VRM, delta: number) {
  const manager = vrm.expressionManager
  const bindings = resolvedExpressions.value
  if (!manager || !bindings)
    return

  const targets = {
    happy: props.expression === 'happy' ? 1 : 0,
    sad: props.expression === 'sad' ? 1 : 0,
    angry: props.expression === 'angry' ? 1 : 0,
    surprised: props.expression === 'surprised' ? 1 : 0,
    relaxed: props.expression === 'think' ? 0.84 : props.expression === 'neutral' ? 0.42 : 0.1,
  }

  emotionState.happy = MathUtils.lerp(emotionState.happy, targets.happy, Math.min(1, delta * 4.2))
  emotionState.sad = MathUtils.lerp(emotionState.sad, targets.sad, Math.min(1, delta * 4.2))
  emotionState.angry = MathUtils.lerp(emotionState.angry, targets.angry, Math.min(1, delta * 4.2))
  emotionState.surprised = MathUtils.lerp(emotionState.surprised, targets.surprised, Math.min(1, delta * 5.4))
  emotionState.relaxed = MathUtils.lerp(emotionState.relaxed, targets.relaxed, Math.min(1, delta * 3.4))

  if (bindings.happy)
    manager.setValue(bindings.happy, emotionState.happy)
  if (bindings.sad)
    manager.setValue(bindings.sad, emotionState.sad)
  if (bindings.angry)
    manager.setValue(bindings.angry, emotionState.angry)
  if (bindings.surprised)
    manager.setValue(bindings.surprised, emotionState.surprised)
  if (bindings.relaxed)
    manager.setValue(bindings.relaxed, emotionState.relaxed)
}

async function loadAvatar(url: string | null | undefined) {
  activeLoadToken += 1
  const loadToken = activeLoadToken
  ambientRequestId += 1
  disposeAvatar()

  if (!url) {
    status.value = 'empty'
    errorMessage.value = ''
    loadProgress.value = 0
    emit('load-progress', 0)
    return
  }

  status.value = 'loading'
  errorMessage.value = ''
  loadProgress.value = 0
  emit('load-start')
  emit('load-progress', 0)

  const loader = useVRMLoader()
  try {
    const gltf = await loader.loadAsync(url, progress => {
      if (!progress.total)
        return
      loadProgress.value = Math.round((progress.loaded / progress.total) * 100)
      emit('load-progress', loadProgress.value)
    })

    if (loadToken !== activeLoadToken)
      return

    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm)
      throw new Error('The selected file does not expose a VRM runtime.')

    installCorrectLookAtBoneApplier(vrm)
    VRMUtils.removeUnnecessaryVertices(vrm.scene)
    VRMUtils.removeUnnecessaryJoints(vrm.scene)
    VRMUtils.combineSkeletons(vrm.scene)

    vrm.scene.traverse((object) => {
      object.frustumCulled = false
    })

    const avatarGroup = new Group()
    avatarGroup.add(vrm.scene)

    const bounds = new Box3().setFromObject(vrm.scene)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())

    vrm.scene.position.x -= center.x
    vrm.scene.position.z -= center.z
    vrm.scene.position.y -= bounds.min.y

    modelHeadHeight.value = size.y * 0.78
    focusTarget.x = 0
    focusTarget.y = modelHeadHeight.value
    focusTarget.z = Math.max(0.6, size.z * 0.65)

    if (cameraRef.value) {
      const distance = Math.max(size.x, size.y * 0.68, size.z) * 1.52
      cameraRef.value.position.set(0, modelHeadHeight.value, Math.max(1.72, distance))
      cameraRef.value.lookAt(0, modelHeadHeight.value, 0)
    }

    ensureLookAtTarget(vrm)
    resolvedExpressions.value = resolveExpressionBindings(vrm)

    avatarGroupRef.value = avatarGroup
    vrmRef.value = vrm
    sceneRef.value?.add(avatarGroup)
    status.value = 'ready'
    loadProgress.value = 100
    emit('load-progress', 100)
    emit('load-finish')

    await applyAmbientAnimation(props.ambientAnimation)
  }
  catch (error) {
    if (loadToken !== activeLoadToken)
      return

    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Unknown avatar error'
    emit('error', error)
  }
}

function animate() {
  const renderer = rendererRef.value
  const scene = sceneRef.value
  const camera = cameraRef.value
  if (!renderer || !scene || !camera)
    return

  const delta = clock.getDelta()
  const elapsed = clock.getElapsedTime()
  const vrm = vrmRef.value

  if (vrm) {
    animationMixerRef.value?.update(delta)
    updateBreathGestures(delta)
    applyEyeTracking(vrm, delta)
    applyHeadTracking(vrm, delta)
    applyEmotionExpressions(vrm, delta)
    applySpeechExpressions(vrm, elapsed)
    blink.update(vrm, delta)
    vrm.update(delta)
  }

  camera.lookAt(0, modelHeadHeight.value * 0.98, 0)
  renderer.render(scene, camera)
  frameHandle.value = requestAnimationFrame(animate)
}

watch(() => props.modelUrl, value => loadAvatar(value))
watch(() => props.ambientAnimation, value => {
  void applyAmbientAnimation(value)
})

onMounted(() => {
  setupStage()
  void loadAvatar(props.modelUrl)
  window.addEventListener('pointermove', setPointerActivity, { passive: true })
  window.addEventListener('blur', resetPointerActivity)
})

onBeforeUnmount(() => {
  activeLoadToken += 1
  ambientRequestId += 1
  disposeStage()
  resetPointerActivity()
  window.removeEventListener('pointermove', setPointerActivity)
  window.removeEventListener('blur', resetPointerActivity)
})
</script>

<template>
  <div ref="hostRef" class="avatar-stage">
    <div class="avatar-stage__floor" />

    <div v-if="status !== 'ready'" class="avatar-stage__overlay">
      <span class="avatar-stage__badge">
        {{ status === 'loading' ? `${loadProgress}%` : 'AIR3 stage' }}
      </span>
      <p class="avatar-stage__headline">
        {{ overlayLabel }}
      </p>
      <p class="avatar-stage__hint">
        Full VRM runtime with lookAt, blink, ambient animation and speech-driven mouth sync.
      </p>
    </div>
  </div>
</template>

<style scoped>
.avatar-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
}

:global(.avatar-stage__canvas) {
  display: block;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

.avatar-stage__floor {
  position: absolute;
  left: 50%;
  bottom: 6%;
  width: min(36vw, 460px);
  height: min(11vw, 140px);
  transform: translateX(-50%);
  border-radius: 999px;
  background: radial-gradient(circle at center, rgba(130, 220, 255, 0.22), rgba(130, 220, 255, 0.08) 42%, transparent 72%);
  filter: blur(14px);
  pointer-events: none;
  z-index: 0;
}

.avatar-stage__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: end;
  gap: 10px;
  padding: 28px;
  background: linear-gradient(180deg, rgba(2, 10, 18, 0.05), rgba(2, 10, 18, 0.7));
  pointer-events: none;
  z-index: 2;
}

.avatar-stage__badge {
  width: fit-content;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(137, 235, 255, 0.16);
  background: rgba(7, 21, 33, 0.62);
  color: rgba(216, 248, 255, 0.9);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
}

.avatar-stage__headline,
.avatar-stage__hint {
  margin: 0;
  max-width: 30rem;
}

.avatar-stage__headline {
  font-size: 1.08rem;
  line-height: 1.45;
  font-weight: 600;
}

.avatar-stage__hint {
  color: rgba(216, 229, 239, 0.72);
  line-height: 1.55;
}
</style>
