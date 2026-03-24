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
const TIMES = createTimeline(DURATION_SECONDS, FPS)

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

const MIRRORED_BONE_PAIRS: Array<[VRMHumanBoneName, VRMHumanBoneName]> = [
  ['leftShoulder', 'rightShoulder'],
  ['leftUpperArm', 'rightUpperArm'],
  ['leftLowerArm', 'rightLowerArm'],
  ['leftHand', 'rightHand'],
  ['leftThumbMetacarpal', 'rightThumbMetacarpal'],
  ['leftThumbProximal', 'rightThumbProximal'],
  ['leftThumbDistal', 'rightThumbDistal'],
  ['leftIndexProximal', 'rightIndexProximal'],
  ['leftIndexIntermediate', 'rightIndexIntermediate'],
  ['leftIndexDistal', 'rightIndexDistal'],
  ['leftMiddleProximal', 'rightMiddleProximal'],
  ['leftMiddleIntermediate', 'rightMiddleIntermediate'],
  ['leftMiddleDistal', 'rightMiddleDistal'],
  ['leftRingProximal', 'rightRingProximal'],
  ['leftRingIntermediate', 'rightRingIntermediate'],
  ['leftRingDistal', 'rightRingDistal'],
  ['leftLittleProximal', 'rightLittleProximal'],
  ['leftLittleIntermediate', 'rightLittleIntermediate'],
  ['leftLittleDistal', 'rightLittleDistal'],
  ['leftUpperLeg', 'rightUpperLeg'],
  ['leftLowerLeg', 'rightLowerLeg'],
  ['leftFoot', 'rightFoot'],
  ['leftToes', 'rightToes'],
]

type MotionComponent = {
  axis: 'x' | 'y' | 'z'
  amplitudeDeg: number
  periodSeconds: number
  phase?: number
}

type PositionMotionComponent = {
  axis: 'x' | 'y' | 'z'
  amplitude: number
  periodSeconds: number
  phase?: number
}

type PoseSample = {
  position?: Vector3
  quaternion?: Quaternion
}

type ClipBinding = {
  position?: {
    initial: Vector3
    track: VectorKeyframeTrack
  }
  quaternion?: {
    initial: Quaternion
    track: QuaternionKeyframeTrack
  }
}

function createTimeline(durationSeconds: number, fps: number) {
  const frameCount = durationSeconds * fps + 1
  const times = new Float32Array(frameCount)
  for (let index = 0; index < frameCount; index += 1)
    times[index] = index / fps
  return times
}

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

