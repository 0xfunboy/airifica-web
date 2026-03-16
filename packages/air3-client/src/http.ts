import type { Air3ClientConfig } from './types'

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `air3_${crypto.randomUUID()}`

  return `air3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text()
  return raw ? JSON.parse(raw) as T : {} as T
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
      throw new Error(`${message} [request:${requestId}]`)
    }

    return data as T
  }
  catch (error) {
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

