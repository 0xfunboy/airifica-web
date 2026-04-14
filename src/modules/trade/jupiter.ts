import { VersionedTransaction } from '@solana/web3.js'

import { appConfig } from '@/config/app'
import { base64ToBytes, bytesToBase64, getSolanaProvider } from '@/lib/solana'

interface JupiterOrderResponse {
  requestId?: string
  transaction?: string
  inputMint?: string
  outputMint?: string
  inAmount?: string
  outAmount?: string
  error?: string
  code?: string | number
}

interface JupiterExecuteResponse {
  status?: string
  signature?: string
  error?: string
  code?: string | number
}

interface ExecuteJupiterSwapInput {
  walletAddress: string
  inputMint: string
  outputMint: string
  outputSymbol: string
  inputAmountAtomic: string
}

export interface ExecuteJupiterSpotSwapInput {
  walletAddress: string
  outputMint: string
  outputSymbol: string
  inputAmountUsd: number
}

export interface ExecuteJupiterSpotSwapResult {
  status: string
  signature: string | null
  explorerUrl: string | null
  requestId: string
  inputMint: string | null
  outputMint: string | null
  inputAmountAtomic: string | null
  outputAmountAtomic: string | null
}

interface JupiterReferralPolicy {
  enabled: boolean
  referralAccount: string | null
  referralFeeBps: number
}

function buildJupiterApiUrl(pathname: string, search?: URLSearchParams) {
  const normalizedBase = appConfig.jupiterApiBaseUrl.replace(/\/+$/, '')
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const suffix = search && search.size ? `?${search.toString()}` : ''
  return `${normalizedBase}${normalizedPath}${suffix}`
}

function readJupiterError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const errorValue = (payload as Record<string, unknown>).error
    const messageValue = (payload as Record<string, unknown>).message
    const message = typeof errorValue === 'string'
      ? errorValue
      : typeof messageValue === 'string'
        ? messageValue
        : ''
    if (message.trim())
      return message.trim()
  }

  return fallback
}

async function requestJupiterJson<T>(pathname: string, init?: RequestInit, search?: URLSearchParams) {
  const response = await fetch(buildJupiterApiUrl(pathname, search), init)
  const raw = await response.text()
  let payload: T | null = null

  if (raw) {
    try {
      payload = JSON.parse(raw) as T
    }
    catch {
      if (!response.ok)
        throw new Error(raw.trim() || `Jupiter request failed (${response.status}).`)
      throw new Error('Jupiter returned an invalid JSON response.')
    }
  }

  if (!response.ok)
    throw new Error(readJupiterError(payload, `Jupiter request failed (${response.status}).`))

  if (!payload)
    throw new Error('Jupiter returned an empty response.')

  return payload
}

function toAtomicAmount(amountUsd: number) {
  const scale = 10 ** appConfig.jupiterInputDecimals
  return Math.max(0, Math.floor(amountUsd * scale))
}

function sanitizeAtomicAmount(raw: string) {
  const trimmed = String(raw || '').trim()
  if (!/^\d+$/.test(trimmed))
    throw new Error('Jupiter execution requires a valid atomic token amount.')
  if (BigInt(trimmed) <= 0n)
    throw new Error('Jupiter execution requires a positive token amount.')
  return trimmed
}

function shortSignature(signature: string | null | undefined) {
  if (!signature)
    return null
  return `${signature.slice(0, 6)}…${signature.slice(-6)}`
}

function resolveJupiterReferralPolicy(outputSymbol: string): JupiterReferralPolicy {
  const referralAccount = appConfig.jupiterReferralAccount.trim()
  const referralFeeBps = Math.trunc(appConfig.jupiterReferralFeeBps)
  const symbol = String(outputSymbol || '').trim().toUpperCase()
  const enabledSymbols = new Set(appConfig.jupiterReferralEnabledSymbols)
  const disabledSymbols = new Set(appConfig.jupiterReferralDisabledSymbols)

  if (!referralAccount || !Number.isFinite(referralFeeBps) || referralFeeBps < 50 || referralFeeBps > 255)
    return { enabled: false, referralAccount: null, referralFeeBps: 0 }

  if (enabledSymbols.size > 0)
    return {
      enabled: enabledSymbols.has(symbol),
      referralAccount,
      referralFeeBps,
    }

  return {
    enabled: symbol ? !disabledSymbols.has(symbol) : false,
    referralAccount,
    referralFeeBps,
  }
}

