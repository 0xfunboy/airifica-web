<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

type FooterLink = {
  label: string
  href: string
  external?: boolean
}

type FooterSection = {
  title: string
  links: FooterLink[]
}

const sections: FooterSection[] = [
  {
    title: 'Navigate',
    links: [
      { label: 'Products', href: 'https://airewardrop.xyz/products' },
      { label: 'Agents', href: 'https://airewardrop.xyz/agents' },
      { label: 'Roadmap', href: 'https://airewardrop.xyz/roadmap' },
      { label: 'Clients', href: 'https://airewardrop.xyz/clients' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'User Manual', href: 'https://airewardrop.xyz/commands' },
      { label: 'Tokenomics', href: 'https://airewardrop.xyz/tokenomics' },
      { label: 'API & Plugins', href: 'https://airewardrop.xyz/api-plugins' },
      { label: 'FAQ', href: 'https://airewardrop.xyz/faq' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Telegram Channel', href: 'https://t.me/AIRewardrop', external: true },
      { label: 'Telegram Community', href: 'https://t.me/AIR3Community', external: true },
      { label: 'Discord', href: 'https://discord.gg/S4f87VdsHt', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: 'https://airewardrop.xyz/legal' },
      { label: 'Privacy Policy', href: 'https://airewardrop.xyz/legal' },
      { label: 'Cookie Policy', href: 'https://airewardrop.xyz/legal' },
    ],
  },
]

const socials = [
  {
    label: 'X / Twitter',
    href: 'https://x.com/AIRewardrop',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'Telegram',
    href: 'https://t.me/AIR3Community',
    path: 'M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.043 7.924c-.234-.94-.83-1.21-1.42.21L11.79 12.2l-3.26-1.026c-1.154-.384-1.153-1.144.24-1.523l8.693-2.9c.9-.3 1.623.192 1.348 1.487l-1.9 8.54c-.23 1.053-1.002 1.3-1.802.82l-3.514-2.58-1.7 1.64c-.19.19-.35.35-.69.35-.46 0-.62-.16-.69-.77l.25-2.22 5.02-4.52c.46-.43-.1-.68-.69-.26l-6.3 3.97-3.34-1.04c-1.02-.31-1.05-.98.24-1.42l1.33-.45z',
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/S4f87VdsHt',
    path: 'M20.317 4.369A19.791 19.791 0 0016.556 3c-.215.39-.463.917-.636 1.333a18.626 18.626 0 00-3.848 0A12.64 12.64 0 0011.436 3a19.736 19.736 0 00-3.762 1.385c-2.381 3.49-3.025 6.892-2.701 10.24a19.903 19.903 0 003.996 2.02c.33-.452.624-.934.873-1.442a12.815 12.815 0 001.696.136c.6.021 1.2-.02 1.794-.123.253.5.546.98.872 1.432a19.758 19.758 0 004.003-2.03c.332-3.42-.396-6.79-2.79-10.249zm-9.024 8.442c-.785 0-1.426-.721-1.426-1.61 0-.89.63-1.61 1.426-1.61.806 0 1.437.72 1.426 1.61 0 .889-.63 1.61-1.426 1.61zm5.418 0c-.785 0-1.426-.721-1.426-1.61 0-.89.63-1.61 1.426-1.61.806 0 1.437.72 1.426 1.61 0 .889-.62 1.61-1.426 1.61z',
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@AIRewardrop',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    label: 'Twitch',
    href: 'https://www.twitch.tv/airewardrop',
    path: 'M2.373 0l-2.373 2.373v16.85h5.339v4.774h3.183l4.773-4.774h4.137l6.941-6.941v-12.282h-22.003zm18.355 11.007l-3.818 3.818h-4.773l-3.818 3.818v-3.818h-4.46v-12.28h16.87v8.464zm-4.773-6.28v5.34h-2.386v-5.34h2.386zm-4.773 0v5.34h-2.386v-5.34h2.386z',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@airewardrop',
    path: 'M12.525.02c1.31-.02 2.61-.01 3.91.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-2.43.05-4.85-.38-6.75-1.77-2.06-1.52-3.06-3.9-3.06-6.38 0-4.32 2.57-8.05 6.46-9.66.45-.19.92-.38 1.41-.51.02-3.36.01-6.72-.02-10.08zM7.25 15.55c.01.2.02.4.03.6.08 1.67.63 3.29 1.74 4.45 1.12 1.14 2.7 1.68 4.27 1.73v-4.04c-.99-.06-1.97-.34-2.82-.89-.48-.31-.92-.68-1.33-1.11-.01-2.52-.01-5.04.02-7.56.03-1.15.39-2.28.98-3.23.51-.81 1.2-1.46 2.04-1.92v-3.96c-.92.1-1.84.34-2.7.72-.57.25-1.1.57-1.6.93-.02 2.67-.01 5.34.02 8.01z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/airewardrop/',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.85s-.012 3.584-.07 4.85c-.148 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07s-3.584-.012-4.85-.07c-3.252-.148-4.771-1.691-4.919-4.919-.058-1.265-.069-1.645-.069-4.85s.012-3.584.07-4.85c.148-3.225 1.664-4.771 4.919-4.919 1.266-.058 1.644-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948s.014 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072s3.667-.014 4.947-.072c4.358-.2 6.78-2.618 6.98-6.98.059-1.281.073-1.689.073-4.948s-.014-3.667-.072-4.947c-.2-4.358-2.618-6.78-6.98-6.98-1.281-.058-1.689-.072-4.948-.072zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4s1.791-4 4-4 4 1.79 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.441 1.441 1.441 1.441-.645 1.441-1.441-.645-1.44-1.441-1.44z',
  },
] as const

const isExpanded = ref(false)
let hideTimer: number | null = null

function clearHideTimer() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleAutoHide() {
  clearHideTimer()
  hideTimer = window.setTimeout(() => {
    isExpanded.value = false
  }, 5000)
}

function openDrawer() {
  isExpanded.value = true
  scheduleAutoHide()
}

function closeDrawer() {
  isExpanded.value = false
  clearHideTimer()
}

function toggleDrawer() {
  if (isExpanded.value) {
    closeDrawer()
    return
  }

  openDrawer()
}

function handleMouseEnter() {
  clearHideTimer()
}

function handleMouseLeave() {
  if (isExpanded.value)
    scheduleAutoHide()
}

onBeforeUnmount(() => {
  clearHideTimer()
})
</script>

<template>
  <footer class="stage-footer" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <div class="stage-footer__drawer" :class="{ 'stage-footer__drawer--open': isExpanded }">
      <div class="stage-footer__main">
        <div class="stage-footer__brand">
          <a href="https://airewardrop.xyz" class="stage-footer__brand-link" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="stage-footer__brand-icon" aria-hidden="true">
              <path d="M20 4L6 36H14L20 22L26 36H34L20 4Z" fill="currentColor" />
              <path d="M20 12V22" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <span>AIRewardrop</span>
          </a>
          <p class="stage-footer__brand-copy">
            Autonomous agent infrastructure for crypto.
          </p>
          <a href="https://airewardrop.xyz/blog" target="_blank" rel="noopener noreferrer" class="stage-footer__brand-blog">
            Our Blog →
          </a>
        </div>

        <div class="stage-footer__grid">
          <div v-for="section in sections" :key="section.title" class="stage-footer__column">
            <h3>{{ section.title }}</h3>
            <ul>
              <li v-for="link in section.links" :key="link.label">
                <a :href="link.href" :target="link.external ? '_blank' : undefined" :rel="link.external ? 'noopener noreferrer' : undefined">
                  {{ link.label }}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="stage-footer__bar">
      <button
        type="button"
        class="stage-footer__toggle"
        :class="{ 'stage-footer__toggle--open': isExpanded }"
        :aria-expanded="isExpanded"
        @click="toggleDrawer"
      >
        <span class="stage-footer__toggle-glyph" aria-hidden="true">
          <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.25 10.5 9 5.75l4.75 4.75" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span>{{ isExpanded ? 'Hide footer' : 'Show footer' }}</span>
      </button>

      <p class="stage-footer__disclaimer">
        © 2025 AIRewardrop. All rights reserved. Not financial advice.
      </p>

      <div class="stage-footer__socials">
        <a
          v-for="social in socials"
          :key="social.label"
          :href="social.href"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="social.label"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path :d="social.path" />
          </svg>
        </a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.stage-footer {
  position: relative;
  width: 100%;
  padding: 0 16px 12px;
  pointer-events: none;
}

.stage-footer__drawer,
.stage-footer__bar {
  pointer-events: auto;
}

.stage-footer__drawer {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transform: translateY(28px);
  transition:
    max-height 320ms ease,
    opacity 220ms ease,
    transform 320ms ease;
}

.stage-footer__drawer--open {
  max-height: 280px;
  opacity: 1;
  transform: translateY(0);
}

.stage-footer__main {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
  gap: 12px;
  align-items: start;
  margin: 0 auto 10px;
  padding: 16px 18px 14px;
  border: 1px solid rgba(103, 232, 249, 0.16);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(8, 30, 44, 0.92), rgba(5, 20, 31, 0.88)),
    rgba(6, 25, 39, 0.82);
  box-shadow: 0 -16px 48px rgba(5, 23, 36, 0.36);
  backdrop-filter: blur(20px);
}

