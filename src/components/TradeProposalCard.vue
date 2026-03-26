<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import type { Air3TradeProposal } from '@/lib/air3-client'

import { createAir3Client } from '@/lib/air3'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useTradeExecutionPreferences } from '@/modules/product/execution'
import { computeProposalConfidence, computeRiskReward } from '@/modules/trade/proposalMetrics'
import { useWalletSession } from '@/modules/wallet/session'

const props = defineProps<{
  proposal: Air3TradeProposal
  conversationId?: string
  messageId?: string
  createdAt?: number
}>()

const wallet = useWalletSession()
const pacifica = usePacificaAccount()
const marketContext = useMarketContext()
const product = useTradeExecutionPreferences()

const result = ref<{ success: boolean, message: string } | null>(null)
const executing = ref(false)
const awaitingConfirmation = ref(false)
const notionalUsd = ref('0')
const leverage = ref(1)
const autoExecutionStarted = ref(false)
const strategyOpen = ref(false)

const marketPrice = computed(() =>
  marketContext.currentSymbol.value === props.proposal.symbol ? marketContext.market.value?.price ?? null : null,
)
const marketMeta = computed(() =>
  marketContext.currentSymbol.value === props.proposal.symbol ? marketContext.market.value : null,
)
const maxLeverage = computed(() => {
  const marketMax = Number(marketMeta.value?.maxLeverage || 0)
  return Number.isFinite(marketMax) && marketMax >= 1 ? Math.max(1, Math.trunc(marketMax)) : 1
})
const numericSizeUsd = computed(() => {
  const numeric = Number(notionalUsd.value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
})
const effectiveNotionalUsd = computed(() => numericSizeUsd.value * leverage.value)
const estimatedAssetAmount = computed(() =>
  props.proposal.entry > 0 ? effectiveNotionalUsd.value / props.proposal.entry : 0,
)
const availableCollateralUsd = computed(() => {
  const available = Number(pacifica.account.value?.availableToSpend || 0)
  return Number.isFinite(available) && available > 0 ? available : 0
})
const exceedsAvailableCollateral = computed(() =>
  availableCollateralUsd.value > 0 && numericSizeUsd.value > availableCollateralUsd.value,
)
const minimumOrderHint = computed(() => {
  const minimum = Number(marketMeta.value?.minOrderSize || 0)
  return Number.isFinite(minimum) && minimum > 0 ? minimum : null
})
const minLeverage = computed(() => 1)
const collateralPresets = [10, 20, 30] as const
const derivedConfidence = computed(() => computeProposalConfidence(props.proposal, { marketPrice: marketPrice.value }))
const confidencePct = computed(() => Math.round(derivedConfidence.value * 100))
const riskReward = computed(() => computeRiskReward(props.proposal))
const riskRewardLabel = computed(() => Number.isFinite(riskReward.value) && riskReward.value > 0 ? riskReward.value.toFixed(2) : '--')
const confidenceStyle = computed(() => {
  const tone = Math.max(0, Math.min(1, confidencePct.value / 100))
  const hue = Math.round(tone * 120)
  return {
    color: `hsl(${hue} 88% 72%)`,
    borderColor: `hsla(${hue}, 82%, 54%, 0.26)`,
    background: `hsla(${hue}, 82%, 18%, 0.42)`,
  }
})
const riskRewardStyle = computed(() => {
  const tone = Math.max(0, Math.min(1, riskReward.value / 3))
  const hue = Math.round(tone * 120)
  return {
    color: `hsl(${hue} 88% 72%)`,
    borderColor: `hsla(${hue}, 82%, 54%, 0.24)`,
    background: `hsla(${hue}, 82%, 16%, 0.32)`,
  }
})
const proposalForExecution = computed(() => ({
  ...props.proposal,
  confidence: Number(derivedConfidence.value.toFixed(2)),
}))
const requiresOnboarding = computed(() => wallet.isAuthenticated.value && !pacifica.readyToExecute.value)
const requiresActivation = computed(() =>
  wallet.isAuthenticated.value && pacifica.readyToExecute.value && pacifica.accountMissing.value,
)
const requiresFunding = computed(() =>
  wallet.isAuthenticated.value && pacifica.readyToExecute.value && !pacifica.accountMissing.value && ((pacifica.account.value?.availableToSpend || 0) <= 0),
)
const canExecute = computed(() =>
  wallet.isAuthenticated.value && pacifica.readyToExecute.value && !requiresActivation.value && !requiresFunding.value,
)
const pacificaTradeUrl = computed(() => marketContext.buildPacificaTradeUrl(props.proposal.symbol))
const pacificaFundingUrl = computed(() => requiresActivation.value ? pacificaTradeUrl.value : marketContext.pacificaDepositUrl.value)
const hasStrategy = computed(() => Boolean(props.proposal.thesis?.trim()))
const sideTone = computed(() => props.proposal.side === 'LONG'
  ? {
      label: 'LONG',
      className: 'proposal-card__side proposal-card__side--long',
    }
  : {
      label: 'SHORT',
      className: 'proposal-card__side proposal-card__side--short',
    })
const proposalFreshEnoughForAutoMode = computed(() => {
  if (!props.createdAt)
    return false
  return Date.now() - props.createdAt < 15_000
})

function notifyEmbeddedTradeExecuted(payload: Record<string, unknown>) {
  if (typeof window === 'undefined' || window.parent === window)
    return

  let targetOrigin = '*'
  if (document.referrer) {
    try {
      targetOrigin = new URL(document.referrer).origin
    }
    catch {
    }
  }

  window.parent.postMessage({
    type: 'AIRI3_TRADE_EXECUTED',
    ...payload,
  }, targetOrigin)
}

function formatUsd(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })
}

