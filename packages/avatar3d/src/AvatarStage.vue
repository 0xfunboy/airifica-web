<script setup lang="ts">
import type { AvatarExpression, SpeechVisemeWeights } from './types'

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

import { animationUrls, BREATH_ORGANIC_SOURCE_URL, BREATH_SOURCE_URL, BREATH_URL, NO_ANIM_URL } from './assets'
import { clipFromVRMAnimation, ensureLookAtTarget, loadVRMAnimation, reAnchorRootPositionTrack, useBlink, useIdleEyeSaccades } from './animation'
import { useVRMLoader } from './loader'
import { createBreathClip } from './proceduralIdle'

const props = withDefaults(defineProps<{
  modelUrl?: string | null
  speaking?: boolean
  manualMouthOpen?: number
  speechClosure?: number
  visemeWeights?: Partial<SpeechVisemeWeights> | null
  expression?: AvatarExpression
  ambientAnimation?: string
  brightness?: number
  contrast?: number
  saturation?: number
  exposure?: number
  ambientIntensity?: number
  hemisphereIntensity?: number
  keyIntensity?: number
  rimIntensity?: number
  fillIntensity?: number
}>(), {
  modelUrl: null,
  speaking: false,
  manualMouthOpen: 0,
  speechClosure: 0,
  visemeWeights: null,
  expression: 'neutral',
  ambientAnimation: BREATH_URL,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  exposure: 1,
  ambientIntensity: 0.78,
  hemisphereIntensity: 1.2,
  keyIntensity: 1.58,
  rimIntensity: 0.38,
  fillIntensity: 0.22,
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
  intervalMinSeconds: number
  intervalMaxSeconds: number
  fadeInSeconds: number
  fadeOutSeconds: number
  peakWeight?: number
  action: AnimationAction | null
  nextTriggerAt: number
  endsAt: number | null
  fadeOutAt: number | null
  activeFadeInSeconds: number
  activeFadeOutSeconds: number
  startedAt: number | null
  clipDuration: number
  fadeOutStarted: boolean
}

type LoadParticle = {
  x: number
  y: number
  previousX: number
  previousY: number
  velocityX: number
  velocityY: number
  targetX: number
  targetY: number
  driftX: number
  driftY: number
  shimmerOffset: number
  age: number
  duration: number
  radius: number
}

const BREATH_GESTURE_SPECS = [
  {
    key: 'bling-bang-bang-born',
    label: 'BlingBangBangBorn',
    sourceUrl: animationUrls.BlingBangBangBorn,
    excerptSeconds: 4,
    intervalMinSeconds: 54,
    intervalMaxSeconds: 74,
    fadeInSeconds: 0.75,
    fadeOutSeconds: 1.1,
  },
  {
    key: 'cherry-pop',
    label: 'CherryPop',
    sourceUrl: animationUrls.CherryPop,
    excerptSeconds: 2.5,
    intervalMinSeconds: 18,
    intervalMaxSeconds: 26,
    fadeInSeconds: 0.6,
    fadeOutSeconds: 0.9,
  },
  {
    key: 'love-scream',
    label: 'LoveScream',
    sourceUrl: animationUrls.LoveScream,
    excerptSeconds: 3,
    intervalMinSeconds: 24,
    intervalMaxSeconds: 34,
    fadeInSeconds: 0.55,
    fadeOutSeconds: 0.85,
  },
  {
    key: 'dance-arm-wave',
    label: 'DanceArmWave',
    sourceUrl: animationUrls.DanceArmWave,
    intervalMinSeconds: 38,
    intervalMaxSeconds: 58,
    fadeInSeconds: 0.8,
    fadeOutSeconds: 1.2,
  },
] as const

const hostRef = ref<HTMLDivElement | null>(null)
const loadFieldRef = ref<HTMLCanvasElement | null>(null)
const rendererRef = shallowRef<WebGLRenderer>()
const cameraRef = shallowRef<PerspectiveCamera>()
const sceneRef = shallowRef<Scene>()
const avatarGroupRef = shallowRef<Group>()
const vrmRef = shallowRef<VRM | null>(null)
const animationMixerRef = shallowRef<AnimationMixer>()
const ambientLightRef = shallowRef<AmbientLight>()
const hemisphereLightRef = shallowRef<HemisphereLight>()
const keyLightRef = shallowRef<DirectionalLight>()
const rimLightRef = shallowRef<DirectionalLight>()
const fillLightRef = shallowRef<DirectionalLight>()
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
const speechVisemeState: SpeechVisemeWeights = {
  A: 0,
  E: 0,
  I: 0,
  O: 0,
  U: 0,
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
let loadFieldSpawnAccumulator = 0
let loadFieldElapsed = 0
const loadFieldParticles: LoadParticle[] = []
const FACIAL_TRACK_PATTERN = /(expression|blendshape|morph|viseme|mouth|lip|jaw|tongue|teeth|cheek|brow|blink|eyelid)/i

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

function applyLightingControls() {
  if (rendererRef.value)
    rendererRef.value.domElement.style.filter = `brightness(${props.brightness}) contrast(${props.contrast}) saturate(${props.saturation})`

  const exposure = Math.max(0.1, props.exposure)
  if (ambientLightRef.value)
    ambientLightRef.value.intensity = props.ambientIntensity * exposure
  if (hemisphereLightRef.value)
    hemisphereLightRef.value.intensity = props.hemisphereIntensity * exposure
  if (keyLightRef.value)
    keyLightRef.value.intensity = props.keyIntensity * exposure
  if (rimLightRef.value)
    rimLightRef.value.intensity = props.rimIntensity * exposure
  if (fillLightRef.value)
    fillLightRef.value.intensity = props.fillIntensity * exposure
}

function stripFacialAnimationTracks(clip: AnimationClip) {
  const sanitizedTracks = clip.tracks.filter(track => !FACIAL_TRACK_PATTERN.test(track.name))
  if (sanitizedTracks.length === clip.tracks.length)
    return clip

  const sanitized = clip.clone()
  sanitized.tracks = sanitizedTracks.map(track => track.clone())
  sanitized.resetDuration()
  return sanitized
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
  ambientLightRef.value = ambient
  hemisphereLightRef.value = hemi
  keyLightRef.value = key
  rimLightRef.value = rim
  fillLightRef.value = fill
  applyLightingControls()

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
  syncLoadFieldSize(bounds.width, bounds.height)
}

function syncLoadFieldSize(width?: number, height?: number) {
  const canvas = loadFieldRef.value
  const host = hostRef.value
  if (!canvas || !host)
    return

  const bounds = width && height
    ? { width, height }
    : host.getBoundingClientRect()
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75)
  const targetWidth = Math.max(1, Math.round(bounds.width * pixelRatio))
  const targetHeight = Math.max(1, Math.round(bounds.height * pixelRatio))

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }

  canvas.style.width = `${bounds.width}px`
  canvas.style.height = `${bounds.height}px`
}

