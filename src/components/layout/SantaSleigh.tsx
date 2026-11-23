import { useEffect, useState } from 'react'
import { useToast } from '../../hooks/useToast'
import { playSleighBells } from '../../utils/sleighBells'

/** Santa's sleigh, flying across the storefront once per loop — a bigger,
 * rarer surprise than Snowfall's constant flakes, so it's a click target
 * with its own message (and a little chime) instead of being purely
 * ambient. One long CSS animation cycle does both the flight AND the long
 * wait between flights (see .santa-sleigh in index.css), no JS timers
 * needed. Skipped entirely for prefers-reduced-motion, same as Snowfall.
 *
 * Travel direction is rightward (see the santa-fly keyframes), so the
 * reindeer — who pull, and so lead — sit at the larger x values, with the
 * sleigh trailing behind them at smaller x. Every reindeer shape is reused
 * from a single local coordinate frame (body center at its own 0,0, facing
 * +x) via a per-instance translate, instead of three hand-placed copies.
 * Each one also gets its own small bob/gallop animation on an INNER group
 * — animating a child instead of the translated outer <g> itself, since a
 * CSS transform on that outer element would replace (not add to) its own
 * translate() positioning attribute. */
function Reindeer({ x, delay }: { x: number; delay: number }) {
  return (
    <g transform={`translate(${x},32)`}>
      <g className="santa-sleigh__reindeer" style={{ animationDelay: `${delay}s` }}>
        <g stroke="#5c3a1e" strokeWidth="3" strokeLinecap="round" fill="none">
          <line x1="7" y1="-3" x2="13" y2="-13" strokeWidth="5" />
          <line x1="12" y1="-18" x2="7" y2="-26" strokeWidth="1.5" />
          <line x1="16" y1="-19" x2="21" y2="-26" strokeWidth="1.5" />
          <line x1="5" y1="4" x2="8" y2="17" />
          <line x1="8" y1="3" x2="12" y2="15" />
          <line x1="-5" y1="4" x2="-8" y2="17" />
          <line x1="-2" y1="5" x2="-1" y2="18" />
          <line x1="-11" y1="-2" x2="-14" y2="-7" strokeWidth="2" />
        </g>
        <ellipse cx="0" cy="0" rx="11" ry="6" fill="#8b5a2b" />
        <circle cx="14" cy="-15" r="4" fill="#8b5a2b" />
        <circle cx="17.5" cy="-14" r="1.4" fill="#e8433a" />
      </g>
    </g>
  )
}

// How long a click's speed-up lasts — just over one full lap at the
// boosted duration below, so it zips through exactly one fast pass before
// settling back into its normal, much longer wait.
const BOOST_DURATION_S = 3
const BOOST_RESET_MS = (BOOST_DURATION_S + 0.2) * 1000

export default function SantaSleigh() {
  const [enabled, setEnabled] = useState(true)
  const [boosted, setBoosted] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setEnabled(!query.matches)
  }, [])

  if (!enabled) return null

  function handleClick() {
    showToast('¡Feliz Navidad! 🎄')
    playSleighBells()
    // Shortening animation-duration on an already-running animation keeps
    // its current progress but plays the rest back at the new speed —
    // mid-flight (the only time this button is actually reachable to
    // click), that reads as the sleigh suddenly rocketing off.
    setBoosted(true)
    window.setTimeout(() => setBoosted(false), BOOST_RESET_MS)
  }

  return (
    <button
      type="button"
      className="santa-sleigh"
      style={boosted ? { animationDuration: `${BOOST_DURATION_S}s` } : undefined}
      onClick={handleClick}
      aria-label="Sorpresa navideña"
    >
      <svg viewBox="0 0 280 70" width="150" height="38" fill="none">
        <line x1="98" y1="30" x2="116" y2="26" stroke="#5c3a1e" strokeWidth="1.5" strokeLinecap="round" />
        <Reindeer x={130} delay={0} />
        <Reindeer x={178} delay={0.15} />
        <Reindeer x={226} delay={0.3} />
        <g className="santa-sleigh__rig">
          {/* Sleigh body, drawn last so it occludes Santa's seated lower
              half below its top edge — reads as him sitting inside it. */}
          <circle cx="60" cy="16" r="7" fill="#e8b690" />
          <ellipse cx="60" cy="34" rx="15" ry="13" fill="#c23b3b" />
          <path d="M54,10 Q40,2 48,14 Z" fill="#c23b3b" />
          <circle cx="41" cy="4" r="2.5" fill="#ffffff" />
          <path
            d="M85,50 Q108,50 100,26"
            stroke="#c9962c"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="15" y="30" width="75" height="20" rx="10" fill="#c9962c" />
        </g>
      </svg>
    </button>
  )
}
