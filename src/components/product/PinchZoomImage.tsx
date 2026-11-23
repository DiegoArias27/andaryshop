import { useEffect, useRef } from 'react'

interface PinchZoomImageProps {
  src: string
  alt: string
}

const MAX_SCALE = 3
const MIN_SCALE = 1

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/** Pinch-to-zoom + drag-to-pan on a single product photo, scoped to that
 * image instead of the whole page — without this, pinching over the photo
 * triggers the browser's own page zoom (header, buttons, everything),
 * which reads as broken rather than "look closer at the shirt."
 *
 * React attaches touchstart/touchmove listeners as passive for scroll
 * performance, so calling preventDefault() from a JSX onTouchMove prop is
 * silently ignored — the native listener added by hand below, with
 * { passive: false }, is what actually lets this suppress the page zoom.
 * It only does that for an actual 2-finger pinch, or a 1-finger drag while
 * already zoomed in; a plain 1-finger swipe at the default 1x scale is
 * left completely alone, so MobileCarousel's native scroll-snap swiping
 * between photos keeps working exactly as before. */
export default function PinchZoomImage({ src, alt }: PinchZoomImageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const state = useRef({
    scale: 1,
    x: 0,
    y: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
  })

  useEffect(() => {
    const wrap = wrapRef.current
    const img = imgRef.current
    if (!wrap || !img) return
    const s = state.current

    function apply() {
      if (img) img.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`
    }

    function clampPan() {
      if (!wrap) return
      const { width, height } = wrap.getBoundingClientRect()
      const maxX = (width * (s.scale - 1)) / 2
      const maxY = (height * (s.scale - 1)) / 2
      s.x = Math.min(maxX, Math.max(-maxX, s.x))
      s.y = Math.min(maxY, Math.max(-maxY, s.y))
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        s.pinchStartDist = distance(e.touches[0], e.touches[1])
        s.pinchStartScale = s.scale
      } else if (e.touches.length === 1 && s.scale > 1.01) {
        s.panStartX = e.touches[0].clientX
        s.panStartY = e.touches[0].clientY
        s.panOriginX = s.x
        s.panOriginY = s.y
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = distance(e.touches[0], e.touches[1])
        const next = (dist / s.pinchStartDist) * s.pinchStartScale
        s.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
        clampPan()
        apply()
      } else if (e.touches.length === 1 && s.scale > 1.01) {
        e.preventDefault()
        s.x = s.panOriginX + (e.touches[0].clientX - s.panStartX)
        s.y = s.panOriginY + (e.touches[0].clientY - s.panStartY)
        clampPan()
        apply()
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0 && s.scale <= 1.01) {
        s.scale = 1
        s.x = 0
        s.y = 0
        apply()
      }
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    wrap.addEventListener('touchend', onTouchEnd, { passive: true })
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [src])

  return (
    <div ref={wrapRef} className="pinch-zoom">
      <img ref={imgRef} src={src} alt={alt} className="pinch-zoom__img" draggable={false} />
    </div>
  )
}
