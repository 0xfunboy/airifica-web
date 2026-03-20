#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath))
    return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0)
      continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    if (!(key in process.env))
      process.env[key] = value
  }
}

loadEnvFile(path.join(projectRoot, '.env.local'))
loadEnvFile(path.join(projectRoot, '.env'))

const APP_TARGET_HOST = '127.0.0.1'
const APP_TARGET_PORT = 4173
const AIR3_TARGET_HOST = '127.0.0.1'
const AIR3_TARGET_PORT = 4040
const TTS_TARGET_HOST = '127.0.0.1'
const TTS_TARGET_PORT = 4041
const LISTEN_HOST = '127.0.0.1'
const LISTEN_PORT = 5173

const PACIFICA_BASE_URL = (process.env.PACIFICA_API_BASE || 'https://api.pacifica.fi').replace(/\/+$/, '')
const AIRI3_DATA_DIR = (process.env.AIRI3_DATA_DIR || '/home/funboy/air3-stack/eliza-air3/agent/data/airi3').trim()
const AIRI3_STATE_FILE = path.join(path.resolve(AIRI3_DATA_DIR), 'airi3-state.json')

function resolveTarget(pathname = '/') {
  if (pathname === '/api/airi3/pacifica/approve-builder')
    return { kind: 'approve-builder' }

  if (pathname.startsWith('/api/tts') || pathname.startsWith('/v1/audio/speech'))
    return { kind: 'proxy', host: TTS_TARGET_HOST, port: TTS_TARGET_PORT }

  if (pathname.startsWith('/api/'))
    return { kind: 'proxy', host: AIR3_TARGET_HOST, port: AIR3_TARGET_PORT }

  return { kind: 'proxy', host: APP_TARGET_HOST, port: APP_TARGET_PORT }
}

function normalizeHeaders(headers, target) {
  const nextHeaders = { ...headers }
  delete nextHeaders.host
  delete nextHeaders.connection
  delete nextHeaders.origin
  delete nextHeaders.referer
  delete nextHeaders['access-control-request-headers']
  delete nextHeaders['access-control-request-method']

  return {
    ...nextHeaders,
    host: `${target.host}:${target.port}`,
    connection: 'close',
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 1024 * 1024)
        reject(new Error('Request body too large'))
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function parseJsonBody(raw) {
  if (!raw)
    return {}
  return JSON.parse(raw)
}

async function ensureAuthorized(headers) {
  const response = await fetch(`http://${AIR3_TARGET_HOST}:${AIR3_TARGET_PORT}/api/airi3/pacifica/status`, {
    method: 'GET',
    headers: {
      ...(headers.authorization ? { authorization: headers.authorization } : {}),
      ...(headers['x-wallet-address'] ? { 'x-wallet-address': headers['x-wallet-address'] } : {}),
      ...(headers['x-session-identity'] ? { 'x-session-identity': headers['x-session-identity'] } : {}),
      ...(headers['x-airi3-client'] ? { 'x-airi3-client': headers['x-airi3-client'] } : {}),
    },
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Authorization check failed (${response.status})`)
  }
}

function updateBindingState(walletAddress, patch) {
  fs.mkdirSync(path.dirname(AIRI3_STATE_FILE), { recursive: true })
  const raw = fs.existsSync(AIRI3_STATE_FILE) ? fs.readFileSync(AIRI3_STATE_FILE, 'utf8') : ''
  const parsed = raw ? JSON.parse(raw) : { nextProposalId: 1, pacificaBindings: {}, proposals: {} }
  const existing = parsed?.pacificaBindings?.[walletAddress]
  if (!existing)
    throw new Error('No prepared Pacifica binding found for this wallet.')

  parsed.pacificaBindings[walletAddress] = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  }

  const tempPath = `${AIRI3_STATE_FILE}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2))
  fs.renameSync(tempPath, AIRI3_STATE_FILE)
  return parsed.pacificaBindings[walletAddress]
}

async function handleApproveBuilder(req, res) {
  if (req.method !== 'POST')
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' })

  try {
    await ensureAuthorized(req.headers)

    const rawBody = await readRequestBody(req)
    const payload = parseJsonBody(rawBody)
    const signedPayload = payload?.signedPayload || {}

    const account = String(signedPayload.account || req.headers['x-wallet-address'] || '').trim()
    const builderCode = String(signedPayload.builder_code || signedPayload.builder || '').trim()
    const maxFeeRate = String(signedPayload.max_fee_rate || '').trim()
    const signature = String(signedPayload.signature || '').trim()
    const timestamp = Number(signedPayload.timestamp)
    const expiryWindow = Number(signedPayload.expiry_window)

    if (!account || !builderCode || !maxFeeRate || !signature || !Number.isFinite(timestamp) || !Number.isFinite(expiryWindow)) {
      return sendJson(res, 400, { ok: false, error: 'Incomplete builder approval payload.' })
    }

    const upstreamResponse = await fetch(`${PACIFICA_BASE_URL}/api/v1/account/builder_codes/approve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        account,
        agent_wallet: null,
        signature,
        timestamp,
        expiry_window: expiryWindow,
        builder_code: builderCode,
        max_fee_rate: maxFeeRate,
      }),
    })

    const responseText = await upstreamResponse.text()
    if (!upstreamResponse.ok) {
      return sendJson(res, 502, {
        ok: false,
        error: `Pacifica approve builder failed (${upstreamResponse.status}): ${responseText}`,
      })
    }

    let pacificaResponse
    try {
      pacificaResponse = responseText ? JSON.parse(responseText) : {}
    }
    catch {
      pacificaResponse = { raw: responseText }
    }

    updateBindingState(account, {
      builderApprovedAt: Date.now(),
    })

    return sendJson(res, 200, {
      ok: true,
      pacificaResponse,
    })
  }
  catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Builder approval bridge failed.',
    })
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${LISTEN_HOST}:${LISTEN_PORT}`)
  const target = resolveTarget(url.pathname)

  if (target.kind === 'approve-builder') {
    void handleApproveBuilder(req, res)
    return
  }

  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: normalizeHeaders(req.headers, target),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', () => {
    if (!res.headersSent)
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Airifica upstream unavailable')
  })

  req.pipe(upstream)
})

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

server.listen(LISTEN_PORT, LISTEN_HOST)