function formatAssetAmount(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
}

function formatInputUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0)
    return '0'

  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1')
}

function clampLeverage(value: number) {
  if (!Number.isFinite(value))
    return minLeverage.value

  return Math.min(Math.max(minLeverage.value, Math.trunc(value)), maxLeverage.value)
}

function clampCollateralInput(value: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return value === '' ? '' : '0'

  const maxAllowed = availableCollateralUsd.value
  if (maxAllowed > 0 && numeric > maxAllowed)
    return formatInputUsd(maxAllowed)

  return value
}

async function handleExecute() {
  if (executing.value)
    return

  if (!wallet.address.value || !wallet.token.value) {
    result.value = {
      success: false,
      message: 'Connect your wallet and sign the session before executing Pacifica actions.',
    }
    return
  }

  if (!pacifica.readyToExecute.value) {
    result.value = {
      success: false,
      message: 'Pacifica onboarding incomplete. Complete builder approval and bind the agent first.',
    }
    return
  }

  if (requiresActivation.value) {
    result.value = {
      success: false,
      message: `Open Pacifica with AIRewardrop once and deposit at least ${pacifica.minimumDepositUsd.value} USDC before execution.`,
    }
    return
  }

  if (requiresFunding.value) {
    result.value = {
      success: false,
      message: 'No funds on Pacifica. Deposit before execution.',
    }
    return
  }

  if (exceedsAvailableCollateral.value) {
    result.value = {
      success: false,
      message: `Collateral exceeds available balance (${formatUsd(availableCollateralUsd.value)} USD).`,
    }
    return
  }

  executing.value = true
  awaitingConfirmation.value = false
  result.value = null

  try {
    const client = createAir3Client({
      token: wallet.token.value,
    })
    const proposalResponse = await client.createTradeProposal({
      walletAddress: wallet.address.value,
      conversationId: props.conversationId,
      proposal: proposalForExecution.value,
      headers: wallet.buildRequestHeaders(),
    })

    const proposalId = proposalResponse.proposal?.id
    if (!proposalId)
      throw new Error('The proposal was created without an execution id.')

    const requestedNotional = Number(notionalUsd.value)
    const approval = await client.approveTradeProposal({
      proposalId,
      walletAddress: wallet.address.value,
      notionalUsd: Number.isFinite(requestedNotional) && requestedNotional > 0 ? requestedNotional : undefined,
      leverage: leverage.value,
      headers: wallet.buildRequestHeaders(),
    })

    if (!approval.ok)
      throw new Error(approval.hint || approval.error || 'Pacifica execution failed.')

    result.value = {
      success: true,
      message: `Order submitted${approval.orderId ? ` (${approval.orderId})` : ''}.`,
    }

    notifyEmbeddedTradeExecuted({
      conversationId: props.conversationId,
      proposalId,
      orderId: approval.orderId,
      symbol: props.proposal.symbol,
      side: props.proposal.side,
    })

    await pacifica.refreshOverview()
  }
  catch (error) {
    result.value = {
      success: false,
      message: error instanceof Error ? error.message : 'Execution failed.',
    }
  }
  finally {
    executing.value = false
  }
}

