import { useEffect } from 'react'

/** Prevents the page behind a drawer/modal from scrolling while it's open —
 * without this, a touch drag over the backdrop (or anywhere outside the
 * drawer's own scrollable area) scrolls the catalog/product page underneath
 * it, which reads as broken since nothing about the open drawer suggests
 * the background is still interactive. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyPosition = body.style.position
    const previousBodyTop = body.style.top
    const previousBodyWidth = body.style.width

    // Neither html nor body has its own height/overflow set (see
    // index.css), so the page's scrollable box is really the viewport,
    // which the browser derives from <html>'s overflow — setting this on
    // body alone doesn't reliably stop it.
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    // iOS Safari specifically still lets a touch drag scroll/rubber-band
    // the page behind an overlay even with overflow:hidden set — pinning
    // the body in place with position:fixed (the standard cross-browser
    // workaround for this) is what actually stops it there. Pins at the
    // CURRENT scroll position (via a negative top) so nothing visibly
    // jumps to 0 the moment the drawer opens; restored on close below.
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'

    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
      body.style.position = previousBodyPosition
      body.style.top = previousBodyTop
      body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
