import type { Air3ClientConfig } from './types'

export class Air3HttpError<TPayload = unknown> extends Error {
  status: number
  requestId: string
  payload: TPayload

  constructor(message: string, options: { status: number, requestId: string, payload: TPayload }) {
    super(message)
    this.name = 'Air3HttpError'
    this.status = options.status
    this.requestId = options.requestId
    this.payload = options.payload
  }
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `air3_${crypto.randomUUID()}`

  return `air3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text()
  if (!raw)
    return {} as T

  try {
    return JSON.parse(raw) as T
  }
  catch {
    return {
      error: raw.length > 600 ? `${raw.slice(0, 600)}…` : raw,
      raw,
      contentType: response.headers.get('content-type') || '',
    } as T
  }
}

export async function requestJson<T>(
  config: Air3ClientConfig,
  url: string,
  init?: RequestInit,
  overrideTimeoutMs?: number,
): Promise<T> {
  const requestId = createRequestId()
  const controller = new AbortController()
  const timeoutMs = overrideTimeoutMs ?? config.timeoutMs ?? 20_000
  let timedOut = false

  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...config.headers,
        ...init?.headers,
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        'X-Request-Id': requestId,
      },
    })

    const data = await readJson<any>(response)
    if (!response.ok) {
      const message = data?.error || data?.message || `${response.status} ${response.statusText}`
      throw new Air3HttpError(`${message} [request:${requestId}]`, {
        status: response.status,
        requestId,
        payload: data,
      })
    }

    return data as T
  }
  catch (error) {
    if (error instanceof Air3HttpError)
      throw error

    if (error instanceof Error && error.message.includes(`[request:${requestId}]`))
      throw error

    if (timedOut)
      throw new Error(`Request timed out after ${timeoutMs}ms [request:${requestId}]`)

    throw error instanceof Error
      ? new Error(`${error.message} [request:${requestId}]`)
      : new Error(`Network error [request:${requestId}]`)
  }
  finally {
    globalThis.clearTimeout(timeout)
  }
}
