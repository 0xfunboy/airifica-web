import { VersionedTransaction } from '@solana/web3.js'

import { appConfig } from '@/config/app'
import {
  base64ToBytes,
  bytesToBase64,
  getSolanaProvider,
  signMessageBase58,
} from '@/lib/solana'

type TriggerAuthType = 'message' | 'transaction'

interface JupiterTriggerChallengeResponse {
  type?: TriggerAuthType
  challenge?: string
  transaction?: string
  error?: string
  message?: string
}

interface JupiterTriggerVerifyResponse {
  token?: string
  error?: string
  message?: string
}

interface JupiterTriggerDepositResponse {
  requestId?: string
  transaction?: string
  error?: string
  message?: string
}

interface JupiterTriggerOrderResponse {
  id?: string
  txSignature?: string
  error?: string
  message?: string
}

interface JupiterTriggerCancelResponse {
  id?: string
  requestId?: string
  transaction?: string
  error?: string
  message?: string
}

interface JupiterTriggerCancelConfirmResponse {
  id?: string
  txSignature?: string
  error?: string
  message?: string
}

export interface ArmJupiterSpotTpSlInput {
  walletAddress: string
  outputMint: string
  acquiredAmountAtomic: string
  tpPriceUsd: number
  slPriceUsd: number
}

export interface ArmJupiterSpotTpSlResult {
  orderId: string | null
  txSignature: string | null
}

export interface CancelJupiterSpotTpSlInput {
  walletAddress: string
  orderId: string
}

export interface CancelJupiterSpotTpSlResult {
  orderId: string | null
  txSignature: string | null
}

const AUTH_TOKEN_TTL_MS = 23 * 60 * 60 * 1000
const authTokenCache = new Map<string, { token: string, expiresAt: number }>()

