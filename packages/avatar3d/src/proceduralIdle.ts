import type { VRMCore, VRMHumanBoneName } from '@pixiv/three-vrm'

import {
  AnimationClip,
  Euler,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three'

const DURATION_SECONDS = 24
const FPS = 30
const LOOP_FADE_SECONDS = 2.4

const BASE_POSE_BONES: VRMHumanBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot',
  'leftToes',
  'rightToes',
]

type MotionComponent = {
  axis: 'x' | 'y' | 'z'
  amplitudeDeg: number
  periodSeconds: number
  phase?: number
}

type PoseSample = {
  position?: Vector3
  quaternion?: Quaternion
}

function createTimeline(durationSeconds: number, fps: number) {
  const frameCount = durationSeconds * fps + 1
  const times = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i += 1)
    times[i] = i / fps
  return times
}

const TIMES = createTimeline(DURATION_SECONDS, FPS)

function trackNodeName(trackName: string) {
  return trackName.replace(/\.(position|quaternion)$/, '')
}

function loopedWave(timeSeconds: number, periodSeconds: number, phase = 0) {
  return Math.sin((2 * Math.PI * timeSeconds / periodSeconds) + phase)
}

function smoothstep01(value: number) {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - (2 * clamped))
}

function loopEnvelope(timeSeconds: number) {
  const fadeIn = smoothstep01(timeSeconds / LOOP_FADE_SECONDS)
  const fadeOut = smoothstep01((DURATION_SECONDS - timeSeconds) / LOOP_FADE_SECONDS)
  return fadeIn * fadeOut
}

function gatherBasePose(vrm: VRMCore, sourceClip: AnimationClip) {
  const pose = new Map<string, PoseSample>()

  for (const boneName of BASE_POSE_BONES) {
    const node = vrm.humanoid?.getNormalizedBoneNode(boneName)
    if (!node)
      continue

    pose.set(node.name, {
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
    })
  }

  for (const track of sourceClip.tracks) {
    const nodeName = trackNodeName(track.name)
    const sample = pose.get(nodeName) ?? {}

    if (track instanceof QuaternionKeyframeTrack && track.values.length >= 4) {
      sample.quaternion = new Quaternion(
        track.values[0],
        track.values[1],
        track.values[2],
        track.values[3],
      ).normalize()
    }
    else if (track instanceof VectorKeyframeTrack && track.values.length >= 3) {
      sample.position = new Vector3(
        track.values[0],
        track.values[1],
        track.values[2],
      )
    }

    pose.set(nodeName, sample)
  }

  return pose
}

function buildConstantQuaternionTrack(trackName: string, quaternion: Quaternion) {
  const values = new Float32Array(TIMES.length * 4)
  for (let index = 0; index < TIMES.length; index += 1) {
    const offset = index * 4
    values[offset] = quaternion.x
    values[offset + 1] = quaternion.y
    values[offset + 2] = quaternion.z
    values[offset + 3] = quaternion.w
  }
  return new QuaternionKeyframeTrack(trackName, TIMES, values)
}

function buildAnimatedQuaternionTrack(trackName: string, baseQuaternion: Quaternion, components: MotionComponent[]) {
  const values = new Float32Array(TIMES.length * 4)
  const animated = new Quaternion()
  const delta = new Quaternion()
  const euler = new Euler(0, 0, 0, 'XYZ')
  const offset = { x: 0, y: 0, z: 0 }

  for (let index = 0; index < TIMES.length; index += 1) {
    const timeSeconds = TIMES[index]
    const envelope = loopEnvelope(timeSeconds)
    offset.x = 0
    offset.y = 0
    offset.z = 0

    for (const component of components) {
      const contribution = MathUtils.degToRad(component.amplitudeDeg)
        * loopedWave(timeSeconds, component.periodSeconds, component.phase)
        * envelope
      offset[component.axis] += contribution
    }

    euler.set(offset.x, offset.y, offset.z, 'XYZ')
    delta.setFromEuler(euler)
    animated.copy(baseQuaternion).multiply(delta).normalize()

    const valueOffset = index * 4
    values[valueOffset] = animated.x
    values[valueOffset + 1] = animated.y
    values[valueOffset + 2] = animated.z
    values[valueOffset + 3] = animated.w
  }

  return new QuaternionKeyframeTrack(trackName, TIMES, values)
}

function buildConstantPositionTrack(trackName: string, position: Vector3) {
  const values = new Float32Array(TIMES.length * 3)
  for (let index = 0; index < TIMES.length; index += 1) {
    const offset = index * 3
    values[offset] = position.x
    values[offset + 1] = position.y
    values[offset + 2] = position.z
  }
  return new VectorKeyframeTrack(trackName, TIMES, values)
}

function resolveNodeName(vrm: VRMCore, boneName: VRMHumanBoneName) {
  return vrm.humanoid?.getNormalizedBoneNode(boneName)?.name ?? null
}

