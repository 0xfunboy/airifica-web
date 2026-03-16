<script setup lang="ts">
import { appConfig } from '@/config/app'
</script>

<template>
  <a class="header-link" href="/" aria-label="AIR3 home">
    <img :src="appConfig.brandIconUrl" alt="" class="header-link__icon">
    <img :src="appConfig.brandLogoUrl" alt="AIRewardrop" class="header-link__logo">
  </a>
</template>

<style scoped>
.header-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 8px;
  text-decoration: none;
}

.header-link__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  object-fit: cover;
  flex: 0 0 auto;
}

.header-link__logo {
  width: auto;
  height: 30px;
  object-fit: contain;
  flex: 0 1 auto;
}

@media (max-width: 720px) {
  .header-link {
    padding: 0 4px;
  }

  .header-link__icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }

  .header-link__logo {
    height: 24px;
  }
}
</style>
