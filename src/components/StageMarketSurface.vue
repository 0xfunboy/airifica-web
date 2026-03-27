<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import type { Air3PacificaPosition } from '@/lib/air3-client'

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
const marketUniverse = computed(() => marketContext.universe.value)
const marketMenuOpen = ref(false)
const marketMenuRef = ref<HTMLElement | null>(null)

const selectedMarketRow = computed(() =>
  marketUniverse.value.find(row => row.symbol === marketContext.currentSymbol.value) || null,
)

const trendToneClass = computed(() => {
  const changePct = market.value?.changePct || 0
  return changePct >= 0
    ? 'stage-backdrop__tone stage-backdrop__tone--positive'
    : 'stage-backdrop__tone stage-backdrop__tone--negative'
})

const currentPacificaPosition = computed(() =>
  pacifica.getPositionForSymbol(marketContext.currentSymbol.value),
)
const otherPacificaPositions = computed(() =>
  pacifica.positions.value.filter(position =>
    !currentPacificaPosition.value || getPositionKey(position) !== getPositionKey(currentPacificaPosition.value),
  ),
)

const requiresSessionSignature = computed(() =>
  Boolean(wallet.isConnected.value && !wallet.isAuthenticated.value),
)

const canConnectPacifica = computed(() =>
  Boolean(wallet.isAuthenticated.value && !pacifica.readyToExecute.value),
)

const requiresPacificaActivation = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && pacifica.accountMissing.value),
)

const canCloseCurrentPosition = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && currentPacificaPosition.value),
)

const requiresFunding = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && !pacifica.accountMissing.value && ((pacifica.account.value?.availableToSpend || 0) <= 0)),
)
const requiresBetaAccess = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.betaAccessRequired.value),
)

const accountMetrics = computed(() => {
  if (!pacifica.account.value)
    return []

  return [
    { label: 'Account Equity', value: formatPrice(pacifica.account.value.equity) },
    { label: 'Available', value: formatPrice(pacifica.account.value.availableToSpend) },
    { label: 'Withdrawable', value: formatPrice(pacifica.account.value.availableToWithdraw) },
    { label: 'Open Positions', value: String(pacifica.positions.value.length) },
  ]
})

const expandedPositionKeys = reactive(new Set<string>())

const executionStateTitle = computed(() => {
  if (!wallet.isConnected.value)
    return 'Connect wallet'
  if (!wallet.isAuthenticated.value)
    return 'Sign session'
  if (!pacifica.readyToExecute.value)
    return 'Complete onboarding'
  if (requiresBetaAccess.value)
    return 'Redeem beta code'
  if (requiresPacificaActivation.value)
    return 'Activate Pacifica'
  if (requiresFunding.value)
    return 'Add collateral'
  return 'Ready to trade'
})

const surfaceStatusLabel = computed(() => {
  if (!wallet.isConnected.value)
    return 'Wallet offline'
  if (!wallet.isAuthenticated.value)
    return 'Session unsigned'
  if (!pacifica.readyToExecute.value)
    return 'Builder setup'
  if (requiresBetaAccess.value)
    return 'Beta required'
  if (requiresPacificaActivation.value)
    return 'Activation needed'
  if (requiresFunding.value)
    return 'No collateral'
  return 'Ready'
})

