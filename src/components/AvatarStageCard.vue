<script setup lang="ts">
import { computed } from 'vue'

import { AvatarStage } from '@airifica/avatar3d'

import { useAvatarPresence } from '@/modules/avatar/presence'

const avatar = useAvatarPresence()

const statusLabel = computed(() => {
  if (avatar.loadingState.value === 'ready')
    return 'Avatar online'
  if (avatar.loadingState.value === 'error')
    return 'Avatar unavailable'
  if (avatar.loadingState.value === 'empty')
    return 'Avatar pending'
  return 'Loading avatar'
})

const statusHint = computed(() => {
  if (avatar.error.value)
    return avatar.error.value
  if (avatar.loadingState.value === 'ready')
    return avatar.speaking.value ? 'Speech pulse active' : `Expression ${avatar.expression.value}`
  if (avatar.loadingState.value === 'empty')
    return 'VRM model not configured.'
  return `Renderer preparing ${avatar.loadProgress.value}%`
})
</script>

<template>
  <div class="avatar-card">
    <div class="avatar-card__telemetry">
      <span>{{ avatar.expression.value }}</span>
      <span>{{ avatar.speaking.value ? 'speaking' : 'idle' }}</span>
    </div>

    <AvatarStage
      class="avatar-card__stage"
      :model-url="avatar.modelUrl.value"
      :expression="avatar.expression.value"
      :speaking="avatar.speaking.value"
      @load-start="avatar.handleLoadStart"
      @load-progress="avatar.handleLoadProgress"
      @load-finish="avatar.handleLoadFinish"
      @error="avatar.handleLoadError"
    />

    <div class="avatar-card__floor-glow" />

    <div class="avatar-card__status">
      <span class="avatar-card__label">AIR3 avatar</span>
      <strong>{{ statusLabel }}</strong>
      <p>{{ statusHint }}</p>
    </div>
  </div>
</template>

<style scoped>
.avatar-card {
  position: relative;
  min-height: min(76vh, 840px);
  overflow: hidden;
  border-radius: 30px;
}

.avatar-card__stage {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: inherit;
}

.avatar-card__telemetry {
  position: absolute;
  top: 24px;
  left: 50%;
  z-index: 2;
  display: flex;
  gap: 10px;
  transform: translateX(-50%);
}

.avatar-card__telemetry span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  background: rgba(6, 18, 30, 0.52);
  backdrop-filter: blur(14px);
  color: rgba(229, 241, 249, 0.84);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.avatar-card__floor-glow {
  position: absolute;
  left: 50%;
  bottom: 7%;
  z-index: 0;
  width: min(44vw, 520px);
  height: min(14vw, 160px);
  transform: translateX(-50%);
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(83, 215, 255, 0.42), rgba(83, 215, 255, 0.12) 42%, transparent 72%);
  filter: blur(14px);
  opacity: 0.9;
}

.avatar-card__status {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 2;
  display: grid;
  gap: 6px;
  width: min(460px, calc(100% - 40px));
  padding: 14px 18px;
  border-radius: 20px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(5, 16, 27, 0.48);
  transform: translateX(-50%);
  backdrop-filter: blur(18px);
}

.avatar-card__label {
  color: rgba(188, 214, 234, 0.72);
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.avatar-card__status strong {
  font-size: 1.05rem;
  letter-spacing: -0.03em;
}

.avatar-card__status p {
  margin: 0;
  color: rgba(214, 227, 238, 0.76);
  font-size: 0.92rem;
}

@media (max-width: 980px) {
  .avatar-card {
    min-height: min(68vh, 720px);
  }
}

@media (max-width: 760px) {
  .avatar-card,
  .avatar-card__stage {
    min-height: 50vh;
  }

  .avatar-card__telemetry {
    top: 14px;
    gap: 8px;
  }

  .avatar-card__telemetry span {
    min-height: 28px;
    padding: 0 10px;
    font-size: 10px;
  }

  .avatar-card__status {
    bottom: 14px;
    width: calc(100% - 28px);
    padding: 12px 14px;
  }
}
</style>
