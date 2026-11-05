import { useEffect, useRef, useState } from 'react'

/** Flashes 'up' or 'down' for a moment whenever `value` changes, then clears
 * back to null — drives a brief colored pulse (see .qty-pulse--up/--down in
 * index.css) so a quantity or total that just changed visibly says which
 * way it moved, instead of the number just silently becoming a different
 * number. */
export function usePulseDirection(value: number): 'up' | 'down' | null {
  const prevRef = useRef(value)
  const [pulse, setPulse] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = value
    if (value === prev) return
    setPulse(value > prev ? 'up' : 'down')
    const timer = setTimeout(() => setPulse(null), 500)
    return () => clearTimeout(timer)
  }, [value])

  return pulse
}
