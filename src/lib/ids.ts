export function createId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}_${crypto.randomUUID()}`

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createGuestIdentity() {
  return createId('guest')
}
