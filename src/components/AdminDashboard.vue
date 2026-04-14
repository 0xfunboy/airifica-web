<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import type { Air3AdminMetricEntry, Air3AdminOverviewResponse } from '@/lib/air3-client'

import { createAir3Client } from '@/lib/air3'
import { useAdminPanel } from '@/modules/admin/panel'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()
const panel = useAdminPanel()

const state = reactive({
  loading: false,
  error: null as string | null,
  payload: null as Air3AdminOverviewResponse | null,
  lastLoadedAt: 0,
})

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'trading', label: 'Trading' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'runtime', label: 'Runtime' },
] as const

const canLoad = computed(() => wallet.isAuthenticated.value && wallet.isAdmin.value)

function formatUsd(value: number) {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) >= 100 ? 2 : 4,
  })}`
}

function formatCount(value: number) {
  return Number(value || 0).toLocaleString('en-US')
}

function formatDateTime(value: number | null | undefined) {
  if (!value)
    return 'n/a'

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortWallet(value: string) {
  if (!value)
    return 'n/a'
  if (value.length <= 14)
    return value
  return `${value.slice(0, 6)}…${value.slice(-6)}`
}

function normalizeMetrics(entries: Air3AdminMetricEntry[]) {
  return entries.map(entry => ({
    ...entry,
    label: entry.key,
  }))
}

async function refresh() {
  if (!canLoad.value || state.loading)
    return

  state.loading = true
  state.error = null
  try {
    state.payload = await createAir3Client().fetchAdminOverview(wallet.buildRequestHeaders())
    state.lastLoadedAt = Date.now()
  }
  catch (error) {
    state.error = error instanceof Error ? error.message : 'Failed to load admin dashboard.'
  }
  finally {
    state.loading = false
  }
}

watch(
  () => [panel.open.value, canLoad.value] as const,
  ([open, allowed]) => {
    if (open && allowed && !state.payload)
      void refresh()
  },
  { immediate: true },
)

const overviewCards = computed(() => {
  const overview = state.payload?.overview
  if (!overview)
    return []

  return [
    { label: 'Known wallets', value: formatCount(overview.totalKnownWallets) },
    { label: 'Verified users', value: formatCount(overview.verifiedWallets) },
    { label: 'Pacifica builders', value: formatCount(overview.pacificaBuildersApproved) },
    { label: 'Active agents', value: formatCount(overview.pacificaActiveAgents) },
    { label: 'Executed trades', value: formatCount(overview.executedTrades) },
    { label: 'Pacifica volume', value: formatUsd(overview.pacificaExecutedVolumeUsd) },
    { label: 'External volume', value: formatUsd(overview.externalReportedVolumeUsd) },
    { label: 'Tracked markets', value: formatCount(overview.marketUniverseCount) },
  ]
})

const currentTab = computed(() => panel.activeTab.value)
</script>

<template>
  <div v-if="panel.open.value" class="admin-dashboard">
    <div class="admin-dashboard__backdrop" @click="panel.closePanel()" />

    <section class="admin-dashboard__panel">
      <header class="admin-dashboard__header">
        <div>
          <p class="admin-dashboard__eyebrow">Airifica Control Panel</p>
          <h2>Admin dashboard</h2>
          <p class="admin-dashboard__meta">
            Wallet {{ shortWallet(wallet.address.value || '') }} ·
            Last refresh {{ state.lastLoadedAt ? formatDateTime(state.lastLoadedAt) : 'never' }}
          </p>
        </div>

        <div class="admin-dashboard__header-actions">
          <button type="button" class="admin-dashboard__action" :disabled="state.loading" @click="refresh">
            {{ state.loading ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button type="button" class="admin-dashboard__action admin-dashboard__action--ghost" @click="panel.closePanel()">
            Close
          </button>
        </div>
      </header>

      <div v-if="!wallet.isAuthenticated.value" class="admin-dashboard__empty">
        Sign the wallet session to access the admin dashboard.
      </div>
      <div v-else-if="!wallet.isAdmin.value" class="admin-dashboard__empty">
        This wallet is not in the admin allowlist. Re-sign after updating the backend env if needed.
      </div>
      <div v-else>
        <nav class="admin-dashboard__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            :class="['admin-dashboard__tab', { 'admin-dashboard__tab--active': currentTab === tab.key }]"
            @click="panel.setTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <p v-if="state.error" class="admin-dashboard__error">
          {{ state.error }}
        </p>

        <div v-if="state.payload" class="admin-dashboard__body">
          <template v-if="currentTab === 'overview'">
            <section class="admin-dashboard__stats">
              <article v-for="card in overviewCards" :key="card.label" class="admin-dashboard__stat">
                <span class="admin-dashboard__stat-label">{{ card.label }}</span>
                <strong class="admin-dashboard__stat-value">{{ card.value }}</strong>
              </article>
            </section>

            <section class="admin-dashboard__grid">
              <article class="admin-dashboard__card">
                <h3>Runtime</h3>
                <p>Service <strong>{{ state.payload.runtime.service }}</strong></p>
                <p>Node env <strong>{{ state.payload.runtime.nodeEnv }}</strong></p>
                <p>Uptime <strong>{{ formatCount(state.payload.runtime.uptimeSec) }}s</strong></p>
                <p>PID <strong>{{ state.payload.runtime.pid }}</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Telegram</h3>
                <p>Bot <strong>{{ state.payload.telegram.botUsername || 'not configured' }}</strong></p>
                <p>Linked chats <strong>{{ formatCount(state.payload.telegram.linkedChats) }}</strong></p>
                <p>Alerts on <strong>{{ formatCount(state.payload.telegram.alertsEnabledChats) }}</strong></p>
                <p>Live <strong>{{ state.payload.telegram.heartbeat.live ? 'yes' : 'no' }}</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Request heat</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="entry in normalizeMetrics(state.payload.trading.topRequestedTickers).slice(0, 5)" :key="entry.key" class="admin-dashboard__metric-row">
                    <span>{{ entry.label }}</span>
                    <strong>{{ formatCount(entry.count) }}</strong>
                  </div>
                </div>
              </article>
            </section>
          </template>

          <template v-else-if="currentTab === 'users'">
            <section class="admin-dashboard__table-card">
              <h3>Recent wallets</h3>
              <div class="admin-dashboard__table">
                <div class="admin-dashboard__table-row admin-dashboard__table-row--head">
                  <span>Wallet</span>
                  <span>Seen</span>
                  <span>Source</span>
                  <span>Telegram</span>
                  <span>Binding</span>
                  <span>Last trade</span>
                </div>
                <div v-for="user in state.payload.users.recent" :key="user.walletAddress" class="admin-dashboard__table-row">
                  <span>{{ shortWallet(user.walletAddress) }}<small v-if="user.isAdmin"> admin</small></span>
                  <span>{{ formatDateTime(user.lastSeenAt) }}</span>
                  <span>{{ user.lastSource || 'n/a' }}</span>
                  <span>{{ formatCount(user.linkedChats) }}</span>
                  <span>{{ user.binding?.isActive ? 'active' : user.binding ? 'bound' : 'none' }}</span>
                  <span>{{ user.latestTrade ? `${user.latestTrade.side} ${user.latestTrade.symbol}` : 'n/a' }}</span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="currentTab === 'trading'">
            <section class="admin-dashboard__grid">
              <article class="admin-dashboard__card">
                <h3>Proposal status</h3>
                <div class="admin-dashboard__metric-list">
                  <div
                    v-for="(count, key) in state.payload.trading.proposalStatusCounts"
                    :key="key"
                    class="admin-dashboard__metric-row"
                  >
                    <span>{{ key }}</span>
                    <strong>{{ formatCount(count) }}</strong>
                  </div>
                </div>
              </article>

              <article class="admin-dashboard__card">
                <h3>Top tickers</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="entry in normalizeMetrics(state.payload.trading.topRequestedTickers)" :key="entry.key" class="admin-dashboard__metric-row">
                    <span>{{ entry.label }}</span>
                    <strong>{{ formatCount(entry.count) }}</strong>
                  </div>
                </div>
              </article>

              <article class="admin-dashboard__card">
                <h3>Top contract addresses</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="entry in normalizeMetrics(state.payload.trading.topRequestedContracts)" :key="entry.key" class="admin-dashboard__metric-row">
                    <span>{{ shortWallet(entry.label) }}</span>
                    <strong>{{ formatCount(entry.count) }}</strong>
                  </div>
                </div>
              </article>
            </section>

            <section class="admin-dashboard__table-card">
              <h3>Recent executed trades</h3>
              <div class="admin-dashboard__table">
                <div class="admin-dashboard__table-row admin-dashboard__table-row--head">
                  <span>Asset</span>
                  <span>Venue</span>
                  <span>Size</span>
                  <span>Margin</span>
                  <span>Lev</span>
                  <span>When</span>
                </div>
                <div v-for="trade in state.payload.trading.recentTrades" :key="trade.id" class="admin-dashboard__table-row">
                  <span>{{ trade.side }} {{ trade.symbol }}</span>
                  <span>{{ trade.venue }}</span>
                  <span>{{ formatUsd(trade.notionalUsd) }}</span>
                  <span>{{ formatUsd(trade.marginUsd) }}</span>
                  <span>{{ trade.leverage }}x</span>
                  <span>{{ formatDateTime(trade.updatedAt) }}</span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="currentTab === 'telegram'">
            <section class="admin-dashboard__grid">
              <article class="admin-dashboard__card">
                <h3>Bot state</h3>
                <p>Username <strong>{{ state.payload.telegram.botUsername || 'n/a' }}</strong></p>
                <p>Configured <strong>{{ state.payload.telegram.configured ? 'yes' : 'no' }}</strong></p>
                <p>Live <strong>{{ state.payload.telegram.heartbeat.live ? 'yes' : 'no' }}</strong></p>
                <p>Last heartbeat <strong>{{ formatDateTime(state.payload.telegram.heartbeat.lastSeenAt) }}</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Linked chats</h3>
                <p>Chats <strong>{{ formatCount(state.payload.telegram.linkedChats) }}</strong></p>
                <p>Wallets <strong>{{ formatCount(state.payload.telegram.linkedWallets) }}</strong></p>
                <p>Alerts on <strong>{{ formatCount(state.payload.telegram.alertsEnabledChats) }}</strong></p>
                <p>Chat on <strong>{{ formatCount(state.payload.telegram.conversationEnabledChats) }}</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Alert queue</h3>
                <p>Pending <strong>{{ formatCount(state.payload.telegram.pendingAlerts) }}</strong></p>
                <p>Delivered <strong>{{ formatCount(state.payload.telegram.deliveredAlerts) }}</strong></p>
                <p>Failed <strong>{{ formatCount(state.payload.telegram.failedAlerts) }}</strong></p>
                <p>Link codes <strong>{{ formatCount(state.payload.telegram.pendingLinkCodes) }}</strong></p>
              </article>
            </section>

            <section class="admin-dashboard__grid">
              <article class="admin-dashboard__card">
                <h3>Top commands</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="entry in normalizeMetrics(state.payload.telegram.topCommands)" :key="entry.key" class="admin-dashboard__metric-row">
                    <span>{{ entry.label }}</span>
                    <strong>{{ formatCount(entry.count) }}</strong>
                  </div>
                </div>
              </article>

              <article class="admin-dashboard__card">
                <h3>Top button actions</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="entry in normalizeMetrics(state.payload.telegram.topActions)" :key="entry.key" class="admin-dashboard__metric-row">
                    <span>{{ entry.label }}</span>
                    <strong>{{ formatCount(entry.count) }}</strong>
                  </div>
                </div>
              </article>
            </section>
          </template>

          <template v-else>
            <section class="admin-dashboard__grid">
              <article class="admin-dashboard__card">
                <h3>Process</h3>
                <p>PID <strong>{{ state.payload.runtime.pid }}</strong></p>
                <p>Port <strong>{{ state.payload.runtime.port }}</strong></p>
                <p>Uptime <strong>{{ formatCount(state.payload.runtime.uptimeSec) }}s</strong></p>
                <p>RSS <strong>{{ formatCount(state.payload.runtime.memory.rssMb) }} MB</strong></p>
                <p>Heap used <strong>{{ formatCount(state.payload.runtime.memory.heapUsedMb) }} MB</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Config</h3>
                <p>Public app <strong>{{ state.payload.runtime.config.publicAppUrl || 'n/a' }}</strong></p>
                <p>Pacifica API <strong>{{ state.payload.runtime.config.pacificaApiBase }}</strong></p>
                <p>Builder code <strong>{{ state.payload.runtime.config.pacificaBuilderCode || 'n/a' }}</strong></p>
                <p>Encryption key <strong>{{ state.payload.runtime.config.encryptionKeyConfigured ? 'set' : 'missing' }}</strong></p>
                <p>Auth secret <strong>{{ state.payload.runtime.config.authSecretConfigured ? 'set' : 'missing' }}</strong></p>
              </article>

              <article class="admin-dashboard__card">
                <h3>Admin allowlist</h3>
                <div class="admin-dashboard__metric-list">
                  <div v-for="walletLabel in state.payload.runtime.config.adminWallets" :key="walletLabel" class="admin-dashboard__metric-row">
                    <span>{{ walletLabel }}</span>
                    <strong>allowed</strong>
                  </div>
                </div>
              </article>
            </section>
          </template>
        </div>
        <div v-else-if="state.loading" class="admin-dashboard__empty">
          Loading admin dashboard…
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-dashboard {
  position: fixed;
  inset: 0;
  z-index: 120;
}

.admin-dashboard__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(2, 8, 14, 0.72);
  backdrop-filter: blur(18px);
}

.admin-dashboard__panel {
  position: absolute;
  inset: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(127, 219, 255, 0.16);
  background:
    linear-gradient(180deg, rgba(5, 22, 34, 0.96), rgba(5, 16, 26, 0.94)),
    radial-gradient(circle at top right, rgba(82, 193, 255, 0.12), transparent 34%);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.48);
  color: #e8f7ff;
}

.admin-dashboard__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.admin-dashboard__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(188, 228, 245, 0.58);
}

.admin-dashboard__header h2 {
  margin: 0;
  font-size: 32px;
  line-height: 1;
}

.admin-dashboard__meta {
  margin: 8px 0 0;
  font-size: 13px;
  color: rgba(215, 236, 245, 0.76);
}

.admin-dashboard__header-actions {
  display: flex;
  gap: 10px;
}

.admin-dashboard__action {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(84, 215, 255, 0.96), rgba(74, 189, 243, 0.94));
  color: #082032;
  font-weight: 700;
}

.admin-dashboard__action--ghost {
  background: rgba(255, 255, 255, 0.07);
  color: #e8f7ff;
}

.admin-dashboard__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-dashboard__tab {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(126, 210, 240, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(231, 247, 255, 0.8);
}

.admin-dashboard__tab--active {
  background: rgba(84, 215, 255, 0.18);
  color: #c8fbff;
  border-color: rgba(103, 232, 249, 0.34);
}

.admin-dashboard__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: auto;
}

.admin-dashboard__stats,
.admin-dashboard__grid {
  display: grid;
  gap: 12px;
}

.admin-dashboard__stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.admin-dashboard__grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.admin-dashboard__stat,
.admin-dashboard__card,
.admin-dashboard__table-card,
.admin-dashboard__empty,
.admin-dashboard__error {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(126, 210, 240, 0.12);
  background: rgba(7, 23, 35, 0.7);
}

.admin-dashboard__stat-label {
  display: block;
  margin-bottom: 10px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(185, 225, 241, 0.56);
}

.admin-dashboard__stat-value {
  font-size: 26px;
  line-height: 1.1;
}

.admin-dashboard__stat-value--positive {
  color: #72f1b8;
}

.admin-dashboard__card h3,
.admin-dashboard__table-card h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.admin-dashboard__card p {
  margin: 0 0 8px;
  color: rgba(226, 242, 248, 0.82);
}

.admin-dashboard__metric-list {
  display: grid;
  gap: 8px;
}

.admin-dashboard__metric-row,
.admin-dashboard__table-row {
  display: grid;
  gap: 8px;
  align-items: center;
}

.admin-dashboard__metric-row {
  grid-template-columns: minmax(0, 1fr) auto;
  font-size: 13px;
}

.admin-dashboard__table {
  display: grid;
  gap: 8px;
}

.admin-dashboard__table-row {
  grid-template-columns: 1.2fr 0.9fr 0.9fr 0.7fr 0.8fr 1fr;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  font-size: 13px;
}

.admin-dashboard__table-row--head {
  background: rgba(103, 232, 249, 0.08);
  color: rgba(190, 231, 246, 0.72);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-dashboard__error {
  color: #ffb8c0;
}

.admin-dashboard__empty {
  color: rgba(228, 242, 248, 0.82);
}

@media (max-width: 1180px) {
  .admin-dashboard__panel {
    inset: 12px;
  }

  .admin-dashboard__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-dashboard__grid {
    grid-template-columns: 1fr;
  }

  .admin-dashboard__table-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