watch(() => maxLeverage.value, (value) => {
  leverage.value = clampLeverage(Math.min(value, leverage.value))
}, { immediate: true })

watch(() => props.proposal.symbol, () => {
  leverage.value = minLeverage.value
})

watch(leverage, (value) => {
  const normalized = clampLeverage(value)
  if (normalized !== value)
    leverage.value = normalized
})

watch(notionalUsd, (value) => {
  const normalized = clampCollateralInput(value)
  if (normalized !== value)
    notionalUsd.value = normalized
})

watch(availableCollateralUsd, () => {
  notionalUsd.value = clampCollateralInput(notionalUsd.value)
})

function applyCollateralPreset(percent: number) {
  if (availableCollateralUsd.value <= 0)
    return

  const nextValue = availableCollateralUsd.value * (percent / 100)
  notionalUsd.value = formatInputUsd(nextValue)
}

function handleExecuteClick() {
  if (!canExecute.value)
    return

  if (product.fullAutoMode.value)
    return void handleExecute()

  if (product.confirmBeforeTrade.value && !awaitingConfirmation.value) {
    awaitingConfirmation.value = true
    return
  }

  return void handleExecute()
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
    await pacifica.refreshOverview()
    result.value = {
      success: true,
      message: 'Pacifica onboarding completed. AIR3 can execute proposals now.',
    }
    maybeAutoExecute()
  }
  catch (error) {
    result.value = {
      success: false,
      message: error instanceof Error ? error.message : 'Pacifica onboarding failed.',
    }
  }
}

function maybeAutoExecute() {
  if (!product.fullAutoMode.value || autoExecutionStarted.value || executing.value || !canExecute.value)
    return
  if (!props.messageId || product.hasAutoHandledProposal(props.messageId))
    return
  if (!proposalFreshEnoughForAutoMode.value)
    return

  autoExecutionStarted.value = true
  product.markProposalAutoHandled(props.messageId)
  void handleExecute()
}

watch(() => canExecute.value, () => {
  maybeAutoExecute()
})

onMounted(() => {
  maybeAutoExecute()
})

function toggleStrategy() {
  if (!hasStrategy.value)
    return

  strategyOpen.value = !strategyOpen.value
}
</script>

