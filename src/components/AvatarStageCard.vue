<script setup lang="ts">
import { AvatarStage } from '@airifica/avatar3d'

import { useAvatarPresence } from '@/modules/avatar/presence'

const avatar = useAvatarPresence()
</script>

<template>
  <div class="avatar-card">
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

    <div class="avatar-card__overlay">
      <span class="avatar-card__label">Avatar runtime</span>
      <strong>
        {{
          avatar.loadingState.value === 'ready'
            ? 'VRM stage online'
            : avatar.loadingState.value === 'error'
              ? 'VRM stage error'
              : avatar.loadingState.value === 'empty'
                ? 'VRM model missing'
                : 'Loading VRM stage'
        }}
      </strong>
      <p v-if="avatar.error.value">
        {{ avatar.error.value }}
      </p>
      <p v-else-if="avatar.loadingState.value === 'empty'">
        Set `VITE_AIRIFICA_AVATAR_MODEL_URL` to mount the production VRM.
      </p>
      <p v-else-if="avatar.loadingState.value !== 'ready'">
        Renderer, camera and expression state are preparing the stage.
      </p>
      <p v-else>
        Expression and speaking pulse are bound to the AIR3 assistant response stream.
      </p>
      <span class="avatar-card__progress">
        {{ avatar.loadProgress.value }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.avatar-card {
  position: relative;
  min-height: min(62vh, 680px);
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background:
    radial-gradient(circle at 50% 18%, rgba(91, 214, 255, 0.18), transparent 22%),
    linear-gradient(180deg, rgba(5, 17, 28, 0.2), rgba(5, 17, 28, 0.82)),
    linear-gradient(135deg, rgba(13, 39, 64, 0.78), rgba(8, 18, 30, 0.92));
}

.avatar-card__stage {
  width: 100%;
  min-height: inherit;
}

.avatar-card__overlay {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 22px;
  display: grid;
  gap: 10px;
  max-width: 30rem;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background: rgba(6, 20, 33, 0.74);
  backdrop-filter: blur(18px);
}

.avatar-card__label {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
}

.avatar-card__overlay strong {
  font-size: 1.4rem;
  letter-spacing: -0.04em;
}

.avatar-card__overlay p {
  margin: 0;
  color: var(--text-1);
  line-height: 1.55;
}

.avatar-card__progress {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background: rgba(8, 20, 33, 0.62);
}

@media (max-width: 760px) {
  .avatar-card,
  .avatar-card__stage {
    min-height: 44vh;
  }

  .avatar-card__overlay {
    left: 14px;
    right: 14px;
    bottom: 14px;
  }
}
</style>