function resetLoadField() {
  loadFieldSpawnAccumulator = 0
  loadFieldElapsed = 0
  loadFieldParticles.length = 0

  const canvas = loadFieldRef.value
  const context = canvas?.getContext('2d')
  if (canvas && context)
    context.clearRect(0, 0, canvas.width, canvas.height)
}

function spawnLoadParticle(width: number, height: number) {
  const centerX = width * 0.5
  const centerY = height * 0.46
  const attractorWidth = width * 0.055
  const attractorHeight = height * 0.38
  const bandX = centerX + (Math.random() - 0.5) * attractorWidth
  const bandY = centerY + (Math.random() - 0.5) * attractorHeight
  const exclusionRadius = Math.min(width, height) * 0.26
  let x = 0
  let y = 0
  let distance = 0

  do {
    x = Math.random() * width
    y = Math.random() * height
    distance = Math.hypot(x - centerX, y - centerY)
  } while (distance < exclusionRadius)

  const duration = 0.48 + Math.random() * 0.95
  const speedBoost = 0.95 + Math.random() * 0.75
  loadFieldParticles.push({
    x,
    y,
    previousX: x,
    previousY: y,
    velocityX: (bandX - x) / duration * speedBoost,
    velocityY: (bandY - y) / duration * speedBoost,
    targetX: bandX,
    targetY: bandY,
    driftX: (Math.random() - 0.5) * width * 0.032,
    driftY: (Math.random() - 0.5) * height * 0.038,
    shimmerOffset: Math.random() * Math.PI * 2,
    age: 0,
    duration,
    radius: 0.95 + Math.random() * 2.8,
  })
}

