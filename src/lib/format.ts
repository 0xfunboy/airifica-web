export function truncateMiddle(value: string, size = 36) {
  if (!value || value.length <= size)
    return value

  const visible = Math.max(8, Math.floor((size - 1) / 2))
  return `${value.slice(0, visible)}…${value.slice(-visible)}`
}

export function describeUrl(value: string | null | undefined, fallback = '--') {
  const input = String(value || '').trim()
  if (!input)
    return fallback

  try {
    const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const suffix = url.pathname === '/' ? '' : url.pathname
    return `${url.host}${suffix}`
  }
  catch {
    return input
  }
}