function mirrorQuaternion(quaternion: Quaternion) {
  return new Quaternion(
    quaternion.x,
    -quaternion.y,
    -quaternion.z,
    quaternion.w,
  ).normalize()
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

function symmetrizePairedPose(vrm: VRMCore, pose: Map<string, PoseSample>) {
  for (const [leftBone, rightBone] of MIRRORED_BONE_PAIRS) {
    const leftNode = resolveNodeName(vrm, leftBone)
    const rightNode = resolveNodeName(vrm, rightBone)
    if (!leftNode || !rightNode)
      continue

    const leftSample = pose.get(leftNode) ?? {}
    const rightSample = pose.get(rightNode) ?? {}
    const leftQuaternion = leftSample.quaternion
    const rightQuaternion = rightSample.quaternion

    if (leftQuaternion && rightQuaternion) {
      const canonicalLeft = leftQuaternion.clone().slerp(mirrorQuaternion(rightQuaternion), 0.5).normalize()
      leftSample.quaternion = canonicalLeft
      rightSample.quaternion = mirrorQuaternion(canonicalLeft)
    }
    else if (leftQuaternion) {
      rightSample.quaternion = mirrorQuaternion(leftQuaternion)
    }
    else if (rightQuaternion) {
      const canonicalLeft = mirrorQuaternion(rightQuaternion)
      leftSample.quaternion = canonicalLeft
      rightSample.quaternion = mirrorQuaternion(canonicalLeft)
    }

    pose.set(leftNode, leftSample)
    pose.set(rightNode, rightSample)
  }
}

function gatherClipBindings(clip: AnimationClip) {
  const bindings = new Map<string, ClipBinding>()

  for (const track of clip.tracks) {
    const nodeName = trackNodeName(track.name)
    const binding = bindings.get(nodeName) ?? {}

    if (track instanceof QuaternionKeyframeTrack && track.values.length >= 4) {
      binding.quaternion = {
        initial: new Quaternion(
          track.values[0],
          track.values[1],
          track.values[2],
          track.values[3],
        ).normalize(),
        track,
      }
    }
    else if (track instanceof VectorKeyframeTrack && track.values.length >= 3) {
      binding.position = {
        initial: new Vector3(
          track.values[0],
          track.values[1],
          track.values[2],
        ),
        track,
      }
    }

    bindings.set(nodeName, binding)
  }

  return bindings
}

function sampleLoopedTime(timeSeconds: number, durationSeconds: number) {
  if (durationSeconds <= 0)
    return 0

  const wrapped = timeSeconds % durationSeconds
  return wrapped < 0 ? wrapped + durationSeconds : wrapped
}

function findTrackSegment(times: ArrayLike<number>, sampleTime: number) {
  const count = times.length
  if (count <= 1)
    return { leftIndex: 0, rightIndex: 0, alpha: 0 }

  if (sampleTime <= times[0])
    return { leftIndex: 0, rightIndex: 0, alpha: 0 }

  if (sampleTime >= times[count - 1])
    return { leftIndex: count - 1, rightIndex: count - 1, alpha: 0 }

  let leftIndex = 0
  let rightIndex = count - 1

  while (rightIndex - leftIndex > 1) {
    const middleIndex = Math.floor((leftIndex + rightIndex) / 2)
    if (times[middleIndex] <= sampleTime)
      leftIndex = middleIndex
    else
      rightIndex = middleIndex
  }

  const startTime = times[leftIndex]
  const endTime = times[rightIndex]
  const alpha = endTime > startTime
    ? (sampleTime - startTime) / (endTime - startTime)
    : 0

  return { leftIndex, rightIndex, alpha }
}

function sampleBindingQuaternion(binding: ClipBinding['quaternion'], durationSeconds: number, timeSeconds: number) {
  if (!binding)
    return null

  const sampleTime = sampleLoopedTime(timeSeconds, durationSeconds)
  const { leftIndex, rightIndex, alpha } = findTrackSegment(binding.track.times, sampleTime)
  const leftOffset = leftIndex * 4
  const rightOffset = rightIndex * 4
  const leftQuaternion = new Quaternion(
    binding.track.values[leftOffset] ?? binding.initial.x,
    binding.track.values[leftOffset + 1] ?? binding.initial.y,
    binding.track.values[leftOffset + 2] ?? binding.initial.z,
    binding.track.values[leftOffset + 3] ?? binding.initial.w,
  ).normalize()

  if (leftIndex === rightIndex)
    return leftQuaternion

  const rightQuaternion = new Quaternion(
    binding.track.values[rightOffset] ?? binding.initial.x,
    binding.track.values[rightOffset + 1] ?? binding.initial.y,
    binding.track.values[rightOffset + 2] ?? binding.initial.z,
    binding.track.values[rightOffset + 3] ?? binding.initial.w,
  ).normalize()

  return leftQuaternion.slerp(rightQuaternion, alpha).normalize()
}

function sampleBindingPosition(binding: ClipBinding['position'], durationSeconds: number, timeSeconds: number) {
  if (!binding)
    return null

  const sampleTime = sampleLoopedTime(timeSeconds, durationSeconds)
  const { leftIndex, rightIndex, alpha } = findTrackSegment(binding.track.times, sampleTime)
  const leftOffset = leftIndex * 3
  const rightOffset = rightIndex * 3
  const leftPosition = new Vector3(
    binding.track.values[leftOffset] ?? binding.initial.x,
    binding.track.values[leftOffset + 1] ?? binding.initial.y,
    binding.track.values[leftOffset + 2] ?? binding.initial.z,
  )

  if (leftIndex === rightIndex)
    return leftPosition

  const rightPosition = new Vector3(
    binding.track.values[rightOffset] ?? binding.initial.x,
    binding.track.values[rightOffset + 1] ?? binding.initial.y,
    binding.track.values[rightOffset + 2] ?? binding.initial.z,
  )

  return leftPosition.lerp(rightPosition, alpha)
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

function buildAnimatedQuaternionTrack(
  trackName: string,
  baseQuaternion: Quaternion,
  components: MotionComponent[],
  options?: {
    organicBinding?: ClipBinding['quaternion']
    organicDurationSeconds?: number
    organicWeight?: number
  },
) {
  const values = new Float32Array(TIMES.length * 4)
  const animated = new Quaternion()
  const delta = new Quaternion()
  const organicCurrent = new Quaternion()
  const organicDelta = new Quaternion()
  const organicWeighted = new Quaternion()
  const identityQuaternion = new Quaternion()
  const euler = new Euler(0, 0, 0, 'XYZ')
  const offset = { x: 0, y: 0, z: 0 }
  const organicDurationSeconds = options?.organicDurationSeconds ?? 0
  const organicWeight = Math.max(0, Math.min(1, options?.organicWeight ?? 0))

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

    animated.copy(baseQuaternion)

    if (options?.organicBinding && organicDurationSeconds > 0 && organicWeight > 0) {
      const sampledQuaternion = sampleBindingQuaternion(options.organicBinding, organicDurationSeconds, timeSeconds)
      if (sampledQuaternion) {
        organicCurrent.copy(sampledQuaternion)
        organicDelta.copy(options.organicBinding.initial).invert().multiply(organicCurrent).normalize()
        organicWeighted.slerpQuaternions(identityQuaternion, organicDelta, organicWeight * envelope)
        animated.multiply(organicWeighted).normalize()
      }
    }

    euler.set(offset.x, offset.y, offset.z, 'XYZ')
    delta.setFromEuler(euler)
    animated.multiply(delta).normalize()

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

function buildAnimatedPositionTrack(
  trackName: string,
  basePosition: Vector3,
  components: PositionMotionComponent[],
) {
  const values = new Float32Array(TIMES.length * 3)
  const animated = new Vector3()
  const offset = { x: 0, y: 0, z: 0 }

  for (let index = 0; index < TIMES.length; index += 1) {
    const timeSeconds = TIMES[index]
    const envelope = loopEnvelope(timeSeconds)
    offset.x = 0
    offset.y = 0
    offset.z = 0

    for (const component of components) {
      const contribution = component.amplitude
        * loopedWave(timeSeconds, component.periodSeconds, component.phase)
        * envelope
      offset[component.axis] += contribution
    }

    animated.copy(basePosition).add(new Vector3(offset.x, offset.y, offset.z))

    const valueOffset = index * 3
    values[valueOffset] = animated.x
    values[valueOffset + 1] = animated.y
    values[valueOffset + 2] = animated.z
  }

  return new VectorKeyframeTrack(trackName, TIMES, values)
}

function resolveNodeName(vrm: VRMCore, boneName: VRMHumanBoneName) {
  return vrm.humanoid?.getNormalizedBoneNode(boneName)?.name ?? null
}

function gestureTrackNodeName(trackName: string) {
  return trackName.replace(/\.(position|quaternion)$/, '')
}

function buildMirroredNodeMap(vrm: VRMCore) {
  const nodeMap = new Map<string, string>()

  for (const [leftBone, rightBone] of MIRRORED_BONE_PAIRS) {
    const leftNode = resolveNodeName(vrm, leftBone)
    const rightNode = resolveNodeName(vrm, rightBone)
    if (!leftNode || !rightNode)
      continue

    nodeMap.set(leftNode, rightNode)
    nodeMap.set(rightNode, leftNode)
  }

  return nodeMap
}

function createMirroredClip(vrm: VRMCore, clip: AnimationClip) {
  const nodeMap = buildMirroredNodeMap(vrm)
  const tracks = clip.tracks.map((track) => {
    const nodeName = gestureTrackNodeName(track.name)
    const suffix = track.name.endsWith('.quaternion')
      ? '.quaternion'
      : track.name.endsWith('.position')
        ? '.position'
        : ''
    const nextNodeName = nodeMap.get(nodeName) ?? nodeName
    const nextTrackName = suffix ? `${nextNodeName}${suffix}` : track.name

    if (track instanceof QuaternionKeyframeTrack) {
      const values = new Float32Array(track.values.length)
      for (let offset = 0; offset < track.values.length; offset += 4) {
        values[offset] = track.values[offset] ?? 0
        values[offset + 1] = -(track.values[offset + 1] ?? 0)
        values[offset + 2] = -(track.values[offset + 2] ?? 0)
        values[offset + 3] = track.values[offset + 3] ?? 1
      }
      return new QuaternionKeyframeTrack(nextTrackName, Float32Array.from(track.times), values)
    }

    if (track instanceof VectorKeyframeTrack) {
      const values = new Float32Array(track.values.length)
      for (let offset = 0; offset < track.values.length; offset += 3) {
        values[offset] = -(track.values[offset] ?? 0)
        values[offset + 1] = track.values[offset + 1] ?? 0
        values[offset + 2] = track.values[offset + 2] ?? 0
      }
      return new VectorKeyframeTrack(nextTrackName, Float32Array.from(track.times), values)
    }

    const clonedTrack = track.clone()
    clonedTrack.name = nextTrackName
    return clonedTrack
  })

  const mirrored = new AnimationClip(`${clip.name || 'breath'}-mirror`, clip.duration, tracks)
  mirrored.resetDuration()
  return mirrored
}

function buildAlternatingBreathClip(vrm: VRMCore, baseClip: AnimationClip) {
  const mirroredClip = createMirroredClip(vrm, baseClip)
  const baseBindings = gatherClipBindings(baseClip)
  const mirroredBindings = gatherClipBindings(mirroredClip)
  const nodeNames = new Set<string>([
    ...baseBindings.keys(),
    ...mirroredBindings.keys(),
  ])
  const tracks = []
  const blendedPosition = new Vector3()
  const blendedQuaternion = new Quaternion()

  for (const nodeName of nodeNames) {
    const baseBinding = baseBindings.get(nodeName)
    const mirroredBinding = mirroredBindings.get(nodeName)

    if (baseBinding?.position || mirroredBinding?.position) {
      const values = new Float32Array(TIMES.length * 3)
      for (let index = 0; index < TIMES.length; index += 1) {
        const timeSeconds = TIMES[index]
        const mirrorBlend = 0.5 - 0.5 * Math.cos((2 * Math.PI * timeSeconds) / DURATION_SECONDS)
        const basePosition = sampleBindingPosition(baseBinding?.position, baseClip.duration, timeSeconds)
        const mirroredPosition = sampleBindingPosition(mirroredBinding?.position, mirroredClip.duration, timeSeconds)
        const finalPosition = basePosition && mirroredPosition
          ? blendedPosition.copy(basePosition).lerp(mirroredPosition, mirrorBlend)
          : (basePosition ?? mirroredPosition)

        if (!finalPosition)
          continue

        const offset = index * 3
        values[offset] = finalPosition.x
        values[offset + 1] = finalPosition.y
        values[offset + 2] = finalPosition.z
      }
      tracks.push(new VectorKeyframeTrack(`${nodeName}.position`, TIMES, values))
    }

    if (baseBinding?.quaternion || mirroredBinding?.quaternion) {
      const values = new Float32Array(TIMES.length * 4)
      for (let index = 0; index < TIMES.length; index += 1) {
        const timeSeconds = TIMES[index]
        const mirrorBlend = 0.5 - 0.5 * Math.cos((2 * Math.PI * timeSeconds) / DURATION_SECONDS)
        const baseQuaternion = sampleBindingQuaternion(baseBinding?.quaternion, baseClip.duration, timeSeconds)
        const mirroredQuaternion = sampleBindingQuaternion(mirroredBinding?.quaternion, mirroredClip.duration, timeSeconds)
        const finalQuaternion = baseQuaternion && mirroredQuaternion
          ? blendedQuaternion.copy(baseQuaternion).slerp(mirroredQuaternion, mirrorBlend).normalize()
          : (baseQuaternion ?? mirroredQuaternion)

        if (!finalQuaternion)
          continue

        const offset = index * 4
        values[offset] = finalQuaternion.x
        values[offset + 1] = finalQuaternion.y
        values[offset + 2] = finalQuaternion.z
        values[offset + 3] = finalQuaternion.w
      }
      tracks.push(new QuaternionKeyframeTrack(`${nodeName}.quaternion`, TIMES, values))
    }
  }

  const clip = new AnimationClip('breath', DURATION_SECONDS, tracks)
  clip.resetDuration()
  return clip
}

export function createBreathClip(vrm: VRMCore, sourceClip: AnimationClip, organicClip?: AnimationClip | null) {
  const pose = gatherBasePose(vrm, sourceClip)
  if (pose.size === 0)
    return null
  symmetrizePairedPose(vrm, pose)

  const organicBindings = organicClip ? gatherClipBindings(organicClip) : null
  const organicDurationSeconds = organicClip?.duration ?? 0
  const motionByNode = new Map<string, MotionComponent[]>()
  const positionMotionByNode = new Map<string, PositionMotionComponent[]>()
  const organicWeightByNode = new Map<string, number>()
  const addMotion = (boneName: VRMHumanBoneName, components: MotionComponent[]) => {
    const nodeName = resolveNodeName(vrm, boneName)
    if (nodeName)
      motionByNode.set(nodeName, components)
  }
  const addPositionMotion = (boneName: VRMHumanBoneName, components: PositionMotionComponent[]) => {
    const nodeName = resolveNodeName(vrm, boneName)
    if (nodeName)
      positionMotionByNode.set(nodeName, components)
  }
  const addOrganicInfluence = (boneName: VRMHumanBoneName, weight: number) => {
    const nodeName = resolveNodeName(vrm, boneName)
    if (nodeName)
      organicWeightByNode.set(nodeName, weight)
  }

  addMotion('hips', [
    { axis: 'x', amplitudeDeg: 0.35, periodSeconds: 4.8, phase: Math.PI / 8 },
    { axis: 'z', amplitudeDeg: 0.7, periodSeconds: 18, phase: Math.PI / 3 },
    { axis: 'y', amplitudeDeg: 0.45, periodSeconds: 24, phase: Math.PI },
  ])
  addPositionMotion('hips', [
    { axis: 'y', amplitude: 0.0055, periodSeconds: 4.8, phase: 0 },
    { axis: 'x', amplitude: 0.003, periodSeconds: 12, phase: Math.PI / 2 },
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
  addMotion('leftUpperLeg', [
    { axis: 'x', amplitudeDeg: 0.17, periodSeconds: 6.2, phase: Math.PI / 10 },
    { axis: 'z', amplitudeDeg: 0.08, periodSeconds: 15.7, phase: Math.PI / 6 },
  ])
  addMotion('rightUpperLeg', [
    { axis: 'x', amplitudeDeg: 0.17, periodSeconds: 6.45, phase: Math.PI * 1.08 },
    { axis: 'z', amplitudeDeg: 0.08, periodSeconds: 15.2, phase: Math.PI * 1.16 },
  ])
  addMotion('leftLowerLeg', [{ axis: 'x', amplitudeDeg: 0.08, periodSeconds: 6.4, phase: Math.PI / 3 }])
  addMotion('rightLowerLeg', [{ axis: 'x', amplitudeDeg: 0.08, periodSeconds: 6.8, phase: Math.PI * 1.28 }])
  addMotion('leftFoot', [
    { axis: 'x', amplitudeDeg: 0.05, periodSeconds: 7.1, phase: Math.PI / 2.8 },
    { axis: 'z', amplitudeDeg: 0.04, periodSeconds: 18.4, phase: Math.PI * 0.82 },
  ])
  addMotion('rightFoot', [
    { axis: 'x', amplitudeDeg: 0.05, periodSeconds: 7.35, phase: Math.PI * 1.36 },
    { axis: 'z', amplitudeDeg: 0.04, periodSeconds: 18.1, phase: Math.PI * 1.86 },
  ])
  addMotion('leftToes', [{ axis: 'x', amplitudeDeg: 0.03, periodSeconds: 7.4, phase: Math.PI / 2 }])
  addMotion('rightToes', [{ axis: 'x', amplitudeDeg: 0.03, periodSeconds: 7.65, phase: Math.PI * 1.44 }])

  addOrganicInfluence('hips', 0.08)
  addOrganicInfluence('spine', 0.16)
  addOrganicInfluence('chest', 0.22)
  addOrganicInfluence('upperChest', 0.28)
  addOrganicInfluence('neck', 0.12)
  addOrganicInfluence('head', 0.08)
  addOrganicInfluence('leftShoulder', 0.22)
  addOrganicInfluence('rightShoulder', 0.22)
  addOrganicInfluence('leftUpperArm', 0.18)
  addOrganicInfluence('rightUpperArm', 0.18)
  addOrganicInfluence('leftLowerArm', 0.12)
  addOrganicInfluence('rightLowerArm', 0.12)
  addOrganicInfluence('leftHand', 0.05)
  addOrganicInfluence('rightHand', 0.05)
  addOrganicInfluence('leftUpperLeg', 0.05)
  addOrganicInfluence('rightUpperLeg', 0.05)
  addOrganicInfluence('leftLowerLeg', 0.03)
  addOrganicInfluence('rightLowerLeg', 0.03)

  const tracks = Array.from(pose.entries()).flatMap(([nodeName, sample]) => {
    const nextTracks = []

    if (sample.position) {
      const positionMotion = positionMotionByNode.get(nodeName)
      if (positionMotion?.length)
        nextTracks.push(buildAnimatedPositionTrack(`${nodeName}.position`, sample.position, positionMotion))
      else
        nextTracks.push(buildConstantPositionTrack(`${nodeName}.position`, sample.position))
    }

    if (!sample.quaternion)
      return nextTracks

    const motion = motionByNode.get(nodeName) ?? []
    const organicBinding = organicBindings?.get(nodeName)?.quaternion
    const organicWeight = organicWeightByNode.get(nodeName) ?? 0
    if (motion.length || (organicBinding && organicWeight > 0)) {
      nextTracks.push(buildAnimatedQuaternionTrack(`${nodeName}.quaternion`, sample.quaternion, motion, {
        organicBinding,
        organicDurationSeconds,
        organicWeight,
      }))
    }
    else {
      nextTracks.push(buildConstantQuaternionTrack(`${nodeName}.quaternion`, sample.quaternion))
    }

    return nextTracks
  })

  const baseClip = new AnimationClip('breath-base', DURATION_SECONDS, tracks)
  baseClip.resetDuration()
  return buildAlternatingBreathClip(vrm, baseClip)
}
