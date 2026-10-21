import type { CSSProperties, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BannerElement } from '../../api/types'
import { resolveDeviceLayout } from '../../api/types'
import { bannerElementStyle, cqw, useBannerDevice } from '../../utils/bannerLayout'

/** Where one layout button element itself links to — independent of
 * whatever plain cta_link/collection_slug the banner row might also have,
 * since a custom layout can carry several buttons, each configured
 * separately in the admin's banner editor. Shared by every banner
 * placement (hero carousel, promo strips) since the editor's "el botón
 * lleva a" options and .hero-banner__layout-el markup are identical
 * everywhere — only the outer section wrapper differs per placement. */
function layoutButtonHref(el: BannerElement): string {
  if (el.linkType === 'url' && el.url) return el.url
  if (el.linkType === 'collection' && el.collectionSlug) return `#collection-${el.collectionSlug}`
  if (el.linkType === 'category' && el.categorySlug) return `/?categoria=${el.categorySlug}`
  if (el.linkType === 'packages') return '/?paquetes=1'
  return '#catalogo'
}

/** Renders the admin's positioned-element custom layout (title/subtitle/
 * button/text/plaque) inside whatever fixed-aspect-ratio, container-query
 * box the caller already set up (.hero-banner--custom-layout,
 * .package-promo--custom-layout, etc.) — the elements themselves
 * (.hero-banner__layout-el/__plaque) are purely positional and look
 * identical regardless of which placement they're rendered in. */
export default function BannerLayoutElements({
  layout,
  titleTag = 'h1',
}: {
  layout: BannerElement[]
  /** The home hero is the page's single most prominent heading (h1); a
   * collection or promo banner is one of several sections on the page, so
   * it uses h2 there instead — purely a semantic/accessibility choice, the
   * visual look comes entirely from CSS classes either way. */
  titleTag?: 'h1' | 'h2'
}) {
  const device = useBannerDevice()
  const navigate = useNavigate()

  function handleLayoutButtonClick(e: MouseEvent, el: BannerElement) {
    if (el.linkType === 'collection' && el.collectionSlug) {
      e.preventDefault()
      const target = document.getElementById(`collection-${el.collectionSlug}`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' })
      } else {
        // Not rendered on this page — most likely a collection curated only
        // for the Paquetes page, not Inicio's own section list. Navigate
        // there instead of silently doing nothing; Catalog.tsx's own mount
        // effect picks up the #collection-* hash once that page's data
        // loads and scrolls to it the same way.
        navigate(`/?paquetes=1#collection-${el.collectionSlug}`)
      }
      return
    }
    if (el.linkType === 'category' && el.categorySlug) {
      e.preventDefault()
      navigate(`/?categoria=${el.categorySlug}`)
      return
    }
    if (el.linkType === 'packages') {
      e.preventDefault()
      navigate('/?paquetes=1')
      return
    }
    if (el.linkType === 'url' && el.url) return
    e.preventDefault()
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="hero-banner__layout">
      {layout.map((el) => {
        const elLayout = resolveDeviceLayout(el, device)
        const style: CSSProperties = {
          left: `${elLayout.xPct}%`,
          top: `${elLayout.yPct}%`,
          ...bannerElementStyle(el, elLayout, device),
        }
        if (el.kind === 'plaque') {
          return (
            <div
              key={el.id}
              className="hero-banner__plaque"
              style={{
                left: `${elLayout.xPct}%`,
                top: `${elLayout.yPct}%`,
                fontSize: cqw(elLayout.fontSize, device),
                transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
              }}
            >
              <p className="hero-banner__plaque-range">{el.text}</p>
              <p className="hero-banner__plaque-price">{el.priceText}</p>
              {el.captionText && <p className="hero-banner__plaque-caption">{el.captionText}</p>}
            </div>
          )
        }
        if (el.kind === 'image') {
          return <img key={el.id} src={el.imageUrl ?? ''} alt="" className="hero-banner__layout-img" style={style} />
        }
        if (el.kind === 'button') {
          return (
            <a
              key={el.id}
              href={layoutButtonHref(el)}
              className="hero-banner__layout-el"
              style={style}
              onClick={(e) => handleLayoutButtonClick(e, el)}
            >
              {el.text}
            </a>
          )
        }
        const Tag = el.kind === 'title' ? titleTag : 'span'
        return (
          <Tag key={el.id} className="hero-banner__layout-el" style={style}>
            {el.text}
          </Tag>
        )
      })}
    </div>
  )
}
