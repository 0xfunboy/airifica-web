import { appConfig } from '@/config/app'

import { buildSherpaOfflinePayload, decodeMono16BitWav } from './wav'

const SHERPA_CHUNK_BYTES = 10240

type PendingSocket = {
  promise: Promise<WebSocket>
  resolve: (socket: WebSocket) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function createAbortError(message = 'The speech transcription request was aborted.') {
  return new DOMException(message, 'AbortError')
}

function isRelativeUrl(value: string) {
  return value.startsWith('/') || value.startsWith('./') || value.startsWith('../')
}

function resolveWebSocketUrl(raw: string) {
  const value = raw.trim()
  if (!value || typeof window === 'undefined')
    return ''

  try {
    if (/^wss?:\/\//i.test(value))
      return value

    const url = new URL(value, window.location.href)
    if (url.protocol === 'https:')
      url.protocol = 'wss:'
    else if (url.protocol === 'http:')
      url.protocol = 'ws:'

    if (isRelativeUrl(value))
      return `${url.origin}${url.pathname}${url.search}`

    return url.toString()
  }
  catch {
    return ''
  }
}

function normalizeTranscript(raw: string) {
  const value = raw.trim()
  if (!value || value === '<EMPTY>')
    return ''
  return value
}

class SherpaOfflineSocketClient {
  private socket: WebSocket | null = null
  private pendingSocket: PendingSocket | null = null
  private requestQueue: Promise<unknown> = Promise.resolve()

  get configured() {
    return Boolean(resolveWebSocketUrl(appConfig.sttWebSocketUrl))
  }

  get endpoint() {
    return resolveWebSocketUrl(appConfig.sttWebSocketUrl)
  }

  async transcribeRecording(recording: Blob, options?: { signal?: AbortSignal }) {
    if (!this.configured)
      throw new Error('Server STT is not configured.')

    const { sampleRate, samples } = await decodeMono16BitWav(recording)
    const signal = options?.signal

    const queued = this.requestQueue.then(async () => this.transcribeSamples(samples, sampleRate, signal))
    this.requestQueue = queued.catch(() => undefined)
    return queued
  }

  async disconnect() {
    this.pendingSocket?.timeout && clearTimeout(this.pendingSocket.timeout)
    this.pendingSocket = null

    if (!this.socket)
      return

    const socket = this.socket
    this.socket = null

    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send('Done')
      }
      catch {
      }
    }

    try {
      socket.close(1000, 'session-ended')
    }
    catch {
    }
  }

  private async transcribeSamples(samples: Float32Array, sampleRate: number, signal?: AbortSignal) {
    if (signal?.aborted)
      throw createAbortError()

    if (!samples.length)
      return ''

    const socket = await this.ensureSocket(signal)
    const payload = buildSherpaOfflinePayload(samples, sampleRate)

    for (let offset = 0; offset < payload.byteLength; offset += SHERPA_CHUNK_BYTES) {
      if (signal?.aborted)
        throw createAbortError()

      socket.send(payload.slice(offset, offset + SHERPA_CHUNK_BYTES))
    }

    const response = await this.waitForResponse(socket, signal)
    return normalizeTranscript(response)
  }

  private async ensureSocket(signal?: AbortSignal) {
    if (signal?.aborted)
      throw createAbortError()

    if (this.socket?.readyState === WebSocket.OPEN)
      return this.socket

    if (this.pendingSocket)
      return this.pendingSocket.promise

    const endpoint = this.endpoint
    if (!endpoint)
      throw new Error('Server STT endpoint is empty.')

    const deferred = createDeferred<WebSocket>()
    const socket = new WebSocket(endpoint)
    socket.binaryType = 'arraybuffer'

    const timeout = setTimeout(() => {
      this.pendingSocket = null
      try {
        socket.close()
      }
      catch {
      }
      deferred.reject(new Error('Unable to connect to the STT server.'))
    }, appConfig.sttConnectTimeoutMs)

    const clearPending = () => {
      clearTimeout(timeout)
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
      signal?.removeEventListener('abort', handleAbort)
    }

    const handleOpen = () => {
      clearPending()
      this.pendingSocket = null
      this.socket = socket
      deferred.resolve(socket)
    }

    const handleError = () => {
      clearPending()
      this.pendingSocket = null
      if (this.socket === socket)
        this.socket = null
      deferred.reject(new Error('Unable to connect to the STT server.'))
    }

    const handleAbort = () => {
      clearPending()
      this.pendingSocket = null
      try {
        socket.close()
      }
      catch {
      }
      deferred.reject(createAbortError())
    }

    socket.addEventListener('open', handleOpen, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    socket.addEventListener('close', () => {
      if (this.socket === socket)
        this.socket = null
    }, { once: true })
    signal?.addEventListener('abort', handleAbort, { once: true })

    this.pendingSocket = {
      promise: deferred.promise,
      resolve: deferred.resolve,
      reject: deferred.reject,
      timeout,
    }

    return deferred.promise
  }

  private waitForResponse(socket: WebSocket, signal?: AbortSignal) {
    const deferred = createDeferred<string>()
    let timeout: ReturnType<typeof setTimeout> | undefined

    const clearPending = () => {
      if (timeout)
        clearTimeout(timeout)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('error', handleError)
      socket.removeEventListener('close', handleClose)
      signal?.removeEventListener('abort', handleAbort)
    }

    const fail = (error: Error) => {
      clearPending()
      if (this.socket === socket)
        this.socket = null
      try {
        socket.close()
      }
      catch {
      }
      deferred.reject(error)
    }

    const handleMessage = (event: MessageEvent) => {
      clearPending()
      deferred.resolve(typeof event.data === 'string' ? event.data : '')
    }

    const handleError = () => {
      fail(new Error('The STT server connection failed while waiting for a transcript.'))
    }

    const handleClose = () => {
      fail(new Error('The STT server closed the connection before returning a transcript.'))
    }

    const handleAbort = () => {
      fail(createAbortError())
    }

    timeout = setTimeout(() => {
      fail(new Error('The STT server did not return a transcript in time.'))
    }, appConfig.sttResponseTimeoutMs)

    socket.addEventListener('message', handleMessage, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    socket.addEventListener('close', handleClose, { once: true })
    signal?.addEventListener('abort', handleAbort, { once: true })

    return deferred.promise
  }
}

const sherpaClient = new SherpaOfflineSocketClient()

export function useServerStt() {
  return {
    configured: sherpaClient.configured,
    endpoint: sherpaClient.endpoint,
    transcribeRecording(recording: Blob, options?: { signal?: AbortSignal }) {
      return sherpaClient.transcribeRecording(recording, options)
    },
    disconnect() {
      return sherpaClient.disconnect()
    },
  }
}

export { isAbortError }
