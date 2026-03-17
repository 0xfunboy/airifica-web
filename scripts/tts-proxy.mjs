import { createServer } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath))
    return {}

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  const values = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0)
      continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    values[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }

  return values
}

const cwd = process.cwd()
const logDir = resolve(cwd, '.logs')
const logFile = resolve(logDir, 'tts-proxy.log')
const envLocal = loadDotEnvFile(resolve(cwd, '.env.local'))
const envExample = loadDotEnvFile(resolve(cwd, '.env.example'))
const env = { ...envExample, ...envLocal, ...process.env }

const proxyPort = Number(env.AIRIFICA_TTS_PROXY_PORT || 4041)
const targetBaseUrl = String(env.AIRIFICA_TTS_PROXY_TARGET_URL || env.VITE_AIR3_TTS_BASE_URL || '').trim().replace(/\/+$/, '')

if (!targetBaseUrl) {
  console.error('[airifica][tts-proxy] missing AIRIFICA_TTS_PROXY_TARGET_URL or VITE_AIR3_TTS_BASE_URL')
  process.exit(1)
}

mkdirSync(logDir, { recursive: true })

function writeLog(entry) {
  const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`
  process.stdout.write(line)
  appendFileSync(logFile, line)
}

function corsHeaders(origin = '*', requestHeaders = '') {
  const allowHeaders = requestHeaders
    || 'Content-Type, Authorization, X-Airifica-TTS-Request-Id, X-Airifica-TTS-Source, X-Airifica-TTS-Text-Chars'

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': allowHeaders,
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'Content-Type, Content-Length',
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  const requestId = String(req.headers['x-airifica-tts-request-id'] || randomUUID())
  const startedAt = Date.now()
  const requestedHeaders = Array.isArray(req.headers['access-control-request-headers'])
    ? req.headers['access-control-request-headers'].join(', ')
    : String(req.headers['access-control-request-headers'] || '')
  const headers = corsHeaders(origin, requestedHeaders)

  if (req.method === 'OPTIONS') {
    writeLog({
      type: 'request:preflight',
      requestId,
      method: 'OPTIONS',
      path: req.url || '/',
      origin,
      requestedHeaders,
    })
    res.writeHead(204, headers)
    res.end()
    return
  }

  try {
    const sourceUrl = new URL(req.url || '/', `http://127.0.0.1:${proxyPort}`)
    const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, `${targetBaseUrl}/`)

    const requestHeaders = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || key.toLowerCase() === 'host' || key.toLowerCase() === 'content-length')
        continue

      if (Array.isArray(value))
        value.forEach(item => requestHeaders.append(key, item))
      else
        requestHeaders.set(key, value)
    }

    const bodyChunks = []
    if (!['GET', 'HEAD'].includes((req.method || 'GET').toUpperCase())) {
      for await (const chunk of req)
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    writeLog({
      type: 'request:start',
      requestId,
      method: req.method || 'GET',
      path: sourceUrl.pathname,
      targetUrl: targetUrl.toString(),
      bodyBytes: bodyChunks.reduce((total, chunk) => total + chunk.length, 0),
      textChars: Number(req.headers['x-airifica-tts-text-chars'] || 0) || null,
      source: req.headers['x-airifica-tts-source'] || null,
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort('tts-proxy-timeout'), 120_000)

    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: requestHeaders,
      body: bodyChunks.length ? Buffer.concat(bodyChunks) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const responseHeaders = { ...headers, 'x-airifica-tts-request-id': requestId }
    response.headers.forEach((value, key) => {
      const normalizedKey = key.toLowerCase()
      if (normalizedKey === 'transfer-encoding' || normalizedKey.startsWith('access-control-') || normalizedKey === 'x-airifica-tts-request-id')
        return
      responseHeaders[key] = value
    })

    const payload = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, responseHeaders)
    res.end(payload)

    writeLog({
      type: 'request:end',
      requestId,
      status: response.status,
      durationMs: Date.now() - startedAt,
      responseBytes: payload.length,
      contentType: response.headers.get('content-type') || null,
    })
  }
  catch (error) {
    res.writeHead(502, {
      ...headers,
      'content-type': 'application/json',
    })
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'TTS proxy request failed.',
    }))

    writeLog({
      type: 'request:error',
      requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'TTS proxy request failed.',
    })
  }
})

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`[airifica][tts-proxy] listening on http://127.0.0.1:${proxyPort} -> ${targetBaseUrl}`)
})
