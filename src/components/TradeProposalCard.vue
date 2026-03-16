<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import type { Air3TradeProposal } from '@airifica/air3-client'

import { createAir3Client } from '@/lib/air3'
import { useMarketContext } from '@/modules/market/context'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { useTradeExecutionPreferences } from '@/modules/product/execution'
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
const notionalUsd = ref('')
const autoExecutionStarted = ref(false)

const confidencePct = computed(() => Math.round((props.proposal.confidence || 0) * 100))
const requiresOnboarding = computed(() => wallet.isAuthenticated.value && !pacifica.readyToExecute.value)
const requiresFunding = computed(() =>
  wallet.isAuthenticated.value && pacifica.readyToExecute.value && ((pacifica.account.value?.availableToSpend || 0) <= 0),
)
const canExecute = computed(() =>
  wallet.isAuthenticated.value && pacifica.readyToExecute.value && !requiresFunding.value,
)
const pacificaTradeUrl = computed(() => marketContext.buildPacificaTradeUrl(props.proposal.symbol))
const pacificaDepositUrl = computed(() => marketContext.pacificaDepositUrl.value)
const pacificaWithdrawUrl = computed(() => marketContext.pacificaWithdrawUrl.value)
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

  if (requiresFunding.value) {
    result.value = {
      success: false,
      message: 'Pacifica account has no spendable balance yet. Deposit funds first.',
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
      proposal: props.proposal,
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
</script>

<template>
  <div class="proposal-card">
    <div class="proposal-card__header">
      <div>
        <span class="proposal-card__eyebrow">Pacifica suggestion</span>
        <strong>{{ proposal.symbol }} · {{ proposal.side }}</strong>
      </div>
      <span class="proposal-card__confidence">{{ confidencePct }}%</span>
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

    <p class="proposal-card__thesis">
      {{ proposal.thesis }}
    </p>

    <label class="proposal-card__field">
      <span>Optional notional (USD)</span>
      <input v-model="notionalUsd" type="number" min="0" step="1" placeholder="Use the runtime default when empty.">
    </label>

    <div class="proposal-card__links">
      <a :href="pacificaTradeUrl" target="_blank" rel="noreferrer">Trade</a>
      <a :href="pacificaDepositUrl" target="_blank" rel="noreferrer">Deposit</a>
      <a :href="pacificaWithdrawUrl" target="_blank" rel="noreferrer">Withdraw</a>
    </div>

    <div class="proposal-card__actions">
      <button
        v-if="!wallet.isConnected.value"
        class="proposal-card__action proposal-card__action--primary"
        :disabled="wallet.connecting.value"
        @click="handleConnectWallet"
      >
        {{ wallet.connecting.value ? 'Connecting...' : 'Connect wallet' }}
      </button>
      <button
        v-else-if="!wallet.isAuthenticated.value"
        class="proposal-card__action proposal-card__action--primary"
        :disabled="wallet.authenticating.value"
        @click="handleSignSession"
      >
        {{ wallet.authenticating.value ? 'Verifying...' : 'Sign session' }}
      </button>
      <button
        v-else-if="requiresOnboarding"
        class="proposal-card__action proposal-card__action--primary"
        :disabled="pacifica.setupLoading.value"
        @click="handleCompleteOnboarding"
      >
        {{ pacifica.setupLoading.value ? 'Binding builder...' : 'Complete onboarding' }}
      </button>
      <button
        v-else
        class="proposal-card__action proposal-card__action--primary"
        :disabled="executing || !canExecute"
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
      <span v-if="requiresFunding" class="proposal-card__note">
        Deposit funds before execution.
      </span>
    </div>

    <p v-if="result" :class="['proposal-card__result', result.success ? 'proposal-card__result--success' : 'proposal-card__result--error']">
      {{ result.message }}
    </p>
  </div>
</template>

<style scoped>
.proposal-card {
  display: grid;
  gap: 14px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(91, 214, 255, 0.16);
  background: rgba(6, 20, 33, 0.74);
}

.proposal-card__header,
.proposal-card__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.proposal-card__eyebrow {
  display: block;
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.proposal-card__levels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.proposal-card__levels article,
.proposal-card__field input {
  border-radius: 14px;
}

.proposal-card__levels article {
  display: grid;
  gap: 8px;
  padding: 12px;
  background: rgba(8, 20, 33, 0.62);
}

.proposal-card__levels span,
.proposal-card__field span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.proposal-card__confidence {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(91, 214, 255, 0.12);
}

.proposal-card__thesis,
.proposal-card__result {
  margin: 0;
  line-height: 1.55;
}

.proposal-card__field {
  display: grid;
  gap: 8px;
}

.proposal-card__field input {
  min-height: 40px;
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(8, 20, 33, 0.62);
  padding: 0 12px;
  outline: none;
}

.proposal-card__links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.proposal-card__links a,
.proposal-card__action {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  text-decoration: none;
}

.proposal-card__links a {
  border: 1px solid rgba(146, 198, 229, 0.16);
  background: rgba(12, 32, 49, 0.78);
}

.proposal-card__action {
  border: 1px solid transparent;
}

.proposal-card__action--primary {
  background: linear-gradient(135deg, #5bd6ff, #2eaad7);
  color: #03111b;
}

.proposal-card__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.proposal-card__note {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(86, 55, 15, 0.46);
  color: #ffe6b1;
}

.proposal-card__result--success {
  color: #c7f6e2;
}

.proposal-card__result--error {
  color: #ffd4da;
}

@media (max-width: 760px) {
  .proposal-card__levels {
    grid-template-columns: 1fr;
  }
}
</style>