<template>
  <div class="proposal-card">
    <div class="proposal-card__header">
      <div class="proposal-card__symbol-wrap">
        <strong>${{ proposal.symbol }}</strong>
        <span class="proposal-card__timeframe">{{ proposal.timeframe }}</span>
      </div>
      <div class="proposal-card__signal-wrap">
        <span :class="sideTone.className">{{ sideTone.label }}</span>
        <span class="proposal-card__risk-reward" :style="riskRewardStyle">R/R: {{ riskRewardLabel }}</span>
      </div>
      <div class="proposal-card__confidence-wrap">
        <span class="proposal-card__confidence-label">Confidence:</span>
        <span class="status-pill proposal-card__confidence" :style="confidenceStyle" title="Confidence">
          {{ confidencePct }}%
        </span>
      </div>
    </div>

    <div class="proposal-card__levels">
      <article>
        <span>Entry</span>
        <strong>{{ proposal.entry.toLocaleString(undefined, { maximumFractionDigits: 6 }) }}</strong>
      </article>
      <article>
        <span>Take profit</span>
        <strong>{{ proposal.tp.toLocaleString(undefined, { maximumFractionDigits: 6 }) }}</strong>
      </article>
      <article>
        <span>Stop loss</span>
        <strong>{{ proposal.sl.toLocaleString(undefined, { maximumFractionDigits: 6 }) }}</strong>
      </article>
    </div>

    <div class="proposal-card__execution">
      <div class="proposal-card__execution-summary">
        <label class="proposal-card__field proposal-card__field--size">
          <span>Collateral</span>
          <input v-model="notionalUsd" type="number" min="0" step="0.1" placeholder="0">
        </label>

        <article class="proposal-card__execution-metric proposal-card__execution-metric--quantity">
          <span>Quantity</span>
          <strong>{{ formatAssetAmount(estimatedAssetAmount) }} {{ proposal.symbol }}</strong>
        </article>

        <article class="proposal-card__execution-metric">
          <span>Position size</span>
          <strong>{{ formatUsd(effectiveNotionalUsd) }} USD</strong>
        </article>
      </div>

      <div class="proposal-card__leverage">
        <div class="proposal-card__leverage-head">
          <span>Leverage</span>
          <label class="proposal-card__leverage-input-shell">
            <input
              v-model.number="leverage"
              class="proposal-card__leverage-input"
              type="number"
              :min="minLeverage"
              :max="maxLeverage"
              step="1"
            >
            <strong>x</strong>
          </label>
        </div>
        <input
          v-model.number="leverage"
          class="proposal-card__leverage-slider"
          type="range"
          :min="minLeverage"
          :max="maxLeverage"
          step="1"
        >
        <div class="proposal-card__leverage-scale">
          <span>{{ minLeverage }}x</span>
          <span>{{ maxLeverage }}x max</span>
        </div>
      </div>
    </div>

    <p v-if="minimumOrderHint" class="proposal-card__market-hint">
      Pacifica {{ proposal.symbol }} currently reports lot {{ marketMeta?.lotSize ?? 'n/a' }} and minimum order {{ minimumOrderHint }} USD.
    </p>

    <div class="proposal-card__utility-row">
      <button
        v-if="hasStrategy"
        class="proposal-card__strategy-toggle"
        type="button"
        @click="toggleStrategy"
      >
        Action strategy
      </button>

      <button
        v-if="requiresOnboarding"
        class="proposal-card__utility-link proposal-card__utility-link--primary"
        :disabled="pacifica.setupLoading.value"
        type="button"
        @click="handleCompleteOnboarding"
      >
        {{ pacifica.setupLoading.value ? 'Connecting…' : 'Complete onboarding' }}
      </button>
      <a
        v-else-if="requiresActivation || requiresFunding"
        class="proposal-card__utility-link proposal-card__utility-link--primary"
        :href="pacificaFundingUrl"
        target="_blank"
        rel="noreferrer"
      >
        Deposit
      </a>
    </div>

    <div class="proposal-card__actions">
      <button
        v-if="!wallet.isConnected.value"
        class="surface-button surface-button--primary proposal-card__action"
        :disabled="wallet.connecting.value"
        type="button"
        @click="handleConnectWallet"
      >
        {{ wallet.connecting.value ? 'Connecting...' : 'Connect wallet' }}
      </button>
      <button
        v-else-if="!wallet.isAuthenticated.value"
        class="surface-button surface-button--primary proposal-card__action"
        :disabled="wallet.authenticating.value"
        type="button"
        @click="handleSignSession"
      >
        {{ wallet.authenticating.value ? 'Verifying...' : 'Sign session' }}
      </button>
      <a
        v-else-if="requiresActivation || requiresFunding"
        class="surface-button surface-button--primary proposal-card__action"
        :href="pacificaFundingUrl"
        target="_blank"
        rel="noreferrer"
      >
        Deposit
      </a>
      <span v-if="requiresActivation" class="proposal-card__note">
        Activate Pacifica with AIRewardrop, then deposit at least {{ pacifica.minimumDepositUsd.value }} USDC.
      </span>
      <span v-if="requiresFunding" class="proposal-card__note">
        No funds on Pacifica.
      </span>
    </div>

    <p
      v-if="wallet.isAuthenticated.value && !requiresOnboarding && !requiresActivation && !requiresFunding && availableCollateralUsd > 0"
      class="proposal-card__market-hint"
    >
      Available collateral: {{ formatUsd(availableCollateralUsd) }} USD.
    </p>

    <div
      v-if="wallet.isAuthenticated.value && !requiresOnboarding && !requiresActivation && !requiresFunding"
      class="proposal-card__execution-actions"
    >
      <div class="proposal-card__preset-row">
        <button
          v-for="preset in collateralPresets"
          :key="preset"
          class="proposal-card__preset"
          type="button"
          :disabled="availableCollateralUsd <= 0"
          @click="applyCollateralPreset(preset)"
        >
          {{ preset }}%
        </button>
      </div>

      <button
        class="surface-button surface-button--primary proposal-card__action proposal-card__action--execute"
        :disabled="executing || !canExecute"
        type="button"
        @click="handleExecuteClick"
      >
        {{
          executing
            ? 'Executing...'
            : awaitingConfirmation
              ? 'Confirm execution'
              : 'Execute trade'
        }}
      </button>
    </div>

    <p v-if="result" :class="['proposal-card__result', result.success ? 'proposal-card__result--success' : 'proposal-card__result--error']">
      {{ result.message }}
    </p>

    <Teleport to="body">
      <Transition name="surface-overlay">
        <button
          v-if="strategyOpen && hasStrategy"
          class="proposal-card__strategy-overlay"
          type="button"
          aria-label="Close action strategy"
          @click="toggleStrategy"
        >
          <div class="proposal-card__strategy-panel" @click.stop>
            <div class="proposal-card__strategy-title">Action strategy</div>
            <p>{{ proposal.thesis }}</p>
          </div>
        </button>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.proposal-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(91, 214, 255, 0.14);
  background: rgba(5, 17, 28, 0.78);
}

