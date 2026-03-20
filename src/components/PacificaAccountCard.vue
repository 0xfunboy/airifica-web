<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

import { truncateMiddle } from '@/lib/format'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useWalletSession } from '@/modules/wallet/session'

const pacifica = usePacificaAccount()
const wallet = useWalletSession()
const marketContext = useMarketContext()

const statusItems = computed(() => [
  {
    label: 'Binding',
    value: pacifica.status.value.hasBinding ? 'active' : 'missing',
  },
  {
    label: 'Builder',
    value: pacifica.status.value.builderApproved ? 'approved' : 'pending',
  },
  {
    label: 'Agent',
    value: pacifica.status.value.agentBound ? 'bound' : 'pending',
  },
  {
    label: 'Execution',
    value: pacifica.readyToExecute.value ? 'ready' : 'blocked',
  },
])

const accountMetrics = computed(() => {
  const account = pacifica.account.value
  if (!account)
    return []

  return [
    { label: 'Balance', value: formatUsd(account.balance) },
    { label: 'Equity', value: formatUsd(account.equity) },
    { label: 'Spendable', value: formatUsd(account.availableToSpend) },
    { label: 'Withdrawable', value: formatUsd(account.availableToWithdraw) },
  ]
})

const readinessLabel = computed(() => {
  if (requiresPacificaActivation.value)
    return 'activate account'
  if (pacifica.readyToExecute.value)
    return 'ready'
  if (wallet.isAuthenticated.value)
    return 'onboarding'
  return 'wallet required'
})

const requiresPacificaActivation = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && pacifica.accountMissing.value),
)

const onboardingHint = computed(() => {
  if (!wallet.isConnected.value)
    return 'Connect your Solana wallet first.'
  if (!wallet.isAuthenticated.value)
    return 'Sign the AIR3 session before querying Pacifica.'
  if (!pacifica.status.value.hasBinding)
    return 'Builder onboarding has not started yet.'
  if (!pacifica.readyToExecute.value)
    return 'Builder approval or agent binding is still pending.'
  if (requiresPacificaActivation.value)
    return pacifica.onboardingHint.value || `Open Pacifica with AIRewardrop, then deposit at least ${formatUsd(pacifica.minimumDepositUsd.value)} to initialize this account.`
  if ((pacifica.account.value?.availableToSpend || 0) <= 0)
    return 'No funds on Pacifica yet. Deposit before execution.'
  return 'Pacifica account is ready for execution.'
})

const requiresFunding = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && !pacifica.accountMissing.value && ((pacifica.account.value?.availableToSpend || 0) <= 0)),
)

async function refreshOverview() {
  try {
    await pacifica.refreshOverview()
  }
  catch {
  }
}

async function handleConnectWallet() {
  try {
    await wallet.connect()
    await pacifica.refreshOverview()
  }
  catch {
  }
}

async function handleSignSession() {
  try {
    await wallet.authenticate()
    await pacifica.refreshOverview()
  }
  catch {
  }
}

async function handleCompleteOnboarding() {
  try {
    await pacifica.setupBuilderAccess()
  }
  catch {
  }
}

async function handleClosePosition(symbol: string, side?: 'LONG' | 'SHORT' | null) {
  try {
    await pacifica.closeSymbolPosition({
      symbol,
      side: side || undefined,
    })
  }
  catch {
  }
}

