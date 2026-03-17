import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
const envLocal = loadDotEnvFile(resolve(cwd, '.env.local'))
const envExample = loadDotEnvFile(resolve(cwd, '.env.example'))
const env = { ...envExample, ...envLocal, ...process.env }

const proxyPort = Number(env.AIRIFICA_TTS_PROXY_PORT || 4041)
const targetBaseUrl = String(env.VITE_AIR3_TTS_BASE_URL || '').trim().replace(/\/+$/, '')

if (!targetBaseUrl) {
  console.error('[airifica][tts-proxy] missing VITE_AIR3_TTS_BASE_URL')
  process.exit(1)
}

function corsHeaders(origin = '*') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-credentials': 'true',
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
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

    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: requestHeaders,
      body: bodyChunks.length ? Buffer.concat(bodyChunks) : undefined,
    })

    const responseHeaders = { ...headers }
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding')
        return
      responseHeaders[key] = value
    })

    const payload = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, responseHeaders)
    res.end(payload)
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
  }
})

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`[airifica][tts-proxy] listening on http://127.0.0.1:${proxyPort} -> ${targetBaseUrl}`)
})
