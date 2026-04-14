<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Air3OnchainPosition } from '@/lib/air3-client'

import { createAir3Client } from '@/lib/air3'
import { appConfig } from '@/config/app'
import { usePacificaAccount } from '@/modules/pacifica/account'
import { executeJupiterSpotClose } from '@/modules/trade/jupiter'
import { cancelJupiterSpotTpSl } from '@/modules/trade/jupiterTrigger'
import { useSpotCloseIntent } from '@/modules/trade/spotCloseIntent'
import { useWalletSession } from '@/modules/wallet/session'

const props = defineProps<{
  intent: {
    mintAddress: string
    symbol: string
    marketQuery: string
    closePct: number
  }
}>()

const wallet = useWalletSession()
const pacifica = usePacificaAccount()
const spotCloseIntent = useSpotCloseIntent()

const closing = ref(false)
const result = ref<{ success: boolean, message: string } | null>(null)

const position = computed<Air3OnchainPosition | null>(() =>
  pacifica.onchainPositions.value.find(item => String(item.mintAddress || '').trim() === String(props.intent.mintAddress || '').trim()) || null,
)

const actionLabel = computed(() => props.intent.closePct >= 100 ? 'Close market' : `Sell ${props.intent.closePct}%`)
const requestedQuantity = computed(() => {
  const activePosition = position.value
  if (!activePosition)
    return '--'

  const quantity = Number(activePosition.quantity || 0) * (props.intent.closePct / 100)
  return `${formatAssetAmount(quantity)} ${activePosition.symbol}`
})

const closeSummary = computed(() => {
  const activePosition = position.value
  if (!activePosition)
    return 'No live onchain holding matched this Telegram close request.'

  return `${actionLabel.value} for ${activePosition.symbol}`
})