function renderLoadField(delta: number) {
  const canvas = loadFieldRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context)
    return

  if (status.value === 'ready') {
    context.clearRect(0, 0, canvas.width, canvas.height)
    return
  }

  const width = canvas.width
  const height = canvas.height
  loadFieldElapsed += delta
  const progress = status.value === 'loading'
    ? Math.max(0.12, Math.min(1, loadProgress.value / 100 || 0.12))
    : 0.12
  const pulse = 0.5 + 0.5 * Math.sin(loadFieldElapsed * Math.PI)
  const pulseStrength = MathUtils.smootherstep(pulse, 0, 1)
  const spawnRate = 42 + progress * 88 + pulseStrength * 58
  loadFieldSpawnAccumulator += delta * spawnRate

  while (loadFieldSpawnAccumulator >= 1) {
    spawnLoadParticle(width, height)
    loadFieldSpawnAccumulator -= 1
  }

  context.clearRect(0, 0, width, height)
  context.save()
  context.globalCompositeOperation = 'lighter'

  const bandX = width * 0.5
  const bandCenterY = height * 0.46
  const bandOuterRadius = width * (0.15 + progress * 0.08 + pulseStrength * 0.03)
  const bandInnerRadius = bandOuterRadius * (0.06 + pulseStrength * 0.035)

  context.save()
  context.translate(bandX, bandCenterY)
  context.scale(0.31 + progress * 0.05 + pulseStrength * 0.05, 1)
  const outerGlow = context.createRadialGradient(0, 0, bandInnerRadius * 0.35, 0, 0, bandOuterRadius)
  outerGlow.addColorStop(0, `rgba(255, 246, 204, ${0.08 + progress * 0.16 + pulseStrength * 0.06})`)
  outerGlow.addColorStop(0.18, `rgba(170, 242, 255, ${0.1 + progress * 0.16 + pulseStrength * 0.05})`)
  outerGlow.addColorStop(0.42, `rgba(103, 232, 249, ${0.08 + progress * 0.14})`)
  outerGlow.addColorStop(0.72, `rgba(73, 212, 255, ${0.03 + progress * 0.06})`)
  outerGlow.addColorStop(1, 'rgba(103, 232, 249, 0)')
  context.fillStyle = outerGlow
  context.beginPath()
  context.arc(0, 0, bandOuterRadius, 0, Math.PI * 2)
  context.fill()
  context.restore()

  const slitHalfWidth = width * (0.012 + progress * 0.012 + pulseStrength * 0.01)
  const slitHalfHeight = height * (0.34 + progress * 0.05 + pulseStrength * 0.035)
  const slitGradient = context.createLinearGradient(bandX, bandCenterY - slitHalfHeight, bandX, bandCenterY + slitHalfHeight)
  slitGradient.addColorStop(0, 'rgba(103, 232, 249, 0)')
  slitGradient.addColorStop(0.12, `rgba(103, 232, 249, ${0.06 + progress * 0.08})`)
  slitGradient.addColorStop(0.3, `rgba(103, 232, 249, ${0.14 + progress * 0.16})`)
  slitGradient.addColorStop(0.5, `rgba(255, 247, 213, ${0.18 + progress * 0.22 + pulseStrength * 0.1})`)
  slitGradient.addColorStop(0.7, `rgba(103, 232, 249, ${0.14 + progress * 0.16})`)
  slitGradient.addColorStop(0.88, `rgba(103, 232, 249, ${0.06 + progress * 0.08})`)
  slitGradient.addColorStop(1, 'rgba(103, 232, 249, 0)')
  context.fillStyle = slitGradient
  context.beginPath()
  context.ellipse(bandX, bandCenterY, slitHalfWidth, slitHalfHeight, 0, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = `rgba(255, 250, 231, ${0.08 + progress * 0.14 + pulseStrength * 0.08})`
  context.beginPath()
  context.ellipse(bandX, bandCenterY, slitHalfWidth * 0.28, slitHalfHeight * 0.92, 0, 0, Math.PI * 2)
  context.fill()

  for (let index = loadFieldParticles.length - 1; index >= 0; index -= 1) {
    const particle = loadFieldParticles[index]
    particle.previousX = particle.x
    particle.previousY = particle.y
    particle.age += delta

    if (particle.age >= particle.duration) {
      loadFieldParticles.splice(index, 1)
      continue
    }

    const dx = particle.targetX - particle.x
    const dy = particle.targetY - particle.y
    const attraction = delta * (5.4 + progress * 6.4 + pulseStrength * 5.2)
    const sway = (1 - Math.min(1, particle.age / particle.duration)) * (0.8 + progress * 0.45)
    particle.velocityX += dx * attraction * 0.24
    particle.velocityY += dy * attraction * 0.24
    particle.velocityX *= 0.955
    particle.velocityY *= 0.955
    particle.x += particle.velocityX * delta + Math.sin(loadFieldElapsed * 3.8 + particle.shimmerOffset) * particle.driftX * delta * sway
    particle.y += particle.velocityY * delta + Math.cos(loadFieldElapsed * 3.2 + particle.shimmerOffset) * particle.driftY * delta * sway

    const t = Math.max(0, Math.min(1, particle.age / particle.duration))
    const distanceToTarget = Math.hypot(dx, dy)
    const proximity = 1 - Math.min(1, distanceToTarget / (width * 0.34))
    const intensity = MathUtils.smootherstep(t, 0.02, 0.96) * (0.38 + proximity * 1.45)
    const shimmer = 0.82 + 0.18 * Math.sin(loadFieldElapsed * 7.4 + particle.shimmerOffset)
    const alpha = (0.06 + progress * 0.24 + pulseStrength * 0.08) * intensity * shimmer
    const streak = 16 + intensity * 42 + pulseStrength * 12

    context.strokeStyle = `rgba(174, 244, 255, ${alpha})`
    context.lineWidth = Math.max(1, particle.radius * (0.74 + intensity * 0.82))
    context.beginPath()
    context.moveTo(particle.previousX, particle.previousY)
    context.lineTo(
      particle.x + (particle.x - particle.previousX) * streak * 0.028,
      particle.y + (particle.y - particle.previousY) * streak * 0.028,
    )
    context.stroke()

    context.fillStyle = `rgba(255, 250, 224, ${alpha * (2.1 + proximity * 0.6)})`
    context.beginPath()
    context.arc(particle.x, particle.y, particle.radius * (0.82 + intensity * 1.08), 0, Math.PI * 2)
    context.fill()

    if (proximity > 0.82 && t > 0.38) {
      context.fillStyle = `rgba(103, 232, 249, ${alpha * 1.6})`
      context.beginPath()
      context.arc(particle.x, particle.y, particle.radius * (1.8 + proximity * 0.9), 0, Math.PI * 2)
      context.fill()
    }
  }

  context.restore()
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
  resetLoadField()

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
    const [source, organicSource] = await Promise.all([
      resolveAnimationClip(vrm, BREATH_SOURCE_URL),
      resolveAnimationClip(vrm, BREATH_ORGANIC_SOURCE_URL),
    ])
    if (!source)
      return null

    const clip = createBreathClip(vrm, source, organicSource)
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

  const sanitizedClip = stripFacialAnimationTracks(clip)
  reAnchorRootPositionTrack(sanitizedClip, vrm, { axes: { x: true, y: true, z: true } })
  animationCache.set(url, sanitizedClip)
  return sanitizedClip
}