function formatUsd(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

watch(() => wallet.token.value, () => {
  void refreshOverview()
}, { immediate: true })

onMounted(() => {
  void refreshOverview()
})
</script>

<template>
  <section class="panel pacifica-card">
    <div class="pacifica-card__header">
      <div>
        <p class="eyebrow">
          Pacifica account
        </p>
        <h2>Execution surface</h2>
      </div>

      <span :class="['status-pill', pacifica.readyToExecute.value ? 'status-pill--success' : '']">
        {{ readinessLabel }}
      </span>
    </div>

    <div class="pacifica-card__session-grid">
      <article class="pacifica-card__session-item">
        <span>Wallet</span>
        <strong>{{ wallet.shortAddress.value || 'Not connected' }}</strong>
      </article>
      <article class="pacifica-card__session-item">
        <span>Session</span>
        <strong>{{ truncateMiddle(wallet.sessionIdentity.value, 18) }}</strong>
      </article>
      <article class="pacifica-card__session-item">
        <span>Provider</span>
        <strong>{{ wallet.hasWalletProvider.value ? 'Available' : 'Missing' }}</strong>
      </article>
      <article class="pacifica-card__session-item">
        <span>Mode</span>
        <strong>{{ wallet.embedded.value ? 'Embedded' : 'Browser' }}</strong>
      </article>
    </div>

    <p class="pacifica-card__hint">
      {{ onboardingHint }}
    </p>

    <div class="pacifica-card__status-grid">
      <article v-for="item in statusItems" :key="item.label" class="pacifica-card__status-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </div>

    <div class="pacifica-card__actions">
      <button
        v-if="!wallet.isConnected.value"
        class="surface-button surface-button--primary"
        :disabled="wallet.connecting.value"
        type="button"
        @click="handleConnectWallet"
      >
        {{ wallet.connecting.value ? 'Connecting...' : 'Connect wallet' }}
      </button>

      <button
        v-else-if="!wallet.isAuthenticated.value"
        class="surface-button surface-button--primary"
        :disabled="wallet.authenticating.value"
        type="button"
        @click="handleSignSession"
      >
        {{ wallet.authenticating.value ? 'Verifying...' : 'Sign session' }}
      </button>

      <button
        v-else-if="!pacifica.readyToExecute.value"
        class="surface-button surface-button--primary"
        :disabled="pacifica.setupLoading.value"
        type="button"
        @click="handleCompleteOnboarding"
      >
        {{ pacifica.setupLoading.value ? 'Binding builder...' : 'Complete onboarding' }}
      </button>

      <a
        v-else-if="requiresPacificaActivation"
        class="surface-button surface-button--primary"
        :href="marketContext.pacificaDepositUrl.value"
        target="_blank"
        rel="noreferrer"
      >
        Deposit
      </a>

      <button
      v-else
        class="surface-button surface-button--secondary"
        :disabled="pacifica.loading.value"
        type="button"
        @click="refreshOverview"
      >
        Refresh overview
      </button>

      <a class="surface-link" :href="marketContext.pacificaPortfolioUrl.value" target="_blank" rel="noreferrer">
        Portfolio
      </a>
      <a class="surface-link" :href="marketContext.pacificaDepositUrl.value" target="_blank" rel="noreferrer">
        Deposit
      </a>
      <a class="surface-link" :href="marketContext.pacificaWithdrawUrl.value" target="_blank" rel="noreferrer">
        Withdraw
      </a>
    </div>

    <span v-if="requiresPacificaActivation" class="pacifica-card__funding">
      Activate Pacifica with AIRewardrop, then deposit at least {{ formatUsd(pacifica.minimumDepositUsd.value) }}.
    </span>

    <span v-if="requiresFunding" class="pacifica-card__funding">
      No funds on Pacifica.
    </span>

    <p v-if="pacifica.error.value" class="pacifica-card__error">
      {{ pacifica.error.value }}
    </p>

    <div v-if="accountMetrics.length" class="pacifica-card__metrics">
      <article v-for="metric in accountMetrics" :key="metric.label" class="pacifica-card__metric">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
      </article>
    </div>

    <div class="pacifica-card__positions">
      <div class="pacifica-card__positions-header">
        <p class="eyebrow">
          Open positions
        </p>
        <strong>{{ pacifica.activePositionsCount.value }}</strong>
      </div>

      <div v-if="pacifica.positions.value.length" class="pacifica-card__position-list">
        <article v-for="position in pacifica.positions.value" :key="`${position.symbol}-${position.side}`" class="pacifica-card__position">
          <div class="pacifica-card__position-main">
            <strong>{{ position.symbol }}</strong>
            <span>{{ position.side || 'n/a' }}</span>
          </div>

          <div class="pacifica-card__position-meta">
            <strong>{{ position.amount.toFixed(4) }}</strong>
            <span>{{ formatUsd(position.entryPrice) }} entry</span>
          </div>

          <button
            class="surface-button surface-button--secondary pacifica-card__close"
            :disabled="pacifica.closingSymbol.value === position.symbol"
            type="button"
            @click="handleClosePosition(position.symbol, position.side)"
          >
            {{ pacifica.closingSymbol.value === position.symbol ? 'Closing...' : 'Close' }}
          </button>
        </article>
      </div>

      <p v-else class="pacifica-card__empty">
        No active Pacifica positions.
      </p>
    </div>
  </section>
</template>

<style scoped>
.pacifica-card {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.pacifica-card__header,
.pacifica-card__positions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.pacifica-card__header h2 {
  margin: 10px 0 0;
  font-size: 1.18rem;
  letter-spacing: -0.03em;
}

.pacifica-card__session-grid,
.pacifica-card__status-grid,
.pacifica-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pacifica-card__session-item,
.pacifica-card__status-item,
.pacifica-card__metric,
.pacifica-card__position {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background: rgba(8, 20, 33, 0.42);
}

.pacifica-card__session-item span,
.pacifica-card__status-item span,
.pacifica-card__metric span,
.pacifica-card__position span {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.pacifica-card__hint,
.pacifica-card__empty {
  margin: 0;
  color: var(--text-1);
  line-height: 1.55;
  font-size: 0.94rem;
}

.pacifica-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pacifica-card__actions :deep(.surface-button),
.pacifica-card__actions :deep(.surface-link),
.pacifica-card__close {
  min-height: 36px;
  padding: 0 12px;
}

.pacifica-card__funding {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(86, 55, 15, 0.52);
  color: #ffe3a8;
  font-size: 0.88rem;
}

.pacifica-card__error {
  margin: 0;
  color: #ffc9d0;
}

.pacifica-card__positions {
  display: grid;
  gap: 10px;
}

.pacifica-card__position-list {
  display: grid;
  gap: 10px;
}

.pacifica-card__position {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
}

.pacifica-card__position-main,
.pacifica-card__position-meta {
  display: grid;
  gap: 6px;
}

.pacifica-card__position-main strong,
.pacifica-card__position-meta strong {
  font-size: 0.96rem;
}

@media (max-width: 760px) {
  .pacifica-card__header,
  .pacifica-card__positions-header {
    flex-direction: column;
  }

  .pacifica-card__session-grid,
  .pacifica-card__status-grid,
  .pacifica-card__metrics,
  .pacifica-card__position {
    grid-template-columns: 1fr;
  }
}
</style>