.stage-footer__brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-footer__brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #67e8f9;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
}

.stage-footer__brand-icon {
  width: 28px;
  height: 28px;
}

.stage-footer__brand-copy {
  margin: 0;
  max-width: 18rem;
  color: rgba(224, 242, 254, 0.72);
  font-size: 0.82rem;
  line-height: 1.5;
}

.stage-footer__brand-blog {
  color: rgba(240, 249, 255, 0.92);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

.stage-footer__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  justify-items: end;
  text-align: right;
}

.stage-footer__column h3 {
  margin: 0 0 6px;
  color: rgba(103, 232, 249, 0.92);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stage-footer__column ul {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stage-footer__column a,
.stage-footer__brand-blog {
  transition:
    color 160ms ease,
    text-shadow 160ms ease;
}

.stage-footer__column a {
  color: rgba(224, 242, 254, 0.68);
  font-size: 0.8rem;
  text-decoration: none;
}

.stage-footer__column a:hover,
.stage-footer__brand-blog:hover,
.stage-footer__brand-link:hover {
  color: #a5f3fc;
  text-shadow: 0 0 14px rgba(103, 232, 249, 0.28);
}

.stage-footer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 58px;
  padding: 10px 14px;
  border: 1px solid rgba(103, 232, 249, 0.14);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(7, 28, 42, 0.92), rgba(4, 17, 27, 0.9)),
    rgba(6, 25, 39, 0.78);
  box-shadow: 0 -10px 34px rgba(5, 23, 36, 0.28);
  backdrop-filter: blur(18px);
}