const onboardingHint = computed(() => {
  if (!wallet.isConnected.value)
    return 'Use your Solana wallet to enable Pacifica actions.'
  if (!wallet.isAuthenticated.value)
    return 'Sign once to sync your Pacifica state.'
  if (!pacifica.readyToExecute.value)
    return 'Approve AIRewardrop and bind AIR3.'
  if (requiresBetaAccess.value)
    return pacifica.betaAccessHint.value || 'Redeem a valid Pacifica beta code before executing trades.'
  if (requiresPacificaActivation.value)
    return pacifica.onboardingHint.value || `Open Pacifica once and deposit at least ${formatPrice(pacifica.minimumDepositUsd.value)}.`
  if (requiresFunding.value)
    return 'Add collateral to execute trades.'
  return 'Portfolio and execution are live.'
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

function getPositionKey(position: Pick<Air3PacificaPosition, 'symbol' | 'side'>) {
  return `${position.symbol}:${position.side || 'OPEN'}`
}

function togglePositionDetails(position: Pick<Air3PacificaPosition, 'symbol' | 'side'>) {
  const key = getPositionKey(position)
  if (expandedPositionKeys.has(key))
    expandedPositionKeys.delete(key)
  else
    expandedPositionKeys.add(key)
}

function isPositionExpanded(position: Pick<Air3PacificaPosition, 'symbol' | 'side'>) {
  return expandedPositionKeys.has(getPositionKey(position))
}

function buildPositionDetailFields(position: Air3PacificaPosition) {
  const makerFee = pacifica.account.value?.makerFee
  const takerFee = pacifica.account.value?.takerFee
  const feeParts = [
    Number.isFinite(makerFee) ? `M ${formatRatePercent(makerFee)}` : null,
    Number.isFinite(takerFee) ? `T ${formatRatePercent(takerFee)}` : null,
    Number.isFinite(position.funding) ? `F ${formatSignedRatePercent(position.funding)}` : null,
  ].filter(Boolean)

  return [
    { label: 'Price', value: formatPrice(position.markPrice) },
    { label: 'Entry', value: formatPrice(position.entryPrice) },
    { label: 'TP', value: position.takeProfitPrice > 0 ? formatPrice(position.takeProfitPrice) : '--' },
    { label: 'SL', value: position.stopLossPrice > 0 ? formatPrice(position.stopLossPrice) : '--' },
    { label: 'Fees', value: feeParts.length ? feeParts.join(' · ') : '--' },
    { label: 'Liq', value: position.liquidationPrice > 0 ? formatPrice(position.liquidationPrice) : '--' },
  ]
}

function positionSideClass(side: 'LONG' | 'SHORT' | null | undefined) {
  return side === 'LONG'
    ? 'stage-backdrop__position-side stage-backdrop__position-side--long'
    : 'stage-backdrop__position-side stage-backdrop__position-side--short'
}

function positionPnlClass(position: Air3PacificaPosition) {
  return position.unrealizedPnlUsd >= 0
    ? 'stage-backdrop__pnl stage-backdrop__pnl--positive'
    : 'stage-backdrop__pnl stage-backdrop__pnl--negative'
}

function positionPnlHeadClass(position: Air3PacificaPosition) {
  return position.unrealizedPnlUsd >= 0
    ? 'stage-backdrop__pnl-head stage-backdrop__pnl-head--positive'
    : 'stage-backdrop__pnl-head stage-backdrop__pnl-head--negative'
}

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

function formatCompactUsd(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(value))
}

function formatSignedUsd(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numeric = Number(value)
  return `${numeric >= 0 ? '+' : ''}${formatPrice(numeric)}`
}

function formatSignedPercent(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numeric = Number(value)
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`
}

function formatRatePercent(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return `${(Number(value) * 100).toFixed(4)}%`
}

function formatSignedRatePercent(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  const numeric = Number(value) * 100
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(4)}%`
}

function marketRowChangeClass(changePct: number | null | undefined) {
  return Number(changePct || 0) >= 0
    ? 'stage-backdrop__market-row-change stage-backdrop__market-row-change--positive'
    : 'stage-backdrop__market-row-change stage-backdrop__market-row-change--negative'
}

function toggleMarketMenu() {
  marketMenuOpen.value = !marketMenuOpen.value
  if (marketMenuOpen.value)
    void marketContext.refreshMarketUniverse().catch(() => {})
}

function handleSelectMarketSymbol(symbol: string) {
  marketContext.setSymbol(symbol)
  marketMenuOpen.value = false
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!marketMenuOpen.value || !target)
    return

  if (marketMenuRef.value?.contains(target))
    return

  marketMenuOpen.value = false
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

async function handleAuthenticateWallet() {
  try {
    await wallet.authenticate()
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
  void marketContext.refreshMarketUniverse().catch(() => {})
  void refreshPacificaOverview()
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

watch(() => wallet.token.value, () => {
  void refreshPacificaOverview()
})
</script>

<template>
  <section class="market-surface-panel" aria-label="AIR3 market surface">
    <div class="stage-backdrop__surface-head">
      <div class="stage-backdrop__surface-copy">
        <span class="stage-backdrop__eyebrow">AIR3 Market Surface</span>
        <div ref="marketMenuRef" class="stage-backdrop__surface-symbol-shell">
          <button
            class="stage-backdrop__surface-symbol-button"
            type="button"
            @click="toggleMarketMenu"
          >
            <span class="stage-backdrop__surface-symbol">{{ selectedMarketRow?.symbol || marketContext.currentSymbol.value }}</span>
            <span :class="['stage-backdrop__surface-symbol-icon', { 'stage-backdrop__surface-symbol-icon--open': marketMenuOpen }]">▾</span>
          </button>

          <div v-if="marketMenuOpen" class="stage-backdrop__market-dropdown">
            <div class="stage-backdrop__market-dropdown-head">
              <span>Ticker</span>
              <span>Price</span>
              <span>Change</span>
              <span>Volume</span>
            </div>
            <button
              v-for="row in marketUniverse"
              :key="row.symbol"
              type="button"
              class="stage-backdrop__market-row"
              @click="handleSelectMarketSymbol(row.symbol)"
            >
              <strong>{{ row.symbol }}</strong>
              <span>{{ formatPrice(row.price) }}</span>
              <span :class="marketRowChangeClass(row.changePct)">{{ formatChange(row.changePct) }}</span>
              <span>{{ formatCompact(row.volume24h) }}</span>
            </button>
          </div>
        </div>
        <span class="stage-backdrop__surface-description">
          Live market context and account state.
        </span>
        <div class="stage-backdrop__surface-meta">
          <span class="stage-backdrop__surface-status-label">Status</span>
          <span class="stage-backdrop__surface-status">{{ surfaceStatusLabel }}</span>
        </div>
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
              {{ executionStateTitle }}
            </div>
            <div class="stage-backdrop__account-hint">
              {{ onboardingHint }}
            </div>
          </div>

          <div class="stage-backdrop__account-actions">
            <button
              v-if="!wallet.isConnected.value"
              :disabled="wallet.connecting.value || wallet.authenticating.value"
              class="stage-backdrop__primary-action"
              type="button"
              @click="handleConnectWallet"
            >
              {{ wallet.connecting.value || wallet.authenticating.value ? 'Connecting…' : 'Connect your Pacifica wallet' }}
            </button>

            <button
              v-else-if="requiresSessionSignature"
              :disabled="wallet.authenticating.value"
              class="stage-backdrop__primary-action"
              type="button"
              @click="handleAuthenticateWallet"
            >
              {{ wallet.authenticating.value ? 'Signing…' : 'Sign Pacifica session' }}
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
              v-else-if="requiresBetaAccess"
              :href="pacificaPortfolioUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="stage-backdrop__primary-action"
            >
              Redeem beta code
            </a>

            <a
              v-else-if="requiresPacificaActivation || requiresFunding"
              :href="requiresPacificaActivation ? pacificaTradeUrl : pacificaDepositUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="stage-backdrop__primary-action"
            >
              Deposit
            </a>

            <a
              v-if="wallet.isAuthenticated.value"
              :href="requiresPacificaActivation ? pacificaDepositUrl : pacificaPortfolioUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="stage-backdrop__secondary-action"
            >
              {{ requiresPacificaActivation ? 'Deposit on Pacifica' : 'Portfolio' }}
            </a>
          </div>
        </div>
      </div>

      <div v-if="accountMetrics.length" class="stage-backdrop__account-metrics">
        <article v-for="metric in accountMetrics" :key="metric.label" class="stage-backdrop__account-metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </div>

      <a
        v-if="wallet.isAuthenticated.value && !requiresPacificaActivation"
        :href="pacificaPortfolioUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="stage-backdrop__portfolio-link"
      >
        Open portfolio
      </a>

      <div v-if="currentPacificaPosition" class="stage-backdrop__detail-card">
        <div class="stage-backdrop__position-header">
          <div class="stage-backdrop__metric-label">
            Current market position
          </div>
        </div>
        <div class="stage-backdrop__position-summary-top">
          <div class="stage-backdrop__position-main">
            <span :class="positionSideClass(currentPacificaPosition.side)">
              {{ currentPacificaPosition.side }}
            </span>
          </div>
          <button
            v-if="canCloseCurrentPosition"
            :disabled="pacifica.closingSymbol.value === marketContext.currentSymbol.value"
            class="stage-backdrop__danger-action"
            type="button"
            @click="handleCloseCurrentPosition"
          >
            {{ pacifica.closingSymbol.value === marketContext.currentSymbol.value ? 'Closing…' : 'Market close' }}
          </button>
        </div>
        <div class="stage-backdrop__position-table">
          <div class="stage-backdrop__position-table-head">
            <span>Ticker</span>
            <span>Value $</span>
            <span :class="positionPnlHeadClass(currentPacificaPosition)">PnL %</span>
            <span :class="positionPnlHeadClass(currentPacificaPosition)">PnL $</span>
          </div>
          <div class="stage-backdrop__position-table-row">
            <strong>{{ currentPacificaPosition.symbol }}</strong>
            <strong>{{ formatCompactUsd(currentPacificaPosition.notionalUsd) }}</strong>
            <strong :class="positionPnlClass(currentPacificaPosition)">{{ formatSignedPercent(currentPacificaPosition.unrealizedPnlPct) }}</strong>
            <strong :class="positionPnlClass(currentPacificaPosition)">{{ formatSignedUsd(currentPacificaPosition.unrealizedPnlUsd) }}</strong>
          </div>
        </div>
        <button
          class="stage-backdrop__toggle-details"
          type="button"
          @click="togglePositionDetails(currentPacificaPosition)"
        >
          <span>{{ isPositionExpanded(currentPacificaPosition) ? 'Hide details' : 'Show details' }}</span>
          <span :class="['stage-backdrop__toggle-icon', { 'stage-backdrop__toggle-icon--open': isPositionExpanded(currentPacificaPosition) }]">⌄</span>
        </button>
        <div v-if="isPositionExpanded(currentPacificaPosition)" class="stage-backdrop__position-detail-grid">
          <article
            v-for="field in buildPositionDetailFields(currentPacificaPosition)"
            :key="`${currentPacificaPosition.symbol}:${field.label}`"
            class="stage-backdrop__position-detail"
          >
            <span>{{ field.label }}</span>
            <strong>{{ field.value }}</strong>
          </article>
        </div>
      </div>

      <details v-if="otherPacificaPositions.length" class="stage-backdrop__detail-card">
        <summary>Open builder positions · {{ otherPacificaPositions.length }}</summary>
        <div class="stage-backdrop__positions-list">
          <div
            v-for="position in otherPacificaPositions"
            :key="`${position.symbol}:${position.side || 'NA'}`"
            class="stage-backdrop__position-card"
          >
            <div class="stage-backdrop__position-card-main">
              <div class="stage-backdrop__position-summary-top">
                <div class="stage-backdrop__position-title">
                  <span :class="positionSideClass(position.side)">{{ position.side || 'OPEN' }}</span>
                </div>
                <button
                  class="stage-backdrop__danger-action"
                  :disabled="pacifica.closingSymbol.value === position.symbol"
                  type="button"
                  @click="handleCloseListedPosition(position.symbol, position.side)"
                >
                  {{ pacifica.closingSymbol.value === position.symbol ? 'Closing…' : 'Market close' }}
                </button>
              </div>
              <div class="stage-backdrop__position-table">
                <div class="stage-backdrop__position-table-head">
                  <span>Ticker</span>
                  <span>Value $</span>
                  <span :class="positionPnlHeadClass(position)">PnL %</span>
                  <span :class="positionPnlHeadClass(position)">PnL $</span>
                </div>
                <div class="stage-backdrop__position-table-row">
                  <strong>{{ position.symbol }}</strong>
                  <strong>{{ formatCompactUsd(position.notionalUsd) }}</strong>
                  <strong :class="positionPnlClass(position)">{{ formatSignedPercent(position.unrealizedPnlPct) }}</strong>
                  <strong :class="positionPnlClass(position)">{{ formatSignedUsd(position.unrealizedPnlUsd) }}</strong>
                </div>
              </div>
              <button
                class="stage-backdrop__toggle-details"
                type="button"
                @click="togglePositionDetails(position)"
              >
                <span>{{ isPositionExpanded(position) ? 'Hide details' : 'Show details' }}</span>
                <span :class="['stage-backdrop__toggle-icon', { 'stage-backdrop__toggle-icon--open': isPositionExpanded(position) }]">⌄</span>
              </button>
              <div v-if="isPositionExpanded(position)" class="stage-backdrop__position-detail-grid">
                <article
                  v-for="field in buildPositionDetailFields(position)"
                  :key="`${position.symbol}:${position.side || 'OPEN'}:${field.label}`"
                  class="stage-backdrop__position-detail"
                >
                  <span>{{ field.label }}</span>
                  <strong>{{ field.value }}</strong>
                </article>
              </div>
            </div>
          </div>
        </div>
      </details>

      <div v-if="pacifica.error.value" class="stage-backdrop__error">
        {{ pacifica.error.value }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.market-surface-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

.stage-backdrop__surface-symbol-shell {
  position: relative;
}

.stage-backdrop__surface-symbol-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(240, 249, 255, 0.96);
  cursor: pointer;
}

.stage-backdrop__surface-symbol-icon {
  color: rgba(186, 230, 253, 0.68);
  font-size: 1.08rem;
  line-height: 1;
  transition: transform 180ms ease, color 180ms ease;
}

.stage-backdrop__surface-symbol-icon--open {
  transform: rotate(180deg);
}

.stage-backdrop__surface-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.stage-backdrop__surface-status-label {
  color: rgba(186, 230, 253, 0.42);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.stage-backdrop__market-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 8;
  display: grid;
  width: min(356px, calc(100vw - 56px));
  max-height: 360px;
  overflow: auto;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid rgba(103, 232, 249, 0.18);
  background: rgba(5, 22, 34, 0.96);
  box-shadow: 0 22px 54px rgba(2, 10, 18, 0.42);
  backdrop-filter: blur(20px);
}

.stage-backdrop__market-dropdown-head,
.stage-backdrop__market-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.9fr);
  gap: 10px;
  align-items: center;
}

.stage-backdrop__market-dropdown-head {
  padding: 0 6px 8px;
  color: rgba(186, 230, 253, 0.46);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.stage-backdrop__market-row {
  padding: 9px 6px;
  border: 0;
  border-top: 1px solid rgba(103, 232, 249, 0.08);
  background: transparent;
  color: rgba(224, 242, 254, 0.88);
  text-align: left;
  cursor: pointer;
}

.stage-backdrop__market-row strong {
  color: rgba(248, 250, 252, 0.98);
  font-size: 0.82rem;
  font-weight: 700;
}

.stage-backdrop__market-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
}

.stage-backdrop__market-row-change {
  font-weight: 700;
}

.stage-backdrop__market-row-change--positive {
  color: #86efac;
}

.stage-backdrop__market-row-change--negative {
  color: #fda4af;
}

.stage-backdrop__surface-description,
.stage-backdrop__status-line,
.stage-backdrop__account-hint {
  color: rgba(224, 242, 254, 0.62);
  font-size: 0.75rem;
  line-height: 1.55;
}

.stage-backdrop__surface-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(103, 232, 249, 0.2);
  background: rgba(103, 232, 249, 0.08);
  color: rgba(224, 247, 255, 0.92);
  font-size: 0.68rem;
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

.stage-backdrop__account-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.stage-backdrop__account-metric {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(103, 232, 249, 0.1);
  background: rgba(8, 28, 42, 0.28);
}

.stage-backdrop__account-metric span {
  color: rgba(186, 230, 253, 0.52);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.stage-backdrop__account-metric strong {
  color: rgba(240, 249, 255, 0.96);
  font-size: 0.94rem;
  font-weight: 600;
}

.stage-backdrop__account-card,
.stage-backdrop__detail-card {
  padding: 12px 14px;
}

.stage-backdrop__position-header,
.stage-backdrop__account-row,
.stage-backdrop__position-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-backdrop__account-row,
.stage-backdrop__position-row {
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

.stage-backdrop__account-actions {
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

.stage-backdrop__portfolio-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(103, 232, 249, 0.18);
  background: rgba(8, 28, 42, 0.24);
  color: rgba(240, 249, 255, 0.92);
  font-size: 0.74rem;
  font-weight: 600;
  text-decoration: none;
}

.stage-backdrop__position-side {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.stage-backdrop__position-side--long {
  border-color: rgba(52, 211, 153, 0.24);
  background: rgba(34, 197, 94, 0.18);
  color: #dcfce7;
}

.stage-backdrop__position-side--short {
  border-color: rgba(251, 113, 133, 0.24);
  background: rgba(251, 113, 133, 0.18);
  color: #ffe4e6;
}

.stage-backdrop__pnl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
}

.stage-backdrop__pnl--positive {
  color: #86efac;
}

.stage-backdrop__pnl--negative {
  color: #fda4af;
}

.stage-backdrop__position-summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.stage-backdrop__position-table {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.stage-backdrop__position-table-head,
.stage-backdrop__position-table-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.stage-backdrop__position-table-head span {
  color: rgba(186, 230, 253, 0.52);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.stage-backdrop__pnl-head--positive {
  color: rgba(134, 239, 172, 0.82);
}

.stage-backdrop__pnl-head--negative {
  color: rgba(253, 164, 175, 0.82);
}

.stage-backdrop__position-table-row strong {
  color: rgba(240, 249, 255, 0.96);
  font-size: 0.84rem;
  font-weight: 600;
}

.stage-backdrop__position-table-row strong.stage-backdrop__pnl--positive {
  color: #86efac;
}

.stage-backdrop__position-table-row strong.stage-backdrop__pnl--negative {
  color: #fda4af;
}

.stage-backdrop__toggle-details {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(186, 230, 253, 0.78);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.stage-backdrop__toggle-icon {
  display: inline-flex;
  transition: transform 180ms ease;
}

.stage-backdrop__toggle-icon--open {
  transform: rotate(180deg);
}

.stage-backdrop__position-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.stage-backdrop__position-detail {
  display: grid;
  gap: 4px;
  padding: 0 0 8px;
  border-bottom: 1px solid rgba(103, 232, 249, 0.12);
}

.stage-backdrop__position-detail span {
  color: rgba(186, 230, 253, 0.52);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.stage-backdrop__position-detail strong {
  color: rgba(240, 249, 255, 0.96);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.stage-backdrop__positions-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.stage-backdrop__position-card {
  padding: 12px;
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

@media (max-width: 640px) {
  .market-surface-panel {
    gap: 10px;
    padding: 12px;
    border-radius: 22px;
    background: rgba(6, 25, 39, 0.28);
    box-shadow: 0 22px 56px rgba(5, 23, 36, 0.22);
    backdrop-filter: blur(12px);
  }

  .stage-backdrop__surface-head,
  .stage-backdrop__account-row,
  .stage-backdrop__position-summary-top {
    flex-direction: column;
    align-items: stretch;
  }

  .stage-backdrop__account-actions {
    justify-content: flex-start;
  }

  .stage-backdrop__chart {
    height: 118px;
  }

  .stage-backdrop__status-line--meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .stage-backdrop__position-detail-grid {
    grid-template-columns: 1fr;
  }

  .stage-backdrop__surface-description,
  .stage-backdrop__status-line,
  .stage-backdrop__account-hint {
    font-size: 0.66rem;
  }

  .stage-backdrop__metric {
    padding: 10px;
  }

  .stage-backdrop__metric-value {
    font-size: 0.88rem;
  }

  .stage-backdrop__metric-subvalue,
  .stage-backdrop__account-metric strong,
  .stage-backdrop__position-table-row strong,
  .stage-backdrop__position-detail strong {
    font-size: 0.72rem;
  }
}
</style>
