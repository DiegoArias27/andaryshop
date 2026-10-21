import { useEffect, useRef, useState, type MouseEvent } from 'react'

interface ZoomImageProps {
  src: string
  alt: string
}

const LENS_SIZE = 120
const ZOOM_FACTOR = 2.5
// Keeps the magnified panel from ever rendering under the sticky header.
const RESULT_MIN_TOP = 90

export default function ZoomImage({ src, alt }: ZoomImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [lensPos, setLensPos] = useState({ left: 0, top: 0 })
  const [resultPos, setResultPos] = useState({ left: 0, top: 0 })
  const [bgPosition, setBgPosition] = useState('0% 0%')
  const [bgSize, setBgSize] = useState('250% 250%')

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // A scroll (or the page loading under an already-hovered cursor) can
    // leave this inactive with no fresh "enter" event to turn it back on —
    // mousemove keeps firing regardless, so use it to (re)activate too.
    setActive(true)

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const lensX = Math.max(0, Math.min(x - LENS_SIZE / 2, rect.width - LENS_SIZE))
    const lensY = Math.max(0, Math.min(y - LENS_SIZE / 2, rect.height - LENS_SIZE))
    setLensPos({ left: lensX, top: lensY })

    // Fixed positioning (computed from the viewport rect) so the magnified
    // panel escapes the image container's rounded-corner overflow:hidden.
    // Clamped so it never renders up under the sticky header.
    setResultPos({ left: rect.right + 16, top: Math.max(rect.top, RESULT_MIN_TOP) })

    // Sized in px from the container's own aspect ratio (matching the
    // object-fit: cover image) rather than a fixed "250% 250%", which would
    // stretch non-square product photos to fit the square result panel.
    setBgSize(`${rect.width * ZOOM_FACTOR}px ${rect.height * ZOOM_FACTOR}px`)

    const percentX = (x / rect.width) * 100
    const percentY = (y / rect.height) * 100
    setBgPosition(`${percentX}% ${percentY}%`)
  }

  // The result panel is `position: fixed` from a rect snapshot taken on the
  // last mousemove. Scrolling without moving the cursor doesn't fire a new
  // mousemove, so that snapshot goes stale and the panel is left floating in
  // the wrong spot — closing it on scroll keeps it from getting stuck there.
  useEffect(() => {
    if (!active) return
    function handleScroll() {
      setActive(false)
    }
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', handleScroll, { capture: true })
  }, [active])

  return (
    <div
      ref={containerRef}
      className="zoom-image"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onMouseMove={handleMouseMove}
    >
      <img src={src} alt={alt} />
      {active && (
        <>
          <div className="zoom-image__lens" style={{ left: lensPos.left, top: lensPos.top }} />
          <div
            className="zoom-image__result"
            style={{
              left: resultPos.left,
              top: resultPos.top,
              backgroundImage: `url(${src})`,
              backgroundPosition: bgPosition,
              backgroundSize: bgSize,
            }}
          />
        </>
      )}
    </div>
  )
}
