import { useEffect, useState } from 'react'

/** Same shape as useLocalStorage, but backed by sessionStorage — the value
 * disappears when the tab/browser closes instead of persisting indefinitely
 * on the device. Used for guest-side state that should only last "this
 * visit" (see Cotizador's saved quotes). */
export function useSessionStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.sessionStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // sessionStorage may be unavailable (private browsing, quota exceeded) — fail silently
    }
  }, [key, value])

  return [value, setValue] as const
}
