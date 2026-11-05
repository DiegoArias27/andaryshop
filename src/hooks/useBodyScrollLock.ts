import { useEffect } from 'react'

/** Prevents the page behind a drawer/modal from scrolling while it's open —
 * without this, a touch drag over the backdrop (or anywhere outside the
 * drawer's own scrollable area) scrolls the catalog/product page underneath
 * it, which reads as broken since nothing about the open drawer suggests
 * the background is still interactive. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    // Neither html nor body has its own height/overflow set (see
    // index.css), so the page's scrollable box is really the viewport,
    // which the browser derives from <html>'s overflow — setting this on
    // body alone doesn't reliably stop it. Both together is the standard,
    // cross-browser-safe way to lock page scroll.
    const html = document.documentElement
    const previousHtml = html.style.overflow
    const previousBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = previousHtml
      document.body.style.overflow = previousBody
    }
  }, [active])
}
