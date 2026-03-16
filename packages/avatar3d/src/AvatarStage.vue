<script setup lang="ts">
import type { AvatarExpression } from './types'

import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  AmbientLight,
  Box3,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from '@pixiv/three-vrm'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelUrl?: string | null
  speaking?: boolean
  expression?: AvatarExpression
}>(), {
  modelUrl: null,
  speaking: false,
  expression: 'neutral',
})

const emit = defineEmits<{
  (event: 'load-start'): void
  (event: 'load-progress', value: number): void
  (event: 'load-finish'): void
  (event: 'error', error: unknown): void
}>()

const hostRef = ref<HTMLDivElement | null>(null)
const rendererRef = shallowRef<WebGLRenderer>()
const cameraRef = shallowRef<PerspectiveCamera>()
const sceneRef = shallowRef<Scene>()
const avatarGroup = shallowRef<Group>()
const vrmRef = shallowRef<VRM | null>(null)
const status = ref<'empty' | 'loading' | 'ready' | 'error'>('empty')
const errorMessage = ref('')
const avatarBaseY = ref(0)
const clock = new Clock()
const pointer = new Vector2(0, 0)
const viewTarget = new Vector3(0, 1.35, 0)
const frameHandle = ref<number>()
let resizeObserver: ResizeObserver | undefined
let activeLoadToken = 0

const overlayLabel = computed(() => {
  if (status.value === 'loading')
    return 'Loading avatar runtime'
  if (status.value === 'error')
    return errorMessage.value || 'Unable to load the avatar'
  return 'Add a VRM file or URL to mount the stage'
})

function setPointer(event: PointerEvent) {
  if (!hostRef.value)
    return

  const bounds = hostRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1
}

function resetPointer() {
  pointer.set(0, 0)
}

function setupStage() {
  if (!hostRef.value || rendererRef.value)
    return

  const scene = new Scene()
  scene.background = null

  const camera = new PerspectiveCamera(28, 1, 0.01, 100)
  camera.position.set(0, 1.35, 2.7)

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = false
  renderer.domElement.className = 'avatar-stage__canvas'

  const ambient = new AmbientLight(new Color('#cbd5ff'), 0.65)
  const hemi = new HemisphereLight(new Color('#dbeafe'), new Color('#0f172a'), 1.15)
  const key = new DirectionalLight(new Color('#ffffff'), 1.75)
  key.position.set(2.5, 3.5, 2.4)
  const rim = new DirectionalLight(new Color('#67e8f9'), 0.85)
  rim.position.set(-3, 2.2, -2.4)

  const floor = new Mesh(
    new CircleGeometry(1.4, 96),
    new MeshBasicMaterial({
      color: new Color('#38bdf8'),
      opacity: 0.08,
      transparent: true,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01

  const pedestal = new Group()
  pedestal.add(floor)

  scene.add(ambient, hemi, key, rim, pedestal)
  sceneRef.value = scene
  cameraRef.value = camera
  rendererRef.value = renderer

  hostRef.value.appendChild(renderer.domElement)

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
  const avatar = avatarGroup.value
  if (avatar) {
    sceneRef.value?.remove(avatar)
    VRMUtils.deepDispose(avatar)
  }

  avatarGroup.value = undefined
  vrmRef.value = null
  avatarBaseY.value = 0
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

async function loadAvatar(url: string | null | undefined) {
  activeLoadToken += 1
  const loadToken = activeLoadToken
  disposeAvatar()

  if (!url) {
    status.value = 'empty'
    errorMessage.value = ''
    emit('load-progress', 0)
    return
  }

  status.value = 'loading'
  errorMessage.value = ''
  emit('load-start')
  emit('load-progress', 0)

  const loader = new GLTFLoader()
  loader.register(parser => new VRMLoaderPlugin(parser))

  try {
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.load(
        url,
        asset => resolve(asset),
        progress => {
          if (!progress.total)
            return

          emit('load-progress', Math.round((progress.loaded / progress.total) * 100))
        },
        reject,
      )
    })

    if (loadToken !== activeLoadToken)
      return

    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.removeUnnecessaryJoints(gltf.scene)

    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm)
      throw new Error('The selected file does not expose a VRM runtime.')

    const avatar = new Group()
    avatar.add(vrm.scene)

    const bounds = new Box3().setFromObject(vrm.scene)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())

    vrm.scene.position.x -= center.x
    vrm.scene.position.z -= center.z
    vrm.scene.position.y -= bounds.min.y

    const focusHeight = size.y * 0.62
    viewTarget.set(0, focusHeight, 0)
    avatarBaseY.value = -bounds.min.y
    vrm.scene.position.y = avatarBaseY.value

    if (cameraRef.value) {
      const distance = Math.max(size.x, size.y * 0.72, size.z) * 1.9
      cameraRef.value.position.set(0, focusHeight, distance)
      cameraRef.value.lookAt(viewTarget)
    }

    avatarGroup.value = avatar
    vrmRef.value = vrm
    sceneRef.value?.add(avatar)
    status.value = 'ready'
    emit('load-progress', 100)
    emit('load-finish')
  }
  catch (error) {
    if (loadToken !== activeLoadToken)
      return

    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Unknown avatar error'
    emit('error', error)
  }
}