function ensureAnimationMixer(vrm: VRM) {
  if (!animationMixerRef.value)
    animationMixerRef.value = new AnimationMixer(vrm.scene)

  return animationMixerRef.value
}

function createBreathGestureClip(sourceClip: AnimationClip, runtime: BreathGestureRuntime) {
  if (!runtime.excerptSeconds) {
    const clip = sourceClip.clone()
    clip.resetDuration()
    return clip
  }

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
  runtime.startedAt = null
  runtime.clipDuration = 0
  runtime.fadeOutStarted = false
}

function rollBreathGestureInterval(runtime: Pick<BreathGestureRuntime, 'intervalMinSeconds' | 'intervalMaxSeconds'>) {
  const minInterval = Math.max(1, runtime.intervalMinSeconds)
  const maxInterval = Math.max(minInterval, runtime.intervalMaxSeconds)
  return MathUtils.randFloat(minInterval, maxInterval)
}

function scheduleBreathGesture(runtime: BreathGestureRuntime, initial = false) {
  const intervalSeconds = rollBreathGestureInterval(runtime)
  const initialScale = initial ? 0.88 : 1
  runtime.nextTriggerAt = breathGestureElapsedSeconds + (intervalSeconds * initialScale)
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
    nextTriggerAt: 0,
    endsAt: null,
    fadeOutAt: null,
    activeFadeInSeconds: 0,
    activeFadeOutSeconds: 0,
    startedAt: null,
    clipDuration: 0,
    fadeOutStarted: false,
  }))

  for (const runtime of breathGestureRuntimes)
    scheduleBreathGesture(runtime, true)

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
  const activeFadeOutSeconds = Math.min(runtime.fadeOutSeconds, Math.max(0.18, clip.duration * 0.3))
  const peakWeight = runtime.peakWeight ?? 1
  const action = mixer.clipAction(clip)
  action.stop()
  action.enabled = true
  action.clampWhenFinished = false
  action.setLoop(LoopOnce, 1)
  action.setEffectiveTimeScale(1)
  action.reset()
  action.setEffectiveWeight(0)
  action.play()

  runtime.action = action
  runtime.fadeOutStarted = false
  runtime.activeFadeInSeconds = activeFadeInSeconds
  runtime.activeFadeOutSeconds = activeFadeOutSeconds
  runtime.startedAt = breathGestureElapsedSeconds
  runtime.clipDuration = clip.duration
  scheduleBreathGesture(runtime)
  runtime.endsAt = breathGestureElapsedSeconds + clip.duration
  runtime.fadeOutAt = Math.max(breathGestureElapsedSeconds, runtime.endsAt - activeFadeOutSeconds)
  action.setEffectiveWeight(Math.max(peakWeight * 0.02, 0.001))
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
    const peakWeight = runtime.peakWeight ?? 1
    const age = runtime.startedAt === null ? 0 : breathGestureElapsedSeconds - runtime.startedAt
    const fadeInDuration = Math.max(0.001, runtime.activeFadeInSeconds || runtime.fadeInSeconds)
    const fadeOutDuration = Math.max(0.001, runtime.activeFadeOutSeconds || runtime.fadeOutSeconds)
    const clipDuration = Math.max(0.001, runtime.clipDuration || (runtime.endsAt !== null ? runtime.endsAt - (runtime.startedAt ?? breathGestureElapsedSeconds) : 0.001))
    const releaseAt = Math.max(fadeInDuration, clipDuration - fadeOutDuration)

    let envelope = peakWeight
    if (age < fadeInDuration)
      envelope = peakWeight * MathUtils.smootherstep(age, 0, fadeInDuration)
    else if (age >= releaseAt) {
      const remaining = Math.max(0, clipDuration - age)
      envelope = peakWeight * MathUtils.smootherstep(remaining, 0, fadeOutDuration)
      runtime.fadeOutStarted = true
    }
    else {
      runtime.fadeOutStarted = false
    }

    action.setEffectiveWeight(envelope)

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