function buildTriggerApiUrl(pathname: string) {
  const normalizedBase = appConfig.jupiterTriggerApiBaseUrl.replace(/\/+$/, '')
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${normalizedBase}${normalizedPath}`
}

function readTriggerError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const message = typeof record.error === 'string'
      ? record.error
      : typeof record.message === 'string'
        ? record.message
        : ''
    if (message.trim())
      return message.trim()
  }

  return fallback
}

function isTriggerAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /\b401\b/.test(message) || /unauthorized|forbidden|jwt|token/i.test(message)
}

async function requestTriggerJson<T>(pathname: string, init: RequestInit) {
  const response = await fetch(buildTriggerApiUrl(pathname), init)
  const raw = await response.text()
  let payload: T | null = null

  if (raw) {
    try {
      payload = JSON.parse(raw) as T
    }
    catch {
      if (!response.ok)
        throw new Error(raw.trim() || `Jupiter Trigger request failed (${response.status}).`)
      throw new Error('Jupiter Trigger returned an invalid JSON response.')
    }
  }

  if (!response.ok)
    throw new Error(readTriggerError(payload, `Jupiter Trigger request failed (${response.status}).`))

  if (!payload)
    throw new Error('Jupiter Trigger returned an empty response.')

  return payload
}

function buildAuthorizedHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function requestMessageChallenge(walletAddress: string) {
  return requestTriggerJson<JupiterTriggerChallengeResponse>('auth/challenge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletPubkey: walletAddress,
      type: 'message',
    }),
  })
}

async function requestTransactionChallenge(walletAddress: string) {
  return requestTriggerJson<JupiterTriggerChallengeResponse>('auth/challenge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletPubkey: walletAddress,
      type: 'transaction',
    }),
  })
}

async function verifyMessageChallenge(walletAddress: string, signature: string) {
  return requestTriggerJson<JupiterTriggerVerifyResponse>('auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'message',
      walletPubkey: walletAddress,
      signature,
    }),
  })
}

async function verifyTransactionChallenge(walletAddress: string, signedTransaction: string) {
  return requestTriggerJson<JupiterTriggerVerifyResponse>('auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'transaction',
      walletPubkey: walletAddress,
      signedTransaction,
    }),
  })
}

async function ensureTriggerJwt(walletAddress: string) {
  const cached = authTokenCache.get(walletAddress)
  if (cached && cached.expiresAt > Date.now())
    return cached.token

  const provider = getSolanaProvider()
  if (!provider)
    throw new Error('No Solana wallet detected.')

  let token = ''

  if (provider.signMessage) {
    const challenge = await requestMessageChallenge(walletAddress)
    if (!challenge.challenge)
      throw new Error(readTriggerError(challenge, 'Jupiter Trigger did not return a signable auth challenge.'))

    const signature = await signMessageBase58(provider, challenge.challenge)
    const verification = await verifyMessageChallenge(walletAddress, signature)
    token = String(verification.token || '').trim()
  }
  else if (provider.signTransaction) {
    const challenge = await requestTransactionChallenge(walletAddress)
    if (!challenge.transaction)
      throw new Error(readTriggerError(challenge, 'Jupiter Trigger did not return a transaction auth challenge.'))

    const transaction = VersionedTransaction.deserialize(base64ToBytes(challenge.transaction))
    const signedTransaction = await provider.signTransaction(transaction) || transaction
    const verification = await verifyTransactionChallenge(
      walletAddress,
      bytesToBase64(signedTransaction.serialize()),
    )
    token = String(verification.token || '').trim()
  }
  else {
    throw new Error('The active Solana wallet does not support the signing flow required by Jupiter Trigger.')
  }

  if (!token)
    throw new Error('Jupiter Trigger did not return an auth token.')

  authTokenCache.set(walletAddress, {
    token,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
  })

  return token
}

export async function armJupiterSpotTpSl(input: ArmJupiterSpotTpSlInput): Promise<ArmJupiterSpotTpSlResult> {
  const provider = getSolanaProvider()
  if (!provider)
    throw new Error('No Solana wallet detected.')

  if (!provider.signTransaction)
    throw new Error('The active Solana wallet does not support transaction signing.')
  const signTransaction = provider.signTransaction

  const acquiredAmountAtomic = String(input.acquiredAmountAtomic || '').trim()

  if (!acquiredAmountAtomic || !/^\d+$/.test(acquiredAmountAtomic) || BigInt(acquiredAmountAtomic) <= 0n)
    throw new Error('Jupiter Trigger requires a valid filled token amount.')

  const submit = async () => {
    const token = await ensureTriggerJwt(input.walletAddress)
    const authorizedHeaders = buildAuthorizedHeaders(token)

    const deposit = await requestTriggerJson<JupiterTriggerDepositResponse>('deposit/craft', {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        inputMint: input.outputMint,
        outputMint: appConfig.jupiterInputMint,
        userAddress: input.walletAddress,
        amount: acquiredAmountAtomic,
      }),
    })

    if (!deposit.requestId || !deposit.transaction)
      throw new Error(readTriggerError(deposit, 'Jupiter Trigger did not return a deposit transaction.'))

    const depositTransaction = VersionedTransaction.deserialize(base64ToBytes(deposit.transaction))
    const signedDepositTransaction = await signTransaction(depositTransaction) || depositTransaction
    const depositSignedTx = bytesToBase64(signedDepositTransaction.serialize())

    const order = await requestTriggerJson<JupiterTriggerOrderResponse>('orders/price', {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        orderType: 'oco',
        depositRequestId: deposit.requestId,
        depositSignedTx,
        userPubkey: input.walletAddress,
        inputMint: input.outputMint,
        inputAmount: acquiredAmountAtomic,
        outputMint: appConfig.jupiterInputMint,
        triggerMint: input.outputMint,
        tpPriceUsd: input.tpPriceUsd,
        slPriceUsd: input.slPriceUsd,
        tpSlippageBps: appConfig.jupiterTriggerTpSlippageBps,
        slSlippageBps: appConfig.jupiterTriggerSlSlippageBps,
        expiresAt: Date.now() + appConfig.jupiterTriggerOrderTtlMs,
      }),
    })

    return {
      orderId: order.id || null,
      txSignature: order.txSignature || null,
    }
  }

  try {
    return await submit()
  }
  catch (error) {
    if (isTriggerAuthError(error)) {
      authTokenCache.delete(input.walletAddress)
      return submit()
    }

    throw error
  }
}

export async function cancelJupiterSpotTpSl(input: CancelJupiterSpotTpSlInput): Promise<CancelJupiterSpotTpSlResult> {
  const provider = getSolanaProvider()
  if (!provider)
    throw new Error('No Solana wallet detected.')

  if (!provider.signTransaction)
    throw new Error('The active Solana wallet does not support transaction signing.')

  const orderId = String(input.orderId || '').trim()
  if (!orderId)
    return { orderId: null, txSignature: null }

  const signTransaction = provider.signTransaction

  const submit = async () => {
    const token = await ensureTriggerJwt(input.walletAddress)
    const authorizedHeaders = buildAuthorizedHeaders(token)

    const cancellation = await requestTriggerJson<JupiterTriggerCancelResponse>(`orders/price/cancel/${orderId}`, {
      method: 'POST',
      headers: authorizedHeaders,
    })

    if (!cancellation.transaction || !cancellation.requestId)
      throw new Error(readTriggerError(cancellation, 'Jupiter Trigger did not return a cancellable withdrawal transaction.'))

    const transaction = VersionedTransaction.deserialize(base64ToBytes(cancellation.transaction))
    const signedTransaction = await signTransaction(transaction) || transaction

    const confirmation = await requestTriggerJson<JupiterTriggerCancelConfirmResponse>(`orders/price/confirm-cancel/${orderId}`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        signedTransaction: bytesToBase64(signedTransaction.serialize()),
        cancelRequestId: cancellation.requestId,
      }),
    })

    return {
      orderId: confirmation.id || cancellation.id || orderId,
      txSignature: confirmation.txSignature || null,
    }
  }

  try {
    return await submit()
  }
  catch (error) {
    if (isTriggerAuthError(error)) {
      authTokenCache.delete(input.walletAddress)
      return submit()
    }

    throw error
  }
}
