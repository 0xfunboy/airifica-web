export interface SolanaProviderPublicKey {
  toBase58?: () => string
  toString?: () => string
}

export interface SolanaProviderConnectResponse {
  publicKey?: SolanaProviderPublicKey
}

export interface SolanaProvider {
  publicKey?: SolanaProviderPublicKey
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<SolanaProviderConnectResponse>
  disconnect?: () => Promise<void>
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array } | Uint8Array>
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function getSolanaProvider() {
  if (typeof window === 'undefined')
    return null

  const scopedWindow = window as typeof window & {
    phantom?: { solana?: SolanaProvider }
    backpack?: { solana?: SolanaProvider }
    solana?: SolanaProvider
  }

  return scopedWindow.phantom?.solana
    || scopedWindow.backpack?.solana
    || scopedWindow.solana
    || null
}

export function readProviderAddress(provider: SolanaProvider, response?: SolanaProviderConnectResponse) {
  const publicKey = response?.publicKey || provider.publicKey
  return publicKey?.toBase58?.() || publicKey?.toString?.() || null
}

function bytesToBinary(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return binary
}

export function bytesToBase64(bytes: Uint8Array) {
  return btoa(bytesToBinary(bytes))
}

export function bytesToBase58(bytes: Uint8Array) {
  if (!bytes.length)
    return ''

  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry
      digits[index] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  let leadingZeroes = 0
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0)
    leadingZeroes += 1

  let encoded = ''.padStart(leadingZeroes, BASE58_ALPHABET[0])
  for (let index = digits.length - 1; index >= 0; index -= 1)
    encoded += BASE58_ALPHABET[digits[index]]

  return encoded
}

function sortNestedValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortNestedValue)

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortNestedValue((value as Record<string, unknown>)[key])
        return accumulator
      }, {})
  }

  return value
}

export async function signSolanaMessage(provider: SolanaProvider, message: string | Uint8Array) {
  if (!provider.signMessage)
    throw new Error('The active Solana wallet does not support message signing.')

  const encodedMessage = typeof message === 'string' ? new TextEncoder().encode(message) : message
  const signed = await provider.signMessage(encodedMessage)
  const signature = signed instanceof Uint8Array ? signed : signed.signature
  if (!signature)
    throw new Error('Wallet signature not available.')

  return signature
}

export async function signMessageBase64(provider: SolanaProvider, message: string | Uint8Array) {
  return bytesToBase64(await signSolanaMessage(provider, message))
}

export async function signMessageBase58(provider: SolanaProvider, message: string | Uint8Array) {
  return bytesToBase58(await signSolanaMessage(provider, message))
}

export function normalizeSignedPayload(payload: {
  timestamp: number
  expiry_window: number
  type: string
  data: Record<string, unknown>
}) {
  return JSON.stringify(sortNestedValue({
    timestamp: payload.timestamp,
    expiry_window: payload.expiry_window,
    type: payload.type,
    data: payload.data,
  }))
}