.stage-footer__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 14px 0 10px;
  border: 1px solid rgba(103, 232, 249, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(240, 249, 255, 0.9);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    box-shadow 180ms ease,
    background 160ms ease;
}

.stage-footer__toggle:hover {
  color: #a5f3fc;
  border-color: rgba(103, 232, 249, 0.28);
  background: rgba(103, 232, 249, 0.08);
  box-shadow: 0 0 24px rgba(103, 232, 249, 0.22);
}

.stage-footer__toggle-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #67e8f9;
  transition:
    transform 220ms ease,
    filter 180ms ease;
}

.stage-footer__toggle:hover .stage-footer__toggle-glyph {
  filter: drop-shadow(0 0 10px rgba(103, 232, 249, 0.42));
}

.stage-footer__toggle--open .stage-footer__toggle-glyph {
  transform: rotate(180deg);
}

.stage-footer__toggle-glyph svg {
  width: 18px;
  height: 18px;
}

.stage-footer__disclaimer {
  flex: 1 1 auto;
  margin: 0;
  color: rgba(224, 242, 254, 0.66);
  font-size: 0.72rem;
  line-height: 1.45;
  text-align: center;
}

.stage-footer__socials {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
}

.stage-footer__socials a {
  color: rgba(224, 242, 254, 0.7);
  transition:
    color 160ms ease,
    transform 160ms ease,
    filter 160ms ease;
}

.stage-footer__socials a:hover {
  color: #67e8f9;
  transform: translateY(-1px);
  filter: drop-shadow(0 0 10px rgba(103, 232, 249, 0.36));
}

.stage-footer__socials svg {
  width: 21px;
  height: 21px;
}

@media (max-width: 1180px) {
  .stage-footer {
    padding-inline: 12px;
  }

  .stage-footer__grid {
    gap: 8px;
  }
}

@media (max-width: 980px) {
  .stage-footer {
    padding: 12px 12px 14px;
  }

  .stage-footer__drawer--open {
    max-height: 440px;
  }

  .stage-footer__main {
    grid-template-columns: 1fr;
  }

  .stage-footer__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: start;
    text-align: left;
  }

  .stage-footer__bar {
    flex-wrap: wrap;
    justify-content: center;
  }

  .stage-footer__disclaimer {
    order: 3;
    width: 100%;
  }
}
</style>
