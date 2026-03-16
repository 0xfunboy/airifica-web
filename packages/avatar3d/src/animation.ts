import type { VRM, VRMCore } from '@pixiv/three-vrm'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { AnimationClip } from 'three'

import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { Object3D, Vector3, VectorKeyframeTrack } from 'three'

import { useVRMLoader } from './loader'

function randomSaccadeInterval() {
  const steps = [
    [0.075, 800],
    [0.11, 1200],
    [0.125, 1600],
    [0.14, 2000],
    [0.125, 2400],
    [0.05, 2800],
    [0.04, 3200],
    [0.03, 3600],
    [0.02, 4000],
    [1, 4400],
  ] as const
  const random = Math.random()
  for (const [threshold, base] of steps) {
    if (random <= threshold)
      return base + Math.random() * 400
  }
  return 4400 + Math.random() * 400
}

type GlTfWithAnimations = {
  userData: {
    vrmAnimations?: VRMAnimation[]
  }
}

type RootAnchorOptions = {
  axes?: {
    x?: boolean
    y?: boolean
    z?: boolean
  }
}

function resolveExpressionNames(vrm: VRMCore | undefined, candidates: string[]) {
  const expressionMap = vrm?.expressionManager?.expressionMap
  if (!expressionMap)
    return []

  const available = Object.keys(expressionMap)
  const resolved = new Set<string>()
  for (const candidate of candidates) {
    if (candidate in expressionMap)
      resolved.add(candidate)

    const caseInsensitive = available.find(name => name.toLowerCase() === candidate.toLowerCase())
    if (caseInsensitive)
      resolved.add(caseInsensitive)
  }

  return [...resolved]
}

function resolveBlinkExpressionNames(vrm: VRMCore | undefined) {
  const blink = resolveExpressionNames(vrm, ['blink'])
  if (blink.length > 0)
    return blink

  return resolveExpressionNames(vrm, ['blinkLeft', 'blinkRight', 'blink_l', 'blink_r'])
}

export async function loadVRMAnimation(url: string) {
  const loader = useVRMLoader()
  const gltf = await loader.loadAsync(url) as GlTfWithAnimations
  return gltf.userData.vrmAnimations?.[0]
}

export async function clipFromVRMAnimation(vrm?: VRMCore, animation?: VRMAnimation) {
  if (!vrm || !animation)
    return null

  return createVRMAnimationClip(animation, vrm)
}

export function reAnchorRootPositionTrack(clip: AnimationClip, vrm: VRMCore, options?: RootAnchorOptions) {
  const hipNode = vrm.humanoid?.getNormalizedBoneNode('hips')
  if (!hipNode)
    return

  const defaultHipPosition = hipNode.position.clone()
  const hipsTrack = clip.tracks.find(track =>
    track instanceof VectorKeyframeTrack && track.name === `${hipNode.name}.position`,
  )
  if (!(hipsTrack instanceof VectorKeyframeTrack))
    return

  const firstFramePosition = new Vector3(
    hipsTrack.values[0],
    hipsTrack.values[1],
    hipsTrack.values[2],
  )
  const delta = new Vector3().subVectors(firstFramePosition, defaultHipPosition)
  const anchorAxes = {
    x: options?.axes?.x ?? true,
    y: options?.axes?.y ?? true,
    z: options?.axes?.z ?? true,
  }

  clip.tracks.forEach((track) => {
    if (!(track instanceof VectorKeyframeTrack) || !track.name.endsWith('.position'))
      return

    for (let index = 0; index < track.values.length; index += 3) {
      if (anchorAxes.x)
        track.values[index] -= delta.x
      if (anchorAxes.y)
        track.values[index + 1] -= delta.y
      if (anchorAxes.z)
        track.values[index + 2] -= delta.z
    }
  })
}

export function useBlink() {
  let blinking = false
  let blinkProgress = 0
  let elapsedSinceBlink = 0
  let nextBlinkAt = Math.random() * 3.5 + 1
  const duration = 0.2

  function update(vrm: VRMCore | undefined, delta: number) {
    if (!vrm?.expressionManager)
      return

    const blinkNames = resolveBlinkExpressionNames(vrm)
    if (blinkNames.length === 0)
      return

    elapsedSinceBlink += delta
    if (!blinking && elapsedSinceBlink >= nextBlinkAt) {
      blinking = true
      blinkProgress = 0
    }

    if (!blinking)
      return

    blinkProgress += delta / duration
    const value = Math.sin(Math.PI * blinkProgress)
    blinkNames.forEach(name => vrm.expressionManager?.setValue(name, value))

    if (blinkProgress < 1)
      return

    blinking = false
    blinkProgress = 0
    elapsedSinceBlink = 0
    blinkNames.forEach(name => vrm.expressionManager?.setValue(name, 0))
    nextBlinkAt = Math.random() * 3.5 + 1
  }

  return { update }
}

export function ensureLookAtTarget(vrm: VRMCore) {
  if (!vrm.lookAt)
    return null

  if (!vrm.lookAt.target) {
    const target = new Object3D()
    target.name = 'airifica-look-at-target'
    vrm.lookAt.target = target
  }

  const target = vrm.lookAt.target
  if (!target)
    return null

  let sceneRoot = vrm.scene as unknown as Object3D
  while (sceneRoot.parent)
    sceneRoot = sceneRoot.parent

  if (target.parent !== sceneRoot)
    sceneRoot.add(target as unknown as Object3D)

  return target
}

export function useIdleEyeSaccades() {
  let nextSaccadeAfter = -1
  const fixationTarget = new Vector3()
  let timeSinceLastSaccade = 0

  function refreshFixation(target: { x: number, y: number, z: number }) {
    fixationTarget.set(
      target.x + (Math.random() * 0.5 - 0.25),
      target.y + (Math.random() * 0.5 - 0.25),
      target.z,
    )
  }

  function update(vrm: VRM | undefined, lookAtTarget: { x: number, y: number, z: number }, delta: number) {
    if (!vrm?.lookAt)
      return

    if (timeSinceLastSaccade >= nextSaccadeAfter) {
      refreshFixation(lookAtTarget)
      timeSinceLastSaccade = 0
      nextSaccadeAfter = randomSaccadeInterval() / 1000
    }

    const target = ensureLookAtTarget(vrm)
    if (!target)
      return

    target.position.lerp(fixationTarget, Math.min(1, delta * 10))
    target.updateMatrixWorld(true)
    timeSinceLastSaccade += delta
  }

  function instantUpdate(vrm: VRM | undefined, lookAtTarget: { x: number, y: number, z: number }) {
    if (!vrm?.lookAt)
      return

    const target = ensureLookAtTarget(vrm)
    if (!target)
      return

    fixationTarget.set(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z)
    target.position.copy(fixationTarget)
    target.updateMatrixWorld(true)
  }

  return {
    update,
    instantUpdate,
  }
}
