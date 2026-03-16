<script setup lang="ts">
import { AvatarStage } from '@airifica/avatar3d'

import { useAvatarPresence } from '@/modules/avatar/presence'

const avatar = useAvatarPresence()
</script>

<template>
  <div class="avatar-stage-layer">
    <AvatarStage
      class="avatar-stage-layer__stage"
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
  </div>
</template>

<style scoped>
.avatar-stage-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.avatar-stage-layer__stage {
  width: 100%;
  height: 100%;
}
</style>
