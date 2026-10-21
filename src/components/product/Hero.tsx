import { useEffect, useState, type MouseEvent } from 'react'
import { api } from '../../api/client'
import type { Banner, BannerElement } from '../../api/types'
import heroImg from '../../assets/hero.png'
import BannerLayoutElements from './BannerLayoutElements'
import { scrimGradient, backgroundSizeFor, useBannerDevice } from '../../utils/bannerLayout'

interface DisplaySlide {
  image_url: string
  /** Optional separate photo for the mobile breakpoint only — see
   * admin/src/api/types.ts's doc on Banner.image_url_mobile. Falls back to
   * image_url when unset. */
  image_url_mobile?: string | null
  badge_text: string | null
  title: string | null
  subtitle: string | null
  cta_text: string | null
  cta_link: string | null
  collection_slug?: string | null
  layout_json?: BannerElement[] | null
  image_focus_x?: number
  image_focus_y?: number
  /** null/unset = background-size: cover (fills the box, cropping whatever
   * doesn't fit). A number is an explicit background-size percent instead —
   * set from the admin editor to shrink a photo whose own aspect ratio
   * doesn't match the hero box, so the whole thing stays visible instead of
   * being cropped. */
  image_zoom?: number | null
  /** See scrimGradient() in utils/bannerLayout.ts. */
  scrim_opacity?: number | null
}

const fallbackSlide: DisplaySlide = {
  image_url: heroImg,
  badge_text: 'NEW COLLECTION',
  title: 'Urban Elegance',
  subtitle: 'Descubre la nueva línea de streetwear premium. Diseños minimalistas, máxima actitud.',
  cta_text: 'VER COLECCIÓN',
  cta_link: '#catalogo',
}

export default function Hero() {
  const [slides, setSlides] = useState<Banner[] | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const device = useBannerDevice()

  useEffect(() => {
    api
      .getBanners({ placement: 'home_hero' })
      .then(setSlides)
      .catch(() => setSlides([]))
  }, [])

  const activeSlides: DisplaySlide[] = slides && slides.length > 0 ? slides : [fallbackSlide]
  const slide = activeSlides[activeIndex % activeSlides.length]

  useEffect(() => {
    if (activeSlides.length <= 1) return
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % activeSlides.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [activeSlides.length])

  function handleCtaClick(e: MouseEvent) {
    if (slide.collection_slug) {
      e.preventDefault()
      document.getElementById(`collection-${slide.collection_slug}`)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if ((slide.cta_link || '#catalogo').startsWith('#')) {
      e.preventDefault()
      document.getElementById((slide.cta_link || '#catalogo').slice(1))?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const layout = slide.layout_json && slide.layout_json.length > 0 ? slide.layout_json : null
  const effectiveImageUrl = device === 'mobile' && slide.image_url_mobile ? slide.image_url_mobile : slide.image_url

  return (
    <section
      className={`hero-banner ${layout ? 'hero-banner--custom-layout' : ''}`}
      style={{
        backgroundImage: `url(${effectiveImageUrl})`,
        backgroundPosition: `${slide.image_focus_x ?? 50}% ${slide.image_focus_y ?? 50}%`,
        backgroundSize: backgroundSizeFor(slide.image_zoom),
      }}
    >
      <div className="hero-banner__scrim" style={{ background: scrimGradient('hero', slide.scrim_opacity) }} />
      {layout ? (
        <BannerLayoutElements layout={layout} />
      ) : (
        <div className="hero-banner__content">
          {slide.badge_text && <span className="badge badge--new">{slide.badge_text}</span>}
          {slide.title && <h1>{slide.title}</h1>}
          {slide.subtitle && <p>{slide.subtitle}</p>}
          {slide.cta_text && (
            <a href={slide.cta_link || '#catalogo'} className="btn btn--light" onClick={handleCtaClick}>
              {slide.cta_text}
            </a>
          )}
        </div>
      )}

      {activeSlides.length > 1 && (
        <div className="hero-banner__dots">
          {activeSlides.map((_, i) => (
            <button
              key={i}
              className={`hero-banner__dot ${i === activeIndex ? 'hero-banner__dot--active' : ''}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
