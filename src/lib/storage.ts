export function readStorage<T>(scope: Storage | null | undefined, key: string, fallback: T) {
  if (!scope)
    return fallback

  try {
    const raw = scope.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  }
  catch {
    return fallback
  }
}

export function writeStorage(scope: Storage | null | undefined, key: string, value: unknown) {
  if (!scope)
    return

  try {
    scope.setItem(key, JSON.stringify(value))
  }
  catch {
  }
}

export function removeStorage(scope: Storage | null | undefined, key: string) {
  if (!scope)
    return

  try {
    scope.removeItem(key)
  }
  catch {
  }
}