function applyExpression(vrm: VRM, elapsed: number) {
  const manager = vrm.expressionManager
  if (!manager)
    return

  const blinkWave = Math.sin(elapsed * 1.5)
  const blink = blinkWave > 0.97 ? MathUtils.mapLinear(blinkWave, 0.97, 1, 0, 1) : 0
  const mouth = props.speaking ? 0.12 + (Math.sin(elapsed * 16) * 0.5 + 0.5) * 0.34 : 0

  manager.setValue(VRMExpressionPresetName.Blink, blink)
  manager.setValue(VRMExpressionPresetName.Aa, mouth)
  manager.setValue(VRMExpressionPresetName.Happy, props.expression === 'happy' ? 0.75 : 0)
  manager.setValue(VRMExpressionPresetName.Sad, props.expression === 'sad' ? 0.55 : 0)
  manager.setValue(VRMExpressionPresetName.Surprised, props.expression === 'surprised' ? 0.6 : 0)
}

function applyPose(vrm: VRM, elapsed: number) {
  const normalized = vrm.humanoid
  if (!normalized)
    return

  const root = vrm.scene
  root.position.y = avatarBaseY.value + Math.sin(elapsed * 1.2) * 0.018
  root.rotation.y = MathUtils.lerp(root.rotation.y, pointer.x * 0.08, 0.05)

  const neck = normalized.getNormalizedBoneNode(VRMHumanBoneName.Neck)
  const head = normalized.getNormalizedBoneNode(VRMHumanBoneName.Head)

  if (neck) {
    neck.rotation.y = MathUtils.lerp(neck.rotation.y, pointer.x * 0.16, 0.08)
    neck.rotation.x = MathUtils.lerp(neck.rotation.x, -pointer.y * 0.08, 0.08)
  }

  if (head) {
    head.rotation.y = MathUtils.lerp(head.rotation.y, pointer.x * 0.22, 0.08)
    head.rotation.x = MathUtils.lerp(head.rotation.x, -pointer.y * 0.12, 0.08)
    head.rotation.z = MathUtils.lerp(head.rotation.z, -pointer.x * 0.04, 0.08)
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
    applyExpression(vrm, elapsed)
    applyPose(vrm, elapsed)
    vrm.update(delta)
  }

  camera.lookAt(viewTarget)
  renderer.render(scene, camera)
  frameHandle.value = requestAnimationFrame(animate)
}

watch(() => props.modelUrl, value => loadAvatar(value))

onMounted(() => {
  setupStage()
  void loadAvatar(props.modelUrl)
})

onBeforeUnmount(() => {
  activeLoadToken += 1
  disposeStage()
})
</script>

<template>
  <div
    ref="hostRef"
    class="avatar-stage"
    @pointermove="setPointer"
    @pointerleave="resetPointer"
  >
    <div class="avatar-stage__glow avatar-stage__glow--left" />
    <div class="avatar-stage__glow avatar-stage__glow--right" />

    <div v-if="status !== 'ready'" class="avatar-stage__overlay">
      <div class="avatar-stage__badge">
        {{ status === 'loading' ? 'Avatar 3D' : 'Stage idle' }}
      </div>
      <p class="avatar-stage__headline">
        {{ overlayLabel }}
      </p>
      <p class="avatar-stage__hint">
        VRM is the only supported format in this runtime.
      </p>
    </div>
  </div>
</template>

<style scoped>
.avatar-stage {
  position: relative;
  min-height: 24rem;
  width: 100%;
  overflow: hidden;
  border-radius: 2rem;
  background:
    radial-gradient(circle at top, rgba(125, 211, 252, 0.12), transparent 32%),
    radial-gradient(circle at bottom, rgba(56, 189, 248, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(7, 18, 35, 0.96), rgba(3, 10, 21, 0.92));
  border: 1px solid rgba(125, 211, 252, 0.12);
}

:global(.avatar-stage__canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.avatar-stage__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: end;
  gap: 0.65rem;
  padding: 1.6rem;
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.72));
  pointer-events: none;
}

.avatar-stage__badge {
  width: fit-content;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(125, 211, 252, 0.2);
  color: #bae6fd;
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.avatar-stage__headline {
  margin: 0;
  max-width: 22rem;
  color: #f8fafc;
  font-size: 1.1rem;
  line-height: 1.35;
  font-weight: 600;
}

.avatar-stage__hint {
  margin: 0;
  color: rgba(226, 232, 240, 0.72);
  line-height: 1.5;
}

.avatar-stage__glow {
  position: absolute;
  inset: auto;
  width: 16rem;
  height: 16rem;
  border-radius: 999px;
  filter: blur(60px);
  opacity: 0.22;
  pointer-events: none;
}

.avatar-stage__glow--left {
  left: -4rem;
  top: -4rem;
  background: rgba(59, 130, 246, 0.7);
}

.avatar-stage__glow--right {
  right: -5rem;
  bottom: -5rem;
  background: rgba(34, 211, 238, 0.55);
}
</style>
