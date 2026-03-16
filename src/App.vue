<script setup lang="ts">
import { computed } from 'vue'

import { appConfig } from '@/config/app'
import { describeUrl, truncateMiddle } from '@/lib/format'

const endpointCards = computed(() => [
  {
    label: 'Runtime',
    value: describeUrl(appConfig.runtimeBaseUrl, 'not configured'),
    detail: 'AIR3 session, message and proposal flow',
  },
  {
    label: 'Service API',
    value: describeUrl(appConfig.serviceApiBaseUrl, 'not configured'),
    detail: 'Pacifica actions, challenge and market context',
  },
  {
    label: 'Avatar',
    value: describeUrl(appConfig.avatarModelUrl, 'pending'),
    detail: appConfig.avatarModelUrl ? truncateMiddle(appConfig.avatarModelUrl, 44) : 'VRM model mounts in the avatar runtime step',
  },
])

const surfaces = [
  {
    title: 'Wallet session',
    description: 'Solana connect, challenge, verify, token storage, request headers and session identity.',
  },
  {
    title: 'Pacifica account',
    description: 'Overview, builder approval, agent binding, execution readiness and position control.',
  },
  {
    title: 'Conversation state',
    description: 'Conversation id, assistant proposal follow-up, market sync and avatar state linkage.',
  },
]
</script>

<template>
  <div class="bootstrap-shell">
    <header class="topbar panel">
      <div>
        <p class="eyebrow">
          Airifica Web
        </p>
        <h1 class="hero-title">
          AIR3 stage workspace
        </h1>
        <p class="hero-copy">
          Foundation shell aligned to the live AIR3 product: stage viewport, wallet-authenticated execution flow, Pacifica surface and conversation runtime.
        </p>
      </div>
      <div class="topbar__meta">
        <span class="meta-chip">{{ appConfig.defaultMarket }} focus</span>
        <span class="meta-chip">{{ appConfig.brandName }}</span>
      </div>
    </header>

    <main class="bootstrap-grid">
      <section class="stage-surface panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">
              Stage layout
            </p>
            <h2>Primary runtime surface</h2>
          </div>
          <span class="status-dot" />
        </div>

        <div class="stage-surface__canvas">
          <div class="stage-surface__glow" />
          <div class="stage-surface__content">
            <span class="stage-surface__label">Avatar viewport</span>
            <strong>Three + VRM runtime mounts here</strong>
            <p>
              The shell already reserves the final layout geometry: backdrop, center stage, market rail and conversation workspace.
            </p>
          </div>
        </div>

        <div class="endpoint-grid">
          <article v-for="card in endpointCards" :key="card.label" class="endpoint-card">
            <p class="endpoint-card__label">
              {{ card.label }}
            </p>
            <strong>{{ card.value }}</strong>
            <span>{{ card.detail }}</span>
          </article>
        </div>
      </section>

      <aside class="rail-stack">
        <section v-for="surface in surfaces" :key="surface.title" class="panel rail-card">
          <p class="eyebrow">
            Module
          </p>
          <h2>{{ surface.title }}</h2>
          <p>{{ surface.description }}</p>
        </section>
      </aside>
    </main>
  </div>
</template>