.proposal-card__header,
.proposal-card__utility-row,
.proposal-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.proposal-card__symbol-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.proposal-card__signal-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.proposal-card__confidence-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.proposal-card__confidence-label {
  color: rgba(186, 230, 253, 0.62);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.proposal-card__symbol-wrap strong {
  font-size: 1rem;
}

.proposal-card__timeframe {
  color: var(--text-2);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.proposal-card__side {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 2px;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.proposal-card__risk-reward {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  border-radius: 2px;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.proposal-card__side--long {
  background: #18a95f;
}

.proposal-card__side--short {
  background: #d14b5d;
}

.proposal-card__levels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.proposal-card__levels article,
.proposal-card__field input {
  border-radius: 12px;
}

.proposal-card__levels article {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background: rgba(8, 20, 33, 0.44);
}

.proposal-card__levels span,
.proposal-card__field span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.proposal-card__result {
  margin: 0;
  line-height: 1.55;
}

.proposal-card__execution {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  background: rgba(8, 20, 33, 0.44);
}

.proposal-card__field {
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 6px;
}

.proposal-card__execution-summary {
  display: grid;
  grid-template-columns: minmax(86px, 0.56fr) minmax(0, 0.72fr) minmax(0, 0.72fr);
  gap: 10px;
  align-items: start;
}

.proposal-card__field--size span,
.proposal-card__execution-metric span {
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.proposal-card__field input {
  min-height: 36px;
  border: 1px solid rgba(138, 218, 255, 0.12);
  background: rgba(2, 12, 21, 0.78);
  padding: 0 8px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #f5fbff;
  outline: none;
}

.proposal-card__field--size input {
  width: 100%;
  min-width: 0;
}

.proposal-card__execution-metric {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.proposal-card__execution-metric--quantity {
  text-align: center;
}

.proposal-card__execution-metric strong {
  color: #eefaff;
  font-size: 1.04rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}

.proposal-card__leverage-input-shell {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.proposal-card__leverage-input {
  width: 52px;
  min-height: 24px;
  padding: 0 2px 0 0;
  border: 0;
  border-bottom: 1px solid rgba(138, 218, 255, 0.18);
  background: transparent;
  color: #8af4ff;
  font-size: 0.94rem;
  font-weight: 700;
  text-align: right;
  outline: none;
}

.proposal-card__leverage-input::-webkit-outer-spin-button,
.proposal-card__leverage-input::-webkit-inner-spin-button {
  margin: 0;
}

.proposal-card__leverage {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 0;
}

.proposal-card__leverage-head,
.proposal-card__leverage-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.proposal-card__leverage-head span,
.proposal-card__leverage-scale span {
  color: var(--text-2);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.proposal-card__leverage-head strong {
  color: #8af4ff;
  font-size: 0.94rem;
}

.proposal-card__leverage-slider {
  width: 100%;
  accent-color: #67e8f9;
}

.proposal-card__market-hint {
  margin: -2px 0 0;
  color: rgba(186, 230, 253, 0.56);
  font-size: 0.72rem;
  line-height: 1.5;
}

.proposal-card__action {
  min-height: 36px;
  padding: 0 12px;
}

.proposal-card__execution-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.proposal-card__preset-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.proposal-card__preset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 36px;
  padding: 0;
  border: 1px solid rgba(138, 218, 255, 0.08);
  border-radius: 10px;
  background: rgba(8, 20, 33, 0.78);
  color: rgba(224, 242, 254, 0.88);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.proposal-card__preset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.proposal-card__action--execute {
  margin-left: auto;
}

.proposal-card__utility-link,
.proposal-card__strategy-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
}

.proposal-card__utility-link {
  border: 0;
  background: #67e8f9;
  color: #0f172a;
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
}

.proposal-card__strategy-toggle {
  border: 0;
  background: transparent;
  color: rgba(186, 230, 253, 0.82);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  transition: color 160ms ease, text-shadow 160ms ease;
}

.proposal-card__strategy-toggle:hover {
  color: #facc15;
  text-shadow: 0 0 16px rgba(250, 204, 21, 0.34);
}

.proposal-card__utility-link--primary:hover {
  background: #8af4ff;
}

.proposal-card__note {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(86, 55, 15, 0.5);
  color: #ffe6b1;
  font-size: 0.86rem;
}

.proposal-card__result--success {
  color: #c7f6e2;
}

.proposal-card__result--error {
  color: #ffd4da;
}

.proposal-card__strategy-overlay {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  padding: 6vh 5vw;
  border: 0;
  background: rgba(2, 10, 17, 0.52);
  backdrop-filter: blur(8px);
}

.surface-overlay-enter-active,
.surface-overlay-leave-active {
  transition: opacity 280ms ease, backdrop-filter 280ms ease, background-color 280ms ease;
}

.surface-overlay-enter-active .proposal-card__strategy-panel,
.surface-overlay-leave-active .proposal-card__strategy-panel {
  transition:
    opacity 320ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 320ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 320ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

.surface-overlay-enter-from,
.surface-overlay-leave-to {
  opacity: 0;
  background: rgba(2, 10, 17, 0);
  backdrop-filter: blur(0px);
}

.surface-overlay-enter-from .proposal-card__strategy-panel,
.surface-overlay-leave-to .proposal-card__strategy-panel {
  opacity: 0;
  transform: translateY(24px) scale(0.92);
  filter: blur(1.2px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.proposal-card__strategy-panel {
  width: min(640px, 92vw);
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid rgba(138, 218, 255, 0.18);
  background: rgba(5, 17, 28, 0.94);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
  text-align: left;
}

.proposal-card__strategy-title {
  margin-bottom: 10px;
  color: rgba(186, 230, 253, 0.8);
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.proposal-card__strategy-panel p {
  margin: 0;
  color: var(--text-1);
  white-space: pre-wrap;
  line-height: 1.68;
}

@media (max-width: 760px) {
  .proposal-card__levels {
    grid-template-columns: 1fr;
  }

  .proposal-card__execution,
  .proposal-card__field,
  .proposal-card__execution-summary {
    grid-template-columns: 1fr;
  }

  .proposal-card__execution-actions {
    align-items: stretch;
  }

  .proposal-card__preset-row {
    flex-wrap: wrap;
  }

  .proposal-card__action--execute {
    width: 100%;
    margin-left: 0;
  }
}
</style>