function formatUsd(value: number | null | undefined) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric))
    return '--'

  const absolute = Math.abs(numeric)
  const maximumFractionDigits = absolute >= 100
    ? 2
    : absolute >= 1
      ? 2
      : absolute === 0
        ? 2
        : Math.min(4, Math.max(2, Math.abs(Math.floor(Math.log10(absolute))) + 1))
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}`
}

function formatPrice(value: number | null | undefined) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return '--'

  const absolute = Math.abs(numeric)
  const maximumFractionDigits = absolute >= 1
    ? 4
    : Math.min(6, Math.max(2, Math.abs(Math.floor(Math.log10(absolute))) + 1))
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

function formatAssetAmount(value: number | null | undefined) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric))
    return '--'

  const absolute = Math.abs(numeric)
  if (absolute >= 10_000) {
    return numeric.toLocaleString(undefined, {
      notation: 'compact',
      maximumFractionDigits: 3,
    } as Intl.NumberFormatOptions)
  }

  const maximumFractionDigits = absolute >= 1
    ? Math.min(3, absolute >= 100 ? 2 : 3)
    : absolute === 0
      ? 0
      : Math.min(5, Math.max(2, Math.abs(Math.floor(Math.log10(absolute))) + 1))

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

function decimalToAtomic(value: number, decimals: number) {
  const normalizedDecimals = Number.isFinite(decimals) && decimals > 0 ? Math.trunc(decimals) : 0
  const normalized = Math.max(0, Number(value || 0))
  const fixed = normalized.toFixed(normalizedDecimals)
  const [whole, fraction = ''] = fixed.split('.')
  const atomic = `${whole}${fraction.padEnd(normalizedDecimals, '0')}`.replace(/^0+(?=\d)/, '')
  return atomic || '0'
}

function atomicToDecimal(raw: string | null | undefined, decimals: number) {
  const digits = String(raw || '').trim()
  const normalizedDecimals = Number.isFinite(decimals) && decimals > 0 ? Math.trunc(decimals) : 0
  if (!/^\d+$/.test(digits))
    return 0

  const whole = normalizedDecimals > 0
    ? `${digits.padStart(normalizedDecimals + 1, '0').slice(0, -normalizedDecimals)}.${digits.padStart(normalizedDecimals + 1, '0').slice(-normalizedDecimals)}`
    : digits

  return Number(whole)
}

function computeCloseAmountAtomic(activePosition: Air3OnchainPosition) {
  const quantityAtomic = String(activePosition.quantityAtomic || '').trim()
  if (/^\d+$/.test(quantityAtomic) && BigInt(quantityAtomic) > 0n) {
    const raw = (BigInt(quantityAtomic) * BigInt(props.intent.closePct)) / 100n
    return raw > 0n ? raw.toString() : quantityAtomic
  }

  return decimalToAtomic(Number(activePosition.quantity || 0) * (props.intent.closePct / 100), Number(activePosition.decimals || 0))
}

async function ensureSpotWalletSession() {
  if (!wallet.isConnected.value)
    await wallet.connect()
  else if (!wallet.isAuthenticated.value)
    await wallet.authenticate()
}

async function handleClose() {
  const activePosition = position.value
  if (!activePosition)
    return

  try {
    await ensureSpotWalletSession()
  }
  catch {
    return
  }

  if (!wallet.address.value) {
    result.value = {
      success: false,
      message: 'Connect a wallet before signing the close transaction.',
    }
    return
  }

  const amountAtomic = computeCloseAmountAtomic(activePosition)
  if (!/^\d+$/.test(amountAtomic) || BigInt(amountAtomic) <= 0n) {
    result.value = {
      success: false,
      message: 'Unable to resolve a valid amount for this close request.',
    }
    return
  }

  closing.value = true
  result.value = null

  try {
    if (activePosition.triggerOrderId) {
      try {
        await cancelJupiterSpotTpSl({
          walletAddress: wallet.address.value,
          orderId: String(activePosition.triggerOrderId || ''),
        })
      }
      catch {
      }
    }

    const execution = await executeJupiterSpotClose({
      walletAddress: wallet.address.value,
      inputMint: activePosition.mintAddress,
      inputSymbol: activePosition.symbol,
      inputAmountAtomic: amountAtomic,
    })

    const decimals = Number(activePosition.decimals || 0)
    const closedQuantity = atomicToDecimal(execution.inputAmountAtomic || amountAtomic, decimals)
    const remainingQuantity = Math.max(0, Number(activePosition.quantity || 0) - closedQuantity)
    const remainingQuantityAtomic = /^\d+$/.test(String(activePosition.quantityAtomic || '').trim())
      ? (() => {
          const current = BigInt(String(activePosition.quantityAtomic || '0').trim())
          const closed = BigInt(execution.inputAmountAtomic || amountAtomic)
          const remaining = current > closed ? current - closed : 0n
          return remaining.toString()
        })()
      : decimalToAtomic(remainingQuantity, decimals)
    const receivedUsd = execution.outputAmountAtomic
      ? Number(execution.outputAmountAtomic) / (10 ** appConfig.jupiterInputDecimals)
      : 0

    if (remainingQuantity <= 0) {
      pacifica.removeOnchainPosition(activePosition.mintAddress)
    }
    else {
      pacifica.upsertOnchainPosition({
        ...activePosition,
        quantity: remainingQuantity,
        quantityAtomic: remainingQuantityAtomic,
        valueUsd: activePosition.priceUsd != null ? activePosition.priceUsd * remainingQuantity : activePosition.valueUsd ?? null,
        takeProfitPrice: null,
        stopLossPrice: null,
        triggerOrderId: null,
        triggerTxSignature: null,
        lastTradeAt: Date.now(),
        lastTxSignature: execution.signature,
        updatedAt: Date.now(),
      })
    }

    if (wallet.token.value) {
      try {
        const client = createAir3Client({
          token: wallet.token.value,
        })
        await client.notifyTelegramTrade({
          kind: 'POSITION_CLOSED',
          symbol: activePosition.symbol,
          side: 'SELL',
          venue: 'Jupiter',
          amountUsd: receivedUsd > 0 ? receivedUsd : undefined,
          quantity: closedQuantity > 0 ? closedQuantity : undefined,
          quantityAtomic: execution.inputAmountAtomic || amountAtomic,
          positionMint: activePosition.mintAddress,
          outputMint: appConfig.jupiterInputMint,
          marketQuery: activePosition.marketQuery || props.intent.marketQuery,
          txSignature: execution.signature,
          explorerUrl: execution.explorerUrl,
          headers: wallet.buildRequestHeaders(),
        })
      }
      catch {
      }
    }

    spotCloseIntent.clearIntent()
    result.value = {
      success: true,
      message: remainingQuantity > 0
        ? `${actionLabel.value} submitted for ${activePosition.symbol}.`
        : `${activePosition.symbol} spot position closed.`,
    }

    await pacifica.refreshOverview()
    setTimeout(() => {
      void pacifica.refreshOverview().catch(() => {})
    }, 1_500)
  }
  catch (error) {
    result.value = {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to close the spot position.',
    }
  }
  finally {
    closing.value = false
  }
}
</script>

<template>
  <div class="spot-close-card">
    <div class="spot-close-card__header">
      <div>
        <span class="spot-close-card__eyebrow">Spot exit</span>
        <strong>{{ closeSummary }}</strong>
      </div>
      <span class="spot-close-card__badge">
        {{ actionLabel }}
      </span>
    </div>

    <div class="spot-close-card__grid">
      <article>
        <span>Requested size</span>
        <strong>{{ requestedQuantity }}</strong>
      </article>
      <article>
        <span>Position value</span>
        <strong>{{ position ? formatUsd(position.valueUsd) : '--' }}</strong>
      </article>
      <article>
        <span>TP</span>
        <strong>{{ position ? formatPrice(position.takeProfitPrice) : '--' }}</strong>
      </article>
      <article>
        <span>SL</span>
        <strong>{{ position ? formatPrice(position.stopLossPrice) : '--' }}</strong>
      </article>
    </div>

    <p class="spot-close-card__hint">
      {{ position ? 'This closes the tracked Jupiter spot holding and removes any armed trigger before sending the market exit.' : 'Open positions will appear here once the runtime sync catches the holding.' }}
    </p>

    <div class="spot-close-card__actions">
      <button
        v-if="!wallet.isConnected.value"
        class="surface-button surface-button--primary"
        type="button"
        :disabled="wallet.connecting.value || wallet.authenticating.value"
        @click="ensureSpotWalletSession"
      >
        {{ wallet.connecting.value || wallet.authenticating.value ? 'Connecting…' : 'Connect wallet' }}
      </button>
      <button
        v-else
        class="surface-button surface-button--primary"
        type="button"
        :disabled="closing || !position"
        @click="handleClose"
      >
        {{ closing ? 'Closing…' : actionLabel }}
      </button>
    </div>

    <p v-if="result" :class="['spot-close-card__result', result.success ? 'spot-close-card__result--success' : 'spot-close-card__result--error']">
      {{ result.message }}
    </p>
  </div>
</template>

<style scoped>
.spot-close-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(244, 180, 76, 0.18);
  background: linear-gradient(180deg, rgba(20, 17, 10, 0.72), rgba(12, 13, 18, 0.82));
}

.spot-close-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.spot-close-card__header strong {
  display: block;
  color: #f6fbff;
}

.spot-close-card__eyebrow {
  color: rgba(255, 217, 132, 0.72);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.spot-close-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 199, 96, 0.18);
  background: rgba(99, 67, 16, 0.48);
  color: #ffd37a;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.spot-close-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.spot-close-card__grid article {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 214, 132, 0.08);
  background: rgba(18, 16, 12, 0.54);
}

.spot-close-card__grid span {
  color: rgba(240, 228, 206, 0.58);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.spot-close-card__grid strong {
  min-width: 0;
  color: #f6fbff;
  font-size: 0.96rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.spot-close-card__hint,
.spot-close-card__result {
  margin: 0;
  line-height: 1.5;
}

.spot-close-card__hint {
  color: rgba(255, 227, 173, 0.74);
  font-size: 0.8rem;
}

.spot-close-card__actions {
  display: flex;
  justify-content: flex-end;
}

.spot-close-card__result--success {
  color: rgba(148, 247, 190, 0.94);
}

.spot-close-card__result--error {
  color: rgba(255, 168, 168, 0.94);
}
</style>
