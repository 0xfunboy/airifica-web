<script setup lang="ts">
import { AvatarStage } from '@airifica/avatar3d'

import { useAvatarPresence } from '@/modules/avatar/presence'
import { useSpeechRuntime } from '@/modules/speech/runtime'

const avatar = useAvatarPresence()
const speech = useSpeechRuntime()
</script>

<template>
  <div class="avatar-layer">
    <AvatarStage
      class="avatar-layer__stage"
      :model-url="avatar.modelUrl.value"
      :expression="avatar.expression.value"
      :speaking="avatar.speaking.value"
      :manual-mouth-open="avatar.mouthOpenSize.value"
      :ambient-animation="avatar.ambientAnimation.value"
      @load-start="avatar.handleLoadStart"
      @load-progress="avatar.handleLoadProgress"
      @load-finish="avatar.handleLoadFinish"
      @error="avatar.handleLoadError"
    />

    <div class="avatar-layer__status">
      <span class="avatar-layer__badge">{{ avatar.expression.value }}</span>
      <span class="avatar-layer__badge">{{ speech.speaking.value ? 'speaking' : 'idle' }}</span>
      <span class="avatar-layer__badge">{{ avatar.loadingState.value === 'ready' ? 'vrm ready' : `${avatar.loadProgress.value}%` }}</span>
    </div>
  </div>
</template>

<style scoped>
.avatar-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.avatar-layer__stage {
  width: 100%;
  height: 100%;
}

.avatar-layer__status {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 2;
  display: flex;
  gap: 10px;
  transform: translateX(-50%);
}

.avatar-layer__badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(5, 17, 28, 0.46);
  color: rgba(230, 242, 250, 0.84);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  backdrop-filter: blur(16px);
}

@media (max-width: 760px) {
  .avatar-layer__status {
    bottom: 14px;
    flex-wrap: wrap;
    justify-content: center;
    width: calc(100% - 24px);
  }
}
</style>
