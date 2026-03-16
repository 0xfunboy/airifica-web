export function formatCurrency(value: number | null | undefined) {
  const amount = Number(value)
  if (!Number.isFinite(amount))
    return '--'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount >= 100 ? 2 : 4,
  }).format(amount)
}

export function formatPercent(value: number | null | undefined) {
  const amount = Number(value)
  if (!Number.isFinite(amount))
    return '--'

  return `${amount >= 0 ? '+' : ''}${amount.toFixed(2)}%`
}

export function formatCompact(value: number | null | undefined) {
  const amount = Number(value)
  if (!Number.isFinite(amount))
    return '--'

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatClockTime(value: number) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function formatRelativeMinutes(value: number | null | undefined) {
  if (!value)
    return '--'

  const elapsedMs = Date.now() - value
  const minutes = Math.max(0, Math.round(elapsedMs / 60_000))
  if (minutes < 1)
    return 'just now'

  if (minutes === 1)
    return '1 min ago'

  return `${minutes} min ago`
}

export function formatBytes(value: number | null | undefined) {
  const amount = Number(value)
  if (!Number.isFinite(amount))
    return '--'

  if (amount < 1024)
    return `${amount} B`
  if (amount < 1024 ** 2)
    return `${(amount / 1024).toFixed(1)} KB`

  return `${(amount / 1024 ** 2).toFixed(2)} MB`
}

