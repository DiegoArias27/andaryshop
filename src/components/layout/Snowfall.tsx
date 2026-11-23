import { useEffect, useState, type CSSProperties } from 'react'

interface Flake {
  id: number
  left: number
  size: number
  duration: number
  delay: number
  drift: number
  opacity: number
}

const FLAKE_COUNT = 12

function generateFlakes(): Flake[] {
  return Array.from({ length: FLAKE_COUNT }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 10 + Math.random() * 16,
    duration: 10 + Math.random() * 12,
    // Negative delay starts each flake already partway through its fall —
    // without this every flake would spawn bunched at the top together on
    // first load, then only look properly "scattered" a dozen seconds in.
    delay: -Math.random() * 20,
    drift: 20 + Math.random() * 50,
    opacity: 0.35 + Math.random() * 0.45,
  }))
}

/** A soft, decorative snowfall over the whole storefront — purely cosmetic
 * (pointer-events: none, below any real UI's z-index) and skipped entirely
 * for prefers-reduced-motion. */
export default function Snowfall() {
  const [flakes] = useState(generateFlakes)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setEnabled(!query.matches)
  }, [])

  if (!enabled) return null

  return (
    <div className="snowfall" aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="snowfall__flake"
          style={
            {
              left: `${f.left}%`,
              fontSize: `${f.size}px`,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--snowfall-drift': `${f.drift}px`,
            } as CSSProperties
          }
        >
          ❄
        </span>
      ))}
    </div>
  )
}
