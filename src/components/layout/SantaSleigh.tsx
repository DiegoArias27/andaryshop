import { useEffect, useState } from 'react'
import { useToast } from '../../hooks/useToast'

/** Santa's sleigh, flying across the storefront once per loop — a bigger,
 * rarer surprise than Snowfall's constant flakes, so it's a click target
 * with its own message instead of being purely ambient. One long CSS
 * animation cycle does both the flight AND the long wait between flights
 * (see .santa-sleigh in index.css), no JS timers needed. Skipped entirely
 * for prefers-reduced-motion, same as Snowfall.
 *
 * Travel direction is rightward (see the santa-fly keyframes), so the
 * reindeer — who pull, and so lead — sit at the larger x values, with the
 * sleigh trailing behind them at smaller x. Every shape is reused from a
 * single reindeer local coordinate frame (body center at its own 0,0,
 * facing +x) via a per-instance translate, instead of three hand-placed
 * copies. */
function Reindeer({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},32)`}>
      <g stroke="var(--santa-color)" strokeWidth="3" strokeLinecap="round" fill="none">
        <line x1="7" y1="-3" x2="13" y2="-13" strokeWidth="5" />
        <line x1="12" y1="-18" x2="7" y2="-26" strokeWidth="1.5" />
        <line x1="16" y1="-19" x2="21" y2="-26" strokeWidth="1.5" />
        <line x1="5" y1="4" x2="8" y2="17" />
        <line x1="8" y1="3" x2="12" y2="15" />
        <line x1="-5" y1="4" x2="-8" y2="17" />
        <line x1="-2" y1="5" x2="-1" y2="18" />
        <line x1="-11" y1="-2" x2="-14" y2="-7" strokeWidth="2" />
      </g>
      <ellipse cx="0" cy="0" rx="11" ry="6" fill="var(--santa-color)" />
      <circle cx="14" cy="-15" r="4" fill="var(--santa-color)" />
    </g>
  )
}

export default function SantaSleigh() {
  const [enabled, setEnabled] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setEnabled(!query.matches)
  }, [])

  if (!enabled) return null

  return (
    <button
      type="button"
      className="santa-sleigh"
      onClick={() => showToast('¡Feliz Navidad! 🎄')}
      aria-label="Sorpresa navideña"
    >
      <svg viewBox="0 0 280 70" width="140" height="35" fill="none">
        {/* Harness — sleigh front to the nearest (trailing) reindeer. */}
        <line x1="98" y1="30" x2="116" y2="26" stroke="var(--santa-color)" strokeWidth="1.5" strokeLinecap="round" />
        <Reindeer x={130} />
        <Reindeer x={178} />
        <Reindeer x={226} />
        <g fill="var(--santa-color)">
          {/* Sleigh body, drawn last so it occludes Santa's seated lower
              half below its top edge — reads as him sitting inside it. */}
          <circle cx="60" cy="16" r="7" />
          <ellipse cx="60" cy="34" rx="15" ry="13" />
          <path d="M54,10 Q40,2 48,14 Z" />
          <circle cx="41" cy="4" r="2.5" />
          <path
            d="M85,50 Q108,50 100,26"
            stroke="var(--santa-color)"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="15" y="30" width="75" height="20" rx="10" />
        </g>
      </svg>
    </button>
  )
}