function normalizeVisemeWeights(input: Partial<SpeechVisemeWeights> | null | undefined): SpeechVisemeWeights {
  return {
    A: Math.max(0, Math.min(1, Number(input?.A || 0))),
    E: Math.max(0, Math.min(1, Number(input?.E || 0))),
    I: Math.max(0, Math.min(1, Number(input?.I || 0))),
    O: Math.max(0, Math.min(1, Number(input?.O || 0))),
    U: Math.max(0, Math.min(1, Number(input?.U || 0))),
  }
}

function normalizeSpeechClosure(value: number | undefined) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return 0
  return Math.max(0, Math.min(1, numeric))
}

function resolveSpeechDominance() {
  const incoming = normalizeVisemeWeights(props.visemeWeights)
  const manualStrength = normalizeManualMouthOpen(props.manualMouthOpen)
  const closureStrength = normalizeSpeechClosure(props.speechClosure)
  const incomingPeak = Math.max(incoming.A, incoming.E, incoming.I, incoming.O, incoming.U)
  const currentPeak = Math.max(speechVisemeState.A, speechVisemeState.E, speechVisemeState.I, speechVisemeState.O, speechVisemeState.U)
  const peak = Math.max(incomingPeak, currentPeak, manualStrength * 0.72, closureStrength * 0.92)
  const activeSpeechDominance = props.speaking
    ? Math.max(0.88, MathUtils.smootherstep(peak, 0.015, 0.18))
    : MathUtils.smootherstep(peak, 0.05, 0.24)

  return Math.max(0, Math.min(1, activeSpeechDominance))
}

