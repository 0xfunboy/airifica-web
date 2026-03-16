export const BREATH_URL = 'procedural://breath'
export const NO_ANIM_URL = 'procedural://none'

export const animationUrls = {
  BlingBangBangBorn: '/vrm-animations/BlingBangBangBorn.vrma',
  DanceStepping: '/vrm-animations/DanceStepping.vrma',
  DanceArmWave: '/vrm-animations/DanceArmWave.vrma',
  DanceHipSwing: '/vrm-animations/DanceHipSwing.vrma',
  CherryPop: '/vrm-animations/CherryPop.vrma',
  LoveScream: '/vrm-animations/LoveScream.vrma',
} as const

export type AmbientAnimationName = keyof typeof animationUrls

export const BREATH_SOURCE_URL = animationUrls.DanceStepping
