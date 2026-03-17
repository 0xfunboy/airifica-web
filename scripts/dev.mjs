import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const cwd = process.cwd()
const nodeBin = process.execPath
const viteBin = resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js')
const proxyScript = resolve(cwd, 'scripts', 'tts-proxy.mjs')

const children = [
  spawn(nodeBin, [proxyScript], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  }),
  spawn(nodeBin, [viteBin, '--host'], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  }),
]

function shutdown(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed)
      child.kill(signal)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal)
    process.exit(0)
  })
}

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown()
      process.exit(code)
    }
  })
}
