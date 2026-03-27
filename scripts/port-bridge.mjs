#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createReadStream, statSync } from 'node:fs'

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

const DIST_DIR = path.join(projectRoot, 'dist')
const AIR3_TARGET_HOST = '127.0.0.1'
const AIR3_TARGET_PORT = 4040
const TTS_TARGET_HOST = '127.0.0.1'
const TTS_TARGET_PORT = 4041
const LISTEN_HOST = process.env.AIRIFICA_BRIDGE_HOST || '127.0.0.1'
const LISTEN_PORT = Number(process.env.AIRIFICA_BRIDGE_PORT || 5173)

const TTS_PROXY_PATHS = new Set([
  '/api/tts',
  '/api/tts/captioned',
  '/api/tts/phonemes',
])

const AIR3_ALLOWED_ROUTES = [
  { method: 'POST', pattern: /^\/api\/auth\/challenge$/ },
  { method: 'POST', pattern: /^\/api\/auth\/verify$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/session$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/message$/ },
  { method: 'GET', pattern: /^\/api\/airi3\/history(?:\?|$)/ },
  { method: 'POST', pattern: /^\/api\/airi3\/proposal$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/proposals$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/proposals\/\d+\/approve$/ },
  { method: 'GET', pattern: /^\/api\/airi3\/health$/ },
  { method: 'GET', pattern: /^\/api\/airi3\/market-context(?:\?|$)/ },
  { method: 'GET', pattern: /^\/api\/airi3\/market-universe(?:\?|$)/ },
  { method: 'GET', pattern: /^\/api\/airi3\/pacifica\/status$/ },
  { method: 'GET', pattern: /^\/api\/airi3\/pacifica\/overview$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/pacifica\/prepare-agent$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/pacifica\/approve-builder$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/pacifica\/bind-agent$/ },
  { method: 'POST', pattern: /^\/api\/airi3\/pacifica\/positions\/close$/ },
]

const PRIVATE_NETWORK_ORIGIN_PATTERN = /^https?:\/\/(?:(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?|(?:10|192\.168)(?:\.\d{1,3}){2}(?::\d+)?|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}(?::\d+)?)$/i

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.vrm': 'application/octet-stream',
  '.vrma': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
}

function serveStatic(req, res) {
  const urlPath = new URL(req.url || '/', `http://localhost`).pathname
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.join(DIST_DIR, safePath)

  try {
    const stat = statSync(filePath)
    if (stat.isDirectory())
      filePath = path.join(filePath, 'index.html')
  }
  catch {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  if (!fs.existsSync(filePath))
    filePath = path.join(DIST_DIR, 'index.html')

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  try {
    const stat = statSync(filePath)
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': stat.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(filePath).pipe(res)
  }
  catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found')
  }
}

function resolveTarget(pathname = '/') {
  if (TTS_PROXY_PATHS.has(pathname))
    return { kind: 'proxy', host: TTS_TARGET_HOST, port: TTS_TARGET_PORT }

  if (pathname.startsWith('/api/'))
    return { kind: 'proxy', host: AIR3_TARGET_HOST, port: AIR3_TARGET_PORT }

  return { kind: 'static' }
}

function normalizeHeaders(headers, target) {
  const nextHeaders = { ...headers }
  const forwardedHost = String(headers.host || '').trim()
  let forwardedProto = String(headers['x-forwarded-proto'] || '').trim()
  if (!forwardedProto && headers.origin) {
    try {
      forwardedProto = new URL(String(headers.origin)).protocol.replace(/:$/, '')
    }
    catch {
    }
  }

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
    ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
    ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
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

function isAllowedApiRoute(method, pathname) {
  return AIR3_ALLOWED_ROUTES.some(route => route.method === method && route.pattern.test(pathname))
}

function isCorsAllowedOrigin(origin) {
  if (!origin)
    return false
  return PRIVATE_NETWORK_ORIGIN_PATTERN.test(origin)
}

function buildCorsHeaders(origin) {
  if (!isCorsAllowedOrigin(origin))
    return {}

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-request-id,x-session-identity',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${LISTEN_HOST}:${LISTEN_PORT}`)
  const target = resolveTarget(url.pathname)
  const corsHeaders = buildCorsHeaders(req.headers.origin)

  if (target.kind === 'static') {
    serveStatic(req, res)
    return
  }

  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    const requestedMethod = String(req.headers['access-control-request-method'] || 'GET').toUpperCase()
    if (TTS_PROXY_PATHS.has(url.pathname) || isAllowedApiRoute(requestedMethod, `${url.pathname}${url.search}`)) {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }
  }

  if (url.pathname.startsWith('/api/') && !TTS_PROXY_PATHS.has(url.pathname) && !isAllowedApiRoute(req.method || 'GET', `${url.pathname}${url.search}`))
    return sendJson(res, 404, { ok: false, error: 'Route not exposed by Airifica gateway' })

  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: normalizeHeaders(req.headers, target),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, {
        ...upstreamRes.headers,
        ...corsHeaders,
      })
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', () => {
    if (!res.headersSent)
      res.writeHead(502, {
        'content-type': 'text/plain; charset=utf-8',
        ...corsHeaders,
      })
    res.end('Airifica upstream unavailable')
  })

  req.pipe(upstream)
})

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

server.listen(LISTEN_PORT, LISTEN_HOST)