async function executeJupiterSwap(input: ExecuteJupiterSwapInput): Promise<ExecuteJupiterSpotSwapResult> {
  const provider = getSolanaProvider()
  if (!provider)
    throw new Error('No Solana wallet detected.')

  if (!provider.signTransaction)
    throw new Error('The active Solana wallet does not support transaction signing.')

  const inputAmountAtomic = sanitizeAtomicAmount(input.inputAmountAtomic)

  const referralPolicy = resolveJupiterReferralPolicy(input.outputSymbol)
  const search = new URLSearchParams({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: inputAmountAtomic,
    taker: input.walletAddress,
  })

  if (referralPolicy.enabled && referralPolicy.referralAccount) {
    search.set('referralAccount', referralPolicy.referralAccount)
    search.set('referralFee', String(referralPolicy.referralFeeBps))
  }

  const order = await requestJupiterJson<JupiterOrderResponse>('order', {
    method: 'GET',
  }, search)

  if (!order.transaction || !order.requestId)
    throw new Error(readJupiterError(order, 'Jupiter did not return a signable swap transaction.'))

  const transaction = VersionedTransaction.deserialize(base64ToBytes(order.transaction))
  const signedTransaction = await provider.signTransaction(transaction) || transaction
  const signedBase64 = bytesToBase64(signedTransaction.serialize())

  const execution = await requestJupiterJson<JupiterExecuteResponse>('execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId: order.requestId,
      signedTransaction: signedBase64,
    }),
  })

  const status = String(execution.status || '').trim() || 'Unknown'
  const signature = execution.signature || null
  const successful = /^success$/i.test(status)
  const submitted = /success|submitted|pending|processing/i.test(status)

  if (!successful && !submitted)
    throw new Error(readJupiterError(execution, `Jupiter execution failed (${status}).`))

  const explorerUrl = signature ? `https://solscan.io/tx/${signature}` : null
  if (!signature && !successful)
    throw new Error(`Jupiter did not return a transaction signature for ${input.outputSymbol}.`)

  return {
    status,
    signature,
    explorerUrl,
    requestId: order.requestId,
    inputMint: order.inputMint || null,
    outputMint: order.outputMint || null,
    inputAmountAtomic: order.inAmount || null,
    outputAmountAtomic: order.outAmount || null,
  }
}

export async function executeJupiterSpotSwap(input: ExecuteJupiterSpotSwapInput): Promise<ExecuteJupiterSpotSwapResult> {
  const inputAmountAtomic = String(toAtomicAmount(input.inputAmountUsd))
  if (BigInt(inputAmountAtomic) <= 0n)
    throw new Error(`Set at least a small ${appConfig.jupiterInputSymbol} amount before executing on Jupiter.`)

  return executeJupiterSwap({
    walletAddress: input.walletAddress,
    inputMint: appConfig.jupiterInputMint,
    outputMint: input.outputMint,
    outputSymbol: input.outputSymbol,
    inputAmountAtomic,
  })
}

export interface ExecuteJupiterSpotCloseInput {
  walletAddress: string
  inputMint: string
  inputSymbol: string
  inputAmountAtomic: string
}

export async function executeJupiterSpotClose(input: ExecuteJupiterSpotCloseInput): Promise<ExecuteJupiterSpotSwapResult> {
  return executeJupiterSwap({
    walletAddress: input.walletAddress,
    inputMint: input.inputMint,
    outputMint: appConfig.jupiterInputMint,
    outputSymbol: appConfig.jupiterInputSymbol,
    inputAmountAtomic: input.inputAmountAtomic,
  })
}

export function formatJupiterExecutionMessage(result: ExecuteJupiterSpotSwapResult) {
  const compactSignature = shortSignature(result.signature)
  if (/^success$/i.test(result.status))
    return compactSignature ? `Jupiter swap executed (${compactSignature}).` : 'Jupiter swap executed.'

  return compactSignature ? `Jupiter swap submitted (${compactSignature}).` : 'Jupiter swap submitted.'
}
