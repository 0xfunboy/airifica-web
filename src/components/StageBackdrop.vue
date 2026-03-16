<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

import { appConfig } from '@/config/app'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useWalletSession } from '@/modules/wallet/session'

const marketContext = useMarketContext()
const pacifica = usePacificaAccount()
const wallet = useWalletSession()

const market = computed(() => marketContext.market.value)
const pacificaTradeUrl = computed(() => marketContext.pacificaTradeUrl.value)
const pacificaPortfolioUrl = computed(() => marketContext.pacificaPortfolioUrl.value)
const pacificaDepositUrl = computed(() => marketContext.pacificaDepositUrl.value)
const pacificaWithdrawUrl = computed(() => marketContext.pacificaWithdrawUrl.value)

const trendToneClass = computed(() => {
  const changePct = market.value?.changePct || 0
  return changePct >= 0
    ? 'stage-backdrop__tone stage-backdrop__tone--positive'
    : 'stage-backdrop__tone stage-backdrop__tone--negative'
})

const currentPacificaPosition = computed(() =>
  pacifica.getPositionForSymbol(marketContext.currentSymbol.value),
)

const canConnectPacifica = computed(() =>
  Boolean(wallet.isAuthenticated.value && !pacifica.readyToExecute.value),
)

const canCloseCurrentPosition = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && currentPacificaPosition.value),
)

const requiresFunding = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && ((pacifica.account.value?.availableToSpend || 0) <= 0)),
)

const onboardingHint = computed(() => {
  if (!wallet.isConnected.value)
    return 'Connect your Solana wallet first.'
  if (!wallet.isAuthenticated.value)
    return 'Sign the AIR3 session to unlock Pacifica actions.'
  if (!pacifica.readyToExecute.value)
    return 'Approve AIRewardrop as builder and bind the dedicated agent wallet.'
  if (requiresFunding.value)
    return 'Your Pacifica account is connected but not funded yet.'
  return 'Builder onboarding is complete.'
})