function applySpeechExpressions(vrm: VRM, delta: number) {
  const manager = vrm.expressionManager
  const bindings = resolvedExpressions.value
  if (!manager || !bindings)
    return

  const manualStrength = normalizeManualMouthOpen(props.manualMouthOpen)
  const closureStrength = normalizeSpeechClosure(props.speechClosure)
  const incoming = normalizeVisemeWeights(props.visemeWeights)
  const openFactor = Math.max(0, 1 - closureStrength)
  const keys: Array<keyof SpeechVisemeWeights> = ['A', 'E', 'I', 'O', 'U']
  let winner: keyof SpeechVisemeWeights = 'I'
  let runner: keyof SpeechVisemeWeights = 'E'
  let winnerValue = -Infinity
  let runnerValue = -Infinity

  for (const key of keys) {
    const value = incoming[key]
    if (value > winnerValue) {
      runnerValue = winnerValue
      runner = winner
      winnerValue = value
      winner = key
    }
    else if (value > runnerValue) {
      runnerValue = value
      runner = key
    }
  }

  const target: SpeechVisemeWeights = {
    A: 0,
    E: 0,
    I: 0,
    O: 0,
    U: 0,
  }

  if (winnerValue > 0.015) {
    target[winner] = Math.min(0.76, winnerValue) * openFactor
    if (runnerValue > 0.05)
      target[runner] = Math.min(0.42, runnerValue * 0.62) * openFactor
  }

  if (manualStrength > 0.02) {
    const manualEnvelope = openFactor * openFactor * openFactor
    target.A = Math.max(target.A, Math.min(0.78, 0.24 + manualStrength * 0.54) * manualEnvelope)
    target.O = Math.max(target.O, Math.min(0.56, 0.12 + manualStrength * 0.3) * manualEnvelope)
    target.I = Math.max(target.I, Math.min(0.28, manualStrength * 0.18) * manualEnvelope)
  }

  for (const key of keys) {
    const current = speechVisemeState[key]
    const next = target[key]
    const lambda = next > current ? 24 : next < 0.02 ? 34 : 20
    const alpha = 1 - Math.exp(-lambda * delta)
    speechVisemeState[key] = MathUtils.lerp(current, next, alpha)
  }

  if (bindings.aa)
    manager.setValue(bindings.aa, speechVisemeState.A)
  if (bindings.ee)
    manager.setValue(bindings.ee, speechVisemeState.E)
  if (bindings.ih)
    manager.setValue(bindings.ih, speechVisemeState.I)
  if (bindings.oh)
    manager.setValue(bindings.oh, speechVisemeState.O)
  if (bindings.ou)
    manager.setValue(bindings.ou, speechVisemeState.U)
}

