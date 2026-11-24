import { useEffect, useState, type MouseEvent } from 'react'
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

// Real seconds the speed-up holds, and how much faster than normal.
// Applied to every animation in the sleigh (flight + each reindeer's own
// gallop/bob + the sleigh's rock), not just the flight — speeding up the
// translation alone while the legs kept bobbing at their normal slow
// pace looked like it was sliding/gliding rather than running faster.
// 10x read as frantic vibrating on those once they were included, so this
// also came down to something closer to "running hard" than "glitching."
const BOOST_RATE = 4
const BOOST_HOLD_MS = 1200

export default function SantaSleigh() {
  const [enabled, setEnabled] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setEnabled(!query.matches)
  }, [])

  if (!enabled) return null

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    showToast('¡Feliz Navidad! 🎄')
    playSleighBells()
    // playbackRate scales how fast the animation's own current position
    // advances — unlike swapping animation-duration on a long-running
    // infinite animation (tried first; reverting it jumped to an
    // unrelated point in the new duration, since what's actually
    // preserved across a duration change is elapsed real time, not
    // visual progress, so the sleigh could reappear stuck mid-flight).
    // playbackRate has no such jump: it speeds up smoothly from wherever
    // the sleigh already is and, once reset, keeps going from wherever
    // THAT left it — never a discontinuity. { subtree: true } is what
    // reaches the reindeer/rig's own animations too, not just the
    // flight's — getAnimations() alone only returns animations declared
    // directly on this button.
    const anims = e.currentTarget.getAnimations?.({ subtree: true }) ?? []
    if (anims.length === 0) return
    for (const anim of anims) anim.playbackRate = BOOST_RATE
    window.setTimeout(() => {
      for (const anim of anims) anim.playbackRate = 1
    }, BOOST_HOLD_MS)
  }

  return (
    <button type="button" className="santa-sleigh" onClick={handleClick} aria-label="Sorpresa navideña">
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