const chartPath = computed(() => {
  const candles = market.value?.data || []
  if (candles.length < 2)
    return ''

  const closes = candles.map(candle => candle.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const width = 720
  const height = 220
  const range = max - min || 1

  return closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width
      const y = height - ((close - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const chartAreaPath = computed(() => {
  const path = chartPath.value
  if (!path)
    return ''

  return `${path} L 720 220 L 0 220 Z`
})

function formatPrice(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numeric = Number(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric)
}

function formatChange(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numeric = Number(value)
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`
}

function formatCompact(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

async function refreshPacificaOverview() {
  if (!wallet.token.value)
    return

  try {
    await pacifica.refreshOverview()
  }
  catch {
  }
}

async function handleSetupPacifica() {
  try {
    await pacifica.setupBuilderAccess()
  }
  catch {
  }
}

async function handleConnectWallet() {
  try {
    await wallet.connect()
    await refreshPacificaOverview()
  }
  catch {
  }
}

async function handleCloseCurrentPosition() {
  const position = currentPacificaPosition.value
  if (!position)
    return

  try {
    await pacifica.closeSymbolPosition({
      symbol: position.symbol,
      side: position.side || undefined,
    })
  }
  catch {
  }
}

async function handleCloseListedPosition(symbol: string, side?: 'LONG' | 'SHORT' | null) {
  try {
    await pacifica.closeSymbolPosition({
      symbol,
      side: side || undefined,
    })
  }
  catch {
  }
}

onMounted(() => {
  void marketContext.refreshMarketContext()
  void refreshPacificaOverview()
})

watch(() => wallet.token.value, () => {
  void refreshPacificaOverview()
})
</script>

<template>
  <div class="stage-backdrop" aria-hidden="true">
    <img :src="appConfig.stageBackgroundUrl" alt="" class="stage-backdrop__image" loading="eager" decoding="async">

    <div class="stage-backdrop__wash" />
    <div class="stage-backdrop__grid" />

    <div class="stage-backdrop__symbol-watermark">
      {{ marketContext.currentSymbol.value }}
    </div>

    <section class="stage-backdrop__market-surface" aria-label="AIR3 market surface">
      <div class="stage-backdrop__surface-head">
        <div class="stage-backdrop__surface-copy">
          <span class="stage-backdrop__eyebrow">AIR3 Market Surface</span>
          <span class="stage-backdrop__surface-symbol">{{ marketContext.currentSymbol.value }}</span>
          <span class="stage-backdrop__surface-description">
            Pacifica market context rendered inside AIR3. Trade execution routes through your Pacifica account via the AIRewardrop builder program.
          </span>
        </div>
        <div class="stage-backdrop__surface-status">
          {{ pacifica.readyToExecute.value ? 'Builder ready' : 'Builder setup' }}
        </div>
      </div>

      <div v-if="market" class="stage-backdrop__metrics">
        <div class="stage-backdrop__metric">
          <div class="stage-backdrop__metric-label">
            Price
          </div>
          <div class="stage-backdrop__metric-value">
            {{ formatPrice(market.price) }}
          </div>
        </div>
        <div class="stage-backdrop__metric">
          <div class="stage-backdrop__metric-label">
            Change
          </div>
          <div :class="trendToneClass">
            {{ formatChange(market.changePct) }}
          </div>
        </div>
        <div class="stage-backdrop__metric">
          <div class="stage-backdrop__metric-label">
            Session High
          </div>
          <div class="stage-backdrop__metric-subvalue">
            {{ formatPrice(market.high) }}
          </div>
        </div>
        <div class="stage-backdrop__metric">
          <div class="stage-backdrop__metric-label">
            Session Low
          </div>
          <div class="stage-backdrop__metric-subvalue">
            {{ formatPrice(market.low) }}
          </div>
        </div>
      </div>

      <div v-if="market" class="stage-backdrop__chart-shell">
        <div class="stage-backdrop__chart-meta">
          <div class="stage-backdrop__chart-venue">
            {{ market.venue }} · {{ market.marketSymbol }}
          </div>
          <div>{{ market.tf.toUpperCase() }}</div>
        </div>
        <svg viewBox="0 0 720 220" class="stage-backdrop__chart">
          <defs>
            <linearGradient id="airifica-surface-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="rgba(103,232,249,0.42)" />
              <stop offset="100%" stop-color="rgba(6,182,212,0.02)" />
            </linearGradient>
          </defs>
          <path v-if="chartAreaPath" :d="chartAreaPath" fill="url(#airifica-surface-area)" />
          <path
            v-if="chartPath"
            :d="chartPath"
            fill="none"
            stroke="#67e8f9"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="4"
          />
        </svg>
      </div>

      <div v-if="marketContext.loading.value" class="stage-backdrop__status-line">
        Loading market context...
      </div>

      <div v-else-if="marketContext.error.value" class="stage-backdrop__error">
        {{ marketContext.error.value }}
      </div>

      <div v-if="market" class="stage-backdrop__status-line stage-backdrop__status-line--meta">
        <span>Data provider: {{ market.provider }}</span>
        <span>Range: {{ formatCompact(market.data?.length || 0) }} candles</span>
      </div>

      <div class="stage-backdrop__account-stack">
        <div class="stage-backdrop__account-card">
          <div class="stage-backdrop__metric-label">
            Pacifica account
          </div>
          <div class="stage-backdrop__account-row">
            <div>
              <div class="stage-backdrop__account-title">
                {{ pacifica.readyToExecute.value ? (requiresFunding ? 'Builder ready, funding required' : 'Ready to execute') : wallet.isAuthenticated.value ? 'Wallet connected, builder pending' : 'Connect wallet to trade' }}
              </div>
              <div class="stage-backdrop__account-subtitle">
                Equity {{ formatPrice(pacifica.account.value?.equity) }} · Available {{ formatPrice(pacifica.account.value?.availableToSpend) }} · Withdrawable {{ formatPrice(pacifica.account.value?.availableToWithdraw) }} · Open {{ pacifica.positions.value.length }}
              </div>
              <div class="stage-backdrop__account-hint">
                {{ onboardingHint }}
              </div>
            </div>

            <div class="stage-backdrop__account-actions">
              <button
                v-if="!wallet.isConnected.value || !wallet.isAuthenticated.value"
                :disabled="wallet.connecting.value || wallet.authenticating.value"
                class="stage-backdrop__primary-action"
                type="button"
                @click="handleConnectWallet"
              >
                {{ wallet.connecting.value || wallet.authenticating.value ? 'Connecting…' : 'Connect your Pacifica wallet' }}
              </button>

              <button
                v-if="canConnectPacifica"
                :disabled="pacifica.setupLoading.value"
                class="stage-backdrop__primary-action"
                type="button"
                @click="handleSetupPacifica"
              >
                {{ pacifica.setupLoading.value ? 'Connecting…' : 'Complete Pacifica onboarding' }}
              </button>

              <a
                v-if="wallet.isAuthenticated.value"
                :href="requiresFunding ? pacificaDepositUrl : pacificaPortfolioUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="stage-backdrop__secondary-action"
              >
                {{ requiresFunding ? 'Deposit on Pacifica' : 'Open portfolio' }}
              </a>

              <button
                v-if="canCloseCurrentPosition"
                :disabled="pacifica.closingSymbol.value === marketContext.currentSymbol.value"
                class="stage-backdrop__danger-action"
                type="button"
                @click="handleCloseCurrentPosition"
              >
                {{ pacifica.closingSymbol.value === marketContext.currentSymbol.value ? 'Closing…' : `Close ${marketContext.currentSymbol.value}` }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="currentPacificaPosition" class="stage-backdrop__detail-card">
          <div class="stage-backdrop__metric-label">
            Current market position
          </div>
          <div class="stage-backdrop__position-row">
            <div class="stage-backdrop__position-main">
              <strong>{{ currentPacificaPosition.side }}</strong>
              {{ formatCompact(currentPacificaPosition.amount) }} {{ currentPacificaPosition.symbol }}
            </div>
            <div class="stage-backdrop__account-subtitle">
              Entry {{ formatPrice(currentPacificaPosition.entryPrice) }} · Mark {{ formatPrice(currentPacificaPosition.markPrice) }}
            </div>
          </div>
        </div>

        <details v-if="pacifica.positions.value.length" class="stage-backdrop__detail-card">
          <summary>Open builder positions · {{ pacifica.positions.value.length }}</summary>
          <div class="stage-backdrop__positions-list">
            <div
              v-for="position in pacifica.positions.value"
              :key="`${position.symbol}:${position.side || 'NA'}`"
              class="stage-backdrop__position-card"
            >
              <div>
                <div class="stage-backdrop__position-title">
                  {{ position.side || 'OPEN' }} {{ position.symbol }}
                </div>
                <div class="stage-backdrop__account-subtitle">
                  Size {{ formatCompact(position.amount) }} · Entry {{ formatPrice(position.entryPrice) }} · Mark {{ formatPrice(position.markPrice) }}
                </div>
              </div>
              <button
                class="stage-backdrop__danger-action"
                :disabled="pacifica.closingSymbol.value === position.symbol"
                type="button"
                @click="handleCloseListedPosition(position.symbol, position.side)"
              >
                {{ pacifica.closingSymbol.value === position.symbol ? 'Closing…' : 'Close' }}
              </button>
            </div>
          </div>
        </details>

        <div v-if="pacifica.error.value" class="stage-backdrop__error">
          {{ pacifica.error.value }}
        </div>

        <details v-if="!pacifica.readyToExecute.value || requiresFunding" class="stage-backdrop__detail-card">
          <summary>Onboarding guide</summary>
          <ol class="stage-backdrop__guide">
            <li>Connect your Solana wallet and sign the AIR3 session.</li>
            <li>Click <strong>Complete Pacifica onboarding</strong>. AIR3 prepares two Pacifica payloads for your account.</li>
            <li>Approve AIRewardrop as builder, then bind the dedicated agent wallet to your Pacifica account.</li>
            <li>Fund the Pacifica account before executing the first trade.</li>
            <li>Once funded, chart proposals can open and close positions directly from AIR3.</li>
          </ol>
          <div class="stage-backdrop__guide-actions">
            <a :href="pacificaTradeUrl" target="_blank" rel="noopener noreferrer" class="stage-backdrop__secondary-action">
              Open {{ marketContext.currentSymbol.value }} on Pacifica
            </a>
            <a :href="pacificaDepositUrl" target="_blank" rel="noopener noreferrer" class="stage-backdrop__secondary-action">
              Deposit
            </a>
            <a :href="pacificaWithdrawUrl" target="_blank" rel="noopener noreferrer" class="stage-backdrop__secondary-action">
              Withdraw
            </a>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stage-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.stage-backdrop__image,
.stage-backdrop__wash,
.stage-backdrop__grid,
.stage-backdrop__symbol-watermark {
  position: absolute;
  inset: 0;
}

.stage-backdrop__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.stage-backdrop__wash {
  z-index: 0;
  background:
    radial-gradient(circle at top right, rgba(30, 199, 255, 0.18), transparent 24%),
    radial-gradient(circle at 18% 24%, rgba(30, 199, 255, 0.1), transparent 22%),
    linear-gradient(180deg, rgba(1, 9, 20, 0.18), rgba(1, 9, 20, 0.7) 52%, rgba(1, 9, 20, 0.96));
}

.stage-backdrop__grid {
  z-index: 0;
  opacity: 0.34;
  background-image:
    linear-gradient(rgba(0, 175, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 175, 255, 0.08) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.14));
}

.stage-backdrop__symbol-watermark {
  z-index: 0;
  inset: auto -16px auto auto;
  top: 32px;
  display: flex;
  justify-content: flex-end;
  color: rgba(165, 243, 252, 0.06);
  font-size: clamp(120px, 22vw, 360px);
  font-weight: 900;
  line-height: 0.9;
  letter-spacing: -0.08em;
  user-select: none;
}

.stage-backdrop__market-surface {
  position: absolute;
  top: 72px;
  left: 12px;
  z-index: 1;
  display: none;
  width: min(384px, calc(100vw - 24px));
  max-height: calc(100dvh - 132px);
  overflow: auto;
  gap: 12px;
  flex-direction: column;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(103, 232, 249, 0.16);
  background: rgba(6, 25, 39, 0.76);
  color: rgba(240, 249, 255, 0.96);
  box-shadow: 0 24px 72px rgba(5, 23, 36, 0.36);
  backdrop-filter: blur(20px);
  pointer-events: auto;
}

.stage-backdrop__surface-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-backdrop__surface-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stage-backdrop__eyebrow,
.stage-backdrop__metric-label {
  color: rgba(186, 230, 253, 0.52);
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.stage-backdrop__surface-symbol {
  font-size: 1.28rem;
  font-weight: 600;
}

.stage-backdrop__surface-description,
.stage-backdrop__status-line,
.stage-backdrop__account-subtitle,
.stage-backdrop__account-hint,
.stage-backdrop__guide {
  color: rgba(224, 242, 254, 0.62);
  font-size: 0.75rem;
  line-height: 1.55;
}

.stage-backdrop__surface-status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(103, 232, 249, 0.2);
  background: rgba(103, 232, 249, 0.08);
  color: rgba(224, 247, 255, 0.92);
  font-size: 0.76rem;
  font-weight: 600;
}

.stage-backdrop__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.stage-backdrop__metric,
.stage-backdrop__account-card,
.stage-backdrop__detail-card,
.stage-backdrop__position-card {
  border-radius: 18px;
  border: 1px solid rgba(103, 232, 249, 0.1);
  background: rgba(8, 28, 42, 0.36);
}

.stage-backdrop__metric {
  padding: 12px;
}

.stage-backdrop__metric-value {
  margin-top: 4px;
  font-size: 1.04rem;
  font-weight: 600;
}

.stage-backdrop__metric-subvalue {
  margin-top: 4px;
  font-size: 0.92rem;
  font-weight: 500;
}

.stage-backdrop__tone {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  margin-top: 4px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 0.82rem;
  font-weight: 600;
}

.stage-backdrop__tone--positive {
  border-color: rgba(110, 231, 183, 0.2);
  background: rgba(110, 231, 183, 0.1);
  color: #bbf7d0;
}

.stage-backdrop__tone--negative {
  border-color: rgba(251, 113, 133, 0.2);
  background: rgba(251, 113, 133, 0.1);
  color: #fecdd3;
}

.stage-backdrop__chart-shell {
  padding: 14px;
  border-radius: 28px;
  border: 1px solid rgba(103, 232, 249, 0.12);
  background: rgba(4, 18, 29, 0.86);
}

.stage-backdrop__chart-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: rgba(224, 242, 254, 0.62);
  font-size: 0.74rem;
}

.stage-backdrop__chart-venue {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-backdrop__chart {
  width: 100%;
  height: 152px;
}

.stage-backdrop__status-line--meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stage-backdrop__account-stack {
  display: grid;
  gap: 8px;
}

.stage-backdrop__account-card,
.stage-backdrop__detail-card {
  padding: 12px 14px;
}

.stage-backdrop__account-row,
.stage-backdrop__position-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.stage-backdrop__account-title,
.stage-backdrop__position-title,
.stage-backdrop__position-main {
  color: rgba(248, 250, 252, 0.96);
  font-size: 0.84rem;
  font-weight: 600;
}

.stage-backdrop__account-hint {
  margin-top: 8px;
  color: rgba(165, 243, 252, 0.7);
}

.stage-backdrop__account-actions,
.stage-backdrop__guide-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.stage-backdrop__primary-action,
.stage-backdrop__secondary-action,
.stage-backdrop__danger-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 0.74rem;
  font-weight: 600;
  text-decoration: none;
}

.stage-backdrop__primary-action {
  border: 0;
  background: #67e8f9;
  color: #0f172a;
}

.stage-backdrop__secondary-action {
  border: 1px solid rgba(103, 232, 249, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(240, 249, 255, 0.92);
}

.stage-backdrop__danger-action {
  border: 1px solid rgba(251, 113, 133, 0.24);
  background: rgba(251, 113, 133, 0.12);
  color: #fecdd3;
}

.stage-backdrop__positions-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.stage-backdrop__position-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
}

.stage-backdrop__guide {
  margin: 10px 0 0;
  padding-left: 18px;
}

.stage-backdrop__error {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(251, 113, 133, 0.22);
  background: rgba(127, 29, 29, 0.2);
  color: #fecdd3;
  font-size: 0.76rem;
}

.stage-backdrop__detail-card summary {
  cursor: pointer;
  list-style: none;
  color: rgba(186, 230, 253, 0.52);
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

@media (min-width: 768px) {
  .stage-backdrop__market-surface {
    display: flex;
  }
}

@media (max-width: 1180px) {
  .stage-backdrop__market-surface {
    width: min(352px, calc(100vw - 24px));
  }
}

@media (max-width: 980px) {
  .stage-backdrop__market-surface {
    display: none;
  }
}
</style>