export function createBreathClip(vrm: VRMCore, sourceClip: AnimationClip) {
  const pose = gatherBasePose(vrm, sourceClip)
  if (pose.size === 0)
    return null

  const motionByNode = new Map<string, MotionComponent[]>()
  const addMotion = (boneName: VRMHumanBoneName, components: MotionComponent[]) => {
    const nodeName = resolveNodeName(vrm, boneName)
    if (nodeName)
      motionByNode.set(nodeName, components)
  }

  addMotion('hips', [
    { axis: 'z', amplitudeDeg: 0.7, periodSeconds: 18, phase: Math.PI / 3 },
    { axis: 'y', amplitudeDeg: 0.45, periodSeconds: 24, phase: Math.PI },
  ])
  addMotion('spine', [
    { axis: 'x', amplitudeDeg: 0.85, periodSeconds: 4.8, phase: Math.PI / 6 },
    { axis: 'z', amplitudeDeg: 0.5, periodSeconds: 18, phase: Math.PI * 0.75 },
  ])
  addMotion('chest', [
    { axis: 'x', amplitudeDeg: 1.3, periodSeconds: 4.8, phase: Math.PI / 10 },
    { axis: 'y', amplitudeDeg: 0.4, periodSeconds: 12, phase: Math.PI / 4 },
    { axis: 'z', amplitudeDeg: 0.65, periodSeconds: 18, phase: Math.PI * 0.6 },
  ])
  addMotion('upperChest', [
    { axis: 'x', amplitudeDeg: 1.8, periodSeconds: 4.8, phase: 0 },
    { axis: 'y', amplitudeDeg: 0.5, periodSeconds: 12, phase: Math.PI / 6 },
    { axis: 'z', amplitudeDeg: 0.85, periodSeconds: 18, phase: Math.PI * 0.55 },
  ])
  addMotion('neck', [
    { axis: 'x', amplitudeDeg: 0.5, periodSeconds: 6, phase: Math.PI / 5 },
    { axis: 'y', amplitudeDeg: 1.1, periodSeconds: 14, phase: Math.PI * 0.65 },
    { axis: 'z', amplitudeDeg: 0.35, periodSeconds: 18, phase: Math.PI * 0.25 },
  ])
  addMotion('head', [
    { axis: 'x', amplitudeDeg: 0.7, periodSeconds: 6.5, phase: Math.PI / 7 },
    { axis: 'y', amplitudeDeg: 1.5, periodSeconds: 14, phase: Math.PI * 0.75 },
    { axis: 'z', amplitudeDeg: 0.45, periodSeconds: 18, phase: Math.PI / 2 },
  ])
  addMotion('leftShoulder', [
    { axis: 'x', amplitudeDeg: 0.4, periodSeconds: 4.8, phase: Math.PI / 8 },
    { axis: 'z', amplitudeDeg: 0.75, periodSeconds: 18, phase: 0 },
  ])
  addMotion('rightShoulder', [
    { axis: 'x', amplitudeDeg: 0.4, periodSeconds: 4.8, phase: Math.PI / 8 },
    { axis: 'z', amplitudeDeg: 0.75, periodSeconds: 18, phase: Math.PI },
  ])
  addMotion('leftUpperArm', [
    { axis: 'x', amplitudeDeg: 0.25, periodSeconds: 6, phase: Math.PI / 6 },
    { axis: 'z', amplitudeDeg: 0.55, periodSeconds: 18, phase: Math.PI / 9 },
  ])
  addMotion('rightUpperArm', [
    { axis: 'x', amplitudeDeg: 0.25, periodSeconds: 6, phase: Math.PI / 6 },
    { axis: 'z', amplitudeDeg: 0.55, periodSeconds: 18, phase: Math.PI * 1.1 },
  ])
  addMotion('leftLowerArm', [{ axis: 'x', amplitudeDeg: 0.2, periodSeconds: 6.5, phase: Math.PI / 5 }])
  addMotion('rightLowerArm', [{ axis: 'x', amplitudeDeg: 0.2, periodSeconds: 6.5, phase: Math.PI / 5 }])
  addMotion('leftHand', [{ axis: 'x', amplitudeDeg: 0.15, periodSeconds: 9, phase: Math.PI / 3 }])
  addMotion('rightHand', [{ axis: 'x', amplitudeDeg: 0.15, periodSeconds: 9, phase: Math.PI * 0.9 }])

  const tracks = Array.from(pose.entries()).flatMap(([nodeName, sample]) => {
    const nextTracks = []

    if (sample.position)
      nextTracks.push(buildConstantPositionTrack(`${nodeName}.position`, sample.position))

    if (!sample.quaternion)
      return nextTracks

    const motion = motionByNode.get(nodeName)
    if (motion?.length)
      nextTracks.push(buildAnimatedQuaternionTrack(`${nodeName}.quaternion`, sample.quaternion, motion))
    else
      nextTracks.push(buildConstantQuaternionTrack(`${nodeName}.quaternion`, sample.quaternion))

    return nextTracks
  })

  return new AnimationClip('breath', DURATION_SECONDS, tracks)
}
