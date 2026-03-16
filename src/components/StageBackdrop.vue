<script setup lang="ts">
import { appConfig } from '@/config/app'
</script>

<template>
  <div class="stage-backdrop" aria-hidden="true">
    <img
      :src="appConfig.stageBackgroundUrl"
      alt=""
      class="stage-backdrop__image"
      loading="eager"
      decoding="async"
    >
    <div class="stage-backdrop__wash" />
    <div class="stage-backdrop__grid" />
    <div class="stage-backdrop__beam stage-backdrop__beam--left" />
    <div class="stage-backdrop__beam stage-backdrop__beam--right" />

    <div class="stage-backdrop__brand-mark">
      <img :src="appConfig.brandIconUrl" alt="">
    </div>

    <div class="stage-backdrop__logo-watermark">
      <img :src="appConfig.brandLogoUrl" alt="">
    </div>
  </div>
</template>

<style scoped>
.stage-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.stage-backdrop__image,
.stage-backdrop__wash,
.stage-backdrop__grid,
.stage-backdrop__beam {
  position: absolute;
  inset: 0;
}

.stage-backdrop__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stage-backdrop__wash {
  background:
    radial-gradient(circle at 50% 18%, rgba(59, 202, 255, 0.18), transparent 26%),
    radial-gradient(circle at 16% 28%, rgba(69, 222, 255, 0.12), transparent 28%),
    radial-gradient(circle at 84% 30%, rgba(69, 222, 255, 0.1), transparent 22%),
    linear-gradient(180deg, rgba(1, 9, 19, 0.14), rgba(1, 11, 22, 0.58) 56%, rgba(1, 8, 17, 0.92));
}

.stage-backdrop__grid {
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(0, 183, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 183, 255, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.84), rgba(0, 0, 0, 0.12));
}

.stage-backdrop__beam {
  filter: blur(80px);
  opacity: 0.28;
}

.stage-backdrop__beam--left {
  inset: 18% auto auto 10%;
  width: min(32vw, 420px);
  height: min(18vw, 220px);
  background: radial-gradient(circle at center, rgba(77, 227, 255, 0.7), transparent 70%);
}

.stage-backdrop__beam--right {
  inset: auto 8% 12% auto;
  width: min(24vw, 320px);
  height: min(16vw, 190px);
  background: radial-gradient(circle at center, rgba(50, 137, 255, 0.62), transparent 72%);
}

.stage-backdrop__brand-mark {
  position: absolute;
  top: 24px;
  right: 24px;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 26px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(5, 17, 28, 0.44);
  backdrop-filter: blur(18px);
}

.stage-backdrop__brand-mark img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  opacity: 0.94;
}

.stage-backdrop__logo-watermark {
  position: absolute;
  left: 50%;
  bottom: 8%;
  transform: translateX(-50%);
  width: min(460px, 46vw);
  opacity: 0.08;
}

.stage-backdrop__logo-watermark img {
  width: 100%;
  height: auto;
  object-fit: contain;
}

@media (max-width: 760px) {
  .stage-backdrop__brand-mark {
    top: 14px;
    right: 14px;
    width: 58px;
    height: 58px;
    border-radius: 18px;
  }

  .stage-backdrop__brand-mark img {
    width: 30px;
    height: 30px;
  }

  .stage-backdrop__logo-watermark {
    width: min(300px, 70vw);
    bottom: 6%;
  }
}
</style>
