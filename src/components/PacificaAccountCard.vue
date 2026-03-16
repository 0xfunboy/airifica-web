<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

import { usePacificaAccount } from '@/modules/pacifica/account'
import { useWalletSession } from '@/modules/wallet/session'

const pacifica = usePacificaAccount()
const wallet = useWalletSession()

const statusItems = computed(() => [
  {
    label: 'Binding',
    value: pacifica.status.value.hasBinding ? 'available' : 'missing',
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

const onboardingHint = computed(() => {
  if (!wallet.isConnected.value)
    return 'Connect your Solana wallet first.'
  if (!wallet.isAuthenticated.value)
    return 'Sign the AIR3 session before querying Pacifica.'
  if (!pacifica.status.value.hasBinding)
    return 'Builder onboarding has not started yet.'
  if (!pacifica.readyToExecute.value)
    return 'Builder approval or agent binding is still pending.'
  if ((pacifica.account.value?.availableToSpend || 0) <= 0)
    return 'The account is connected. Deposit funds to make execution available.'
  return 'Pacifica account is ready for execution.'
})

const requiresFunding = computed(() =>
  Boolean(wallet.isAuthenticated.value && pacifica.readyToExecute.value && ((pacifica.account.value?.availableToSpend || 0) <= 0)),
)

function formatUsd(value: number | null | undefined) {
  if (!Number.isFinite(value))
    return '--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

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
        <h2>Execution overview</h2>
      </div>
      <button class="pacifica-card__refresh" :disabled="pacifica.loading.value" @click="refreshOverview">
        {{ pacifica.loading.value ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <div class="pacifica-card__status-grid">
      <article v-for="item in statusItems" :key="item.label" class="pacifica-card__status-item">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </div>

    <p class="pacifica-card__hint">
      {{ onboardingHint }}
    </p>

    <div class="pacifica-card__actions">
      <button
        v-if="!wallet.isConnected.value"
        class="pacifica-card__action pacifica-card__action--primary"
        :disabled="wallet.connecting.value"
        @click="handleConnectWallet"
      >
        {{ wallet.connecting.value ? 'Connecting...' : 'Connect wallet' }}
      </button>
      <button
        v-else-if="!wallet.isAuthenticated.value"
        class="pacifica-card__action pacifica-card__action--primary"
        :disabled="wallet.authenticating.value"
        @click="handleSignSession"
      >
        {{ wallet.authenticating.value ? 'Verifying...' : 'Sign session' }}
      </button>
      <button
        v-else-if="!pacifica.readyToExecute.value"
        class="pacifica-card__action pacifica-card__action--primary"
        :disabled="pacifica.setupLoading.value"
        @click="handleCompleteOnboarding"
      >
        {{ pacifica.setupLoading.value ? 'Binding builder...' : 'Complete onboarding' }}
      </button>
      <button v-else class="pacifica-card__action pacifica-card__action--secondary" :disabled="pacifica.loading.value" @click="refreshOverview">
        Refresh overview
      </button>
      <span v-if="requiresFunding" class="pacifica-card__funding">
        Deposit funds to enable execution.
      </span>
    </div>

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
          <div>
            <strong>{{ position.symbol }}</strong>
            <span>{{ position.side || 'n/a' }}</span>
          </div>
          <div>
            <strong>{{ position.amount.toFixed(4) }}</strong>
            <span>{{ formatUsd(position.entryPrice) }} entry</span>
          </div>
          <button
            class="pacifica-card__close"
            :disabled="pacifica.closingSymbol.value === position.symbol"
            @click="handleClosePosition(position.symbol, position.side)"
          >
            {{ pacifica.closingSymbol.value === position.symbol ? 'Closing...' : 'Close position' }}
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
  padding: 22px;
  display: grid;
  gap: 18px;
}

.pacifica-card__header,
.pacifica-card__positions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pacifica-card__header h2 {
  margin: 12px 0 0;
  font-size: 1.22rem;
}

.pacifica-card__refresh {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
}

.pacifica-card__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pacifica-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pacifica-card__action,
.pacifica-card__close {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.pacifica-card__action:disabled,
.pacifica-card__close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pacifica-card__action--primary {
  background: linear-gradient(135deg, #5bd6ff, #2eaad7);
  color: #03111b;
}

.pacifica-card__action--secondary,
.pacifica-card__close {
  border-color: rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
}

.pacifica-card__funding {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(86, 55, 15, 0.46);
  color: #ffe6b1;
}

.pacifica-card__status-grid,
.pacifica-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pacifica-card__status-item,
.pacifica-card__metric,
.pacifica-card__position {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.1);
  background: rgba(8, 20, 33, 0.62);
}

.pacifica-card__status-item span,
.pacifica-card__metric span,
.pacifica-card__position span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.pacifica-card__hint,
.pacifica-card__empty {
  margin: 0;
  color: var(--text-1);
  line-height: 1.55;
}

.pacifica-card__error {
  margin: 0;
  color: #ffc3cb;
}

.pacifica-card__positions {
  display: grid;
  gap: 12px;
}

.pacifica-card__position-list {
  display: grid;
  gap: 10px;
}

.pacifica-card__position {
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
}

.pacifica-card__position div {
  display: grid;
  gap: 8px;
}

@media (max-width: 760px) {
  .pacifica-card__status-grid,
  .pacifica-card__metrics,
  .pacifica-card__position {
    grid-template-columns: 1fr;
  }

  .pacifica-card__header,
  .pacifica-card__positions-header {
    flex-direction: column;
  }
}
</style>
