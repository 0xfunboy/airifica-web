<script setup lang="ts">
import { appConfig } from '@/config/app'
import { useAvatarModelStore } from '@/modules/avatar/model'

const avatarModel = useAvatarModelStore()
</script>

<template>
  <div class="header-link">
    <a class="header-link__home" href="/" :aria-label="avatarModel.selectedKey.value === 'pacifica' ? 'AIRifica home' : 'AIR3 home'">
      <img :src="appConfig.brandIconUrl" alt="" class="header-link__icon">
      <span class="header-link__title" :class="{ 'header-link__title--brandcase': avatarModel.selectedKey.value === 'pacifica' }">
        {{ avatarModel.selectedKey.value === 'pacifica' ? 'AIRifica' : `${appConfig.productName} Agent` }}
      </span>
      <span class="header-link__by">by</span>
    </a>
    <a class="header-link__brand" :href="appConfig.brandSiteUrl" target="_blank" rel="noreferrer" aria-label="AIRewardrop">
      <img :src="appConfig.brandLogoUrl" alt="AIRewardrop" class="header-link__logo">
    </a>
  </div>
</template>

<style scoped>
.header-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 8px;
}

.header-link__home,
.header-link__brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.header-link__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  object-fit: cover;
  flex: 0 0 auto;
}

.header-link__title {
  color: #f3fbff;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.header-link__title--brandcase {
  text-transform: none;
}

.header-link__by {
  color: rgba(223, 236, 247, 0.56);
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
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
    gap: 8px;
  }

  .header-link__icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }

  .header-link__title {
    font-size: 0.84rem;
  }

  .header-link__by {
    font-size: 0.68rem;
  }

  .header-link__logo {
    height: 24px;
  }
}
</style>