function applyEmotionExpressions(vrm: VRM, delta: number) {
  const manager = vrm.expressionManager
  const bindings = resolvedExpressions.value
  if (!manager || !bindings)
    return

  const speechDominance = resolveSpeechDominance()
  const speechBlend = MathUtils.lerp(1, 0.08, speechDominance)
  const relaxedSpeechBlend = MathUtils.lerp(1, 0.03, speechDominance)
  const targets = {
    happy: props.expression === 'happy' ? 1 * speechBlend : 0,
    sad: props.expression === 'sad' ? 1 * speechBlend : 0,
    angry: props.expression === 'angry' ? 1 * speechBlend : 0,
    surprised: props.expression === 'surprised' ? 1 * speechBlend : 0,
    relaxed: (props.expression === 'think' ? 0.84 * (props.speaking ? 0.82 : 1) : props.expression === 'neutral' ? 0.42 : 0.1) * relaxedSpeechBlend,
  }

  emotionState.happy = MathUtils.lerp(emotionState.happy, targets.happy, Math.min(1, delta * 2.15))
  emotionState.sad = MathUtils.lerp(emotionState.sad, targets.sad, Math.min(1, delta * 2.15))
  emotionState.angry = MathUtils.lerp(emotionState.angry, targets.angry, Math.min(1, delta * 2.15))
  emotionState.surprised = MathUtils.lerp(emotionState.surprised, targets.surprised, Math.min(1, delta * 2.7))
  emotionState.relaxed = MathUtils.lerp(emotionState.relaxed, targets.relaxed, Math.min(1, delta * 1.8))

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
  const vrm = vrmRef.value

  if (vrm) {
    animationMixerRef.value?.update(delta)
    updateBreathGestures(delta)
    applyEyeTracking(vrm, delta)
    applyHeadTracking(vrm, delta)
    blink.update(vrm, delta)
    applyEmotionExpressions(vrm, delta)
    applySpeechExpressions(vrm, delta)
    vrm.update(delta)
  }

  camera.lookAt(0, modelHeadHeight.value * 0.98, 0)
  renderLoadField(delta)
  renderer.render(scene, camera)
  frameHandle.value = requestAnimationFrame(animate)
}

watch(() => props.modelUrl, value => loadAvatar(value))
watch(() => props.ambientAnimation, value => {
  void applyAmbientAnimation(value)
})
watch(() => [
  props.brightness,
  props.contrast,
  props.saturation,
  props.exposure,
  props.ambientIntensity,
  props.hemisphereIntensity,
  props.keyIntensity,
  props.rimIntensity,
  props.fillIntensity,
], () => {
  applyLightingControls()
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
      <canvas ref="loadFieldRef" class="avatar-stage__load-field" aria-hidden="true" />
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

.avatar-stage__load-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.avatar-stage__badge {
  position: relative;
  z-index: 1;
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
  position: relative;
  z-index: 1;
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
