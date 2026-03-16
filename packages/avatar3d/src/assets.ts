export const BREATH_URL = 'procedural://breath'
export const NO_ANIM_URL = 'procedural://none'

export const animationUrls = {
  DanceStepping: '/vrm-animations/DanceStepping.vrma',
  CherryPop: '/vrm-animations/CherryPop.vrma',
  LoveScream: '/vrm-animations/LoveScream.vrma',
  DanceArmWave: '/vrm-animations/DanceArmWave.vrma',
  DanceHipSwing: '/vrm-animations/DanceHipSwing.vrma',
} as const

export type AmbientAnimationName = keyof typeof animationUrls

export const BREATH_SOURCE_URL = animationUrls.DanceStepping
