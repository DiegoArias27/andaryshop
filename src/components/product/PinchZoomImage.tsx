import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'

interface PinchZoomImageProps {
  src: string
  alt: string
}

const MAX_SCALE = 3
const MIN_SCALE = 1
const DOUBLE_TAP_ZOOM = 2.5
const DOUBLE_TAP_MS = 400
// A real finger (unlike a mouse pointer) covers a few mm of screen just
// from how it lands — a fast tap reports noticeably more drift between
// its own touchstart/touchend than a slow, deliberate one. 10px rejected
// a lot of genuine fast taps as "that was a drag, not a tap."
const TAP_MOVE_TOLERANCE = 28
// Separately, how far the SECOND tap's start is allowed to land from the
// first one's — a bit more forgiving than the within-tap jitter above,
// since two independent taps naturally land with more variance than one
// continuous press does.
const DOUBLE_TAP_POSITION_TOLERANCE = 45

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/** Pinch-to-zoom + drag-to-pan on a single product photo, scoped to that
 * image instead of the whole page — without this, pinching over the photo
 * triggers the browser's own page zoom (header, buttons, everything),
 * which reads as broken rather than "look closer at the shirt." Double-
 * tapping (or double-clicking, on desktop) the same photo toggles between
 * 1x and a fixed zoomed-in level.
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
    tapStartX: 0,
    tapStartY: 0,
    gestureHadMultiTouch: false,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  })

  function apply(smooth = false) {
    const img = imgRef.current
    if (!img) return
    img.style.transition = smooth ? 'transform 0.2s ease' : ''
    img.style.transform = `translate(${state.current.x}px, ${state.current.y}px) scale(${state.current.scale})`
  }

  function reset() {
    const s = state.current
    s.scale = 1
    s.x = 0
    s.y = 0
    apply(true)
  }

  function toggleZoom() {
    const s = state.current
    if (s.scale > 1.01) {
      reset()
    } else {
      s.scale = DOUBLE_TAP_ZOOM
      s.x = 0
      s.y = 0
      apply(true)
    }
  }

  // Desktop: a plain React onDoubleClick, no passive-listener gotchas since
  // it doesn't need to block any native scroll/zoom gesture.
  function handleDoubleClick(e: ReactMouseEvent) {
    e.preventDefault()
    toggleZoom()
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const s = state.current

    function clampPan() {
      if (!wrap) return
      const { width, height } = wrap.getBoundingClientRect()
      const maxX = (width * (s.scale - 1)) / 2
      const maxY = (height * (s.scale - 1)) / 2
      s.x = Math.min(maxX, Math.max(-maxX, s.x))
      s.y = Math.min(maxY, Math.max(-maxY, s.y))
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 1) {
        s.gestureHadMultiTouch = false
        s.tapStartX = e.touches[0].clientX
        s.tapStartY = e.touches[0].clientY
        if (s.scale > 1.01) {
          s.panStartX = e.touches[0].clientX
          s.panStartY = e.touches[0].clientY
          s.panOriginX = s.x
          s.panOriginY = s.y
        }
      } else if (e.touches.length === 2) {
        s.gestureHadMultiTouch = true
        s.pinchStartDist = distance(e.touches[0], e.touches[1])
        s.pinchStartScale = s.scale
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
      if (e.touches.length !== 0) return

      // Double-tap to toggle zoom — only for a clean single-finger tap
      // (never part of a pinch) that barely moved (a pan/drag doesn't
      // count as a tap, even if it ends quickly).
      const changed = e.changedTouches[0]
      const moved = changed ? Math.hypot(changed.clientX - s.tapStartX, changed.clientY - s.tapStartY) : Infinity
      const wasTap = !s.gestureHadMultiTouch && moved <= TAP_MOVE_TOLERANCE

      if (wasTap) {
        // Stops the browser from ALSO synthesizing its own click/dblclick
        // from this same touch — without this, a FAST double-tap could
        // toggle the zoom here and then, a beat later, toggle it right
        // back via the synthetic dblclick calling handleDoubleClick a
        // second time. A slow double-tap didn't trigger that synthesis
        // (browsers only do it within their own short window), which is
        // exactly why it worked "if I do it slowly" but not fast.
        e.preventDefault()
      }

      const now = Date.now()
      const sincePrevTap = Math.hypot(s.tapStartX - s.lastTapX, s.tapStartY - s.lastTapY)
      if (wasTap && now - s.lastTapTime < DOUBLE_TAP_MS && sincePrevTap <= DOUBLE_TAP_POSITION_TOLERANCE) {
        s.lastTapTime = 0
        toggleZoom()
        return
      } else if (wasTap) {
        s.lastTapTime = now
        s.lastTapX = s.tapStartX
        s.lastTapY = s.tapStartY
      } else {
        s.lastTapTime = 0
      }

      if (s.scale <= 1.01) {
        s.scale = 1
        s.x = 0
        s.y = 0
        apply()
      }
    }

    wrap.addEventListener('touchstart', onTouchStart, { passive: true })
    wrap.addEventListener('touchmove', onTouchMove, { passive: false })
    // Not passive — onTouchEnd needs to call preventDefault() for a tap,
    // to block the browser's own synthetic click/dblclick for it.
    wrap.addEventListener('touchend', onTouchEnd, { passive: false })
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart)
      wrap.removeEventListener('touchmove', onTouchMove)
      wrap.removeEventListener('touchend', onTouchEnd)
      wrap.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [src])

  return (
    <div ref={wrapRef} className="pinch-zoom" onDoubleClick={handleDoubleClick}>
      <img ref={imgRef} src={src} alt={alt} className="pinch-zoom__img" draggable={false} />
    </div>
  )
}
