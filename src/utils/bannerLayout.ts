import { useEffect, useState, type CSSProperties } from 'react'
import type { BannerDevice, BannerDeviceLayout, BannerElement } from '../api/types'

/** Must match admin/src/components/BannerEditor.tsx's
 * BANNER_REFERENCE_WIDTHS — the "px" values entered in the panel are
 * relative to a PER-DEVICE reference width, then converted to container
 * query units (cqw) so they scale proportionally with however wide the
 * banner's own box actually renders here, instead of staying a fixed pixel
 * size that only looked right at one specific width. Requires the banner box
 * to be a size container (container-type: inline-size — see index.css). */
export const BANNER_REFERENCE_WIDTHS: Record<BannerDevice, number> = {
  desktop: 1400,
  tablet: 700,
  mobile: 380,
}

export function cqw(px: number, device: BannerDevice): string {
  return `${(px / BANNER_REFERENCE_WIDTHS[device]) * 100}cqw`
}

/** Mirrors .hero-banner--custom-layout's own media query breakpoints (640,
 * 1024 — see index.css) so the device picked here for reading each
 * element's layouts.<device> always matches the aspect-ratio the CSS is
 * actually applying, keeping banner-editor positions/sizes reproducible. */
export function resolveBannerDevice(width: number): BannerDevice {
  if (width >= 1024) return 'desktop'
  if (width >= 640) return 'tablet'
  return 'mobile'
}

export function useBannerDevice(): BannerDevice {
  const [device, setDevice] = useState<BannerDevice>(() =>
    resolveBannerDevice(typeof window === 'undefined' ? 1024 : window.innerWidth)
  )
  useEffect(() => {
    function onResize() {
      setDevice(resolveBannerDevice(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return device
}

/** Normalizes textShadow's legacy `boolean` shape (true ≈ level 3) alongside
 * its current `number` (0-5) one — kept in sync with
 * admin/src/components/BannerEditor.tsx's copy. */
export function shadowLevel(v: number | boolean | undefined): number {
  if (typeof v === 'number') return v
  return v ? 3 : 0
}

/** A CSS text-shadow string for a 0-5 level — kept in sync with
 * admin/src/components/BannerEditor.tsx's copy so the live site matches the
 * editor preview exactly. 0 (or unset) means no shadow at all. */
export function shadowCss(level: number): string | undefined {
  if (!level) return undefined
  const blur = 3 + level * 3
  const offset = Math.min(4, 1 + Math.floor(level / 2))
  const alpha = Math.min(0.75, 0.18 + level * 0.11)
  return `0 ${offset}px ${blur}px rgba(0, 0, 0, ${alpha.toFixed(2)})`
}

/** #rgb/#rrggbb -> "rgba(r, g, b, alpha)" — kept in sync with
 * admin/src/components/BannerEditor.tsx's copy. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${Number.isNaN(r) ? 255 : r}, ${Number.isNaN(g) ? 255 : g}, ${Number.isNaN(b) ? 255 : b}, ${alpha})`
}

/** Reproduces one placement's real scrim gradient (see .hero-banner__scrim /
 * .package-promo__scrim in index.css), scaled by `opacityPct` (100 = that
 * gradient's own real stops, unmodified — null/undefined from a banner row
 * defaults to this). Kept in sync with admin/src/components/BannerEditor.tsx's
 * copy so the editor preview matches exactly. */
export function scrimGradient(placement: 'hero' | 'promo' | 'category', opacityPct: number | null | undefined): string {
  const f = (opacityPct ?? 100) / 100
  const a = (base: number) => Math.min(1, Math.max(0, base * f)).toFixed(2)
  if (placement === 'promo') {
    return `linear-gradient(90deg, rgba(0, 0, 0, ${a(0.88)}) 0%, rgba(0, 0, 0, ${a(0.6)}) 55%, rgba(0, 0, 0, ${a(0.25)}) 100%)`
  }
  if (placement === 'category') {
    return `linear-gradient(180deg, rgba(0, 0, 0, ${a(0.1)}) 0%, rgba(0, 0, 0, ${a(0.8)}) 100%)`
  }
  return `linear-gradient(180deg, rgba(0, 0, 0, ${a(0.25)}) 0%, rgba(0, 0, 0, ${a(0.9)}) 100%)`
}

/** null/undefined = background-size: cover (fills the box, cropping
 * whatever doesn't fit — the original, always-available behavior). 0 is a
 * reserved sentinel (a literal 0% would be a zero-size image, never a real
 * choice) meaning background-size: contain instead — shows the WHOLE photo
 * letterboxed, the one setting that looks right regardless of how far the
 * photo's own aspect ratio is from the box's (mobile/tablet/desktop each
 * have a different fixed box shape, but image_zoom isn't set per-device —
 * this is the only zoom choice that doesn't need retuning per breakpoint).
 * Any other number is an explicit background-size percent, same as before.
 * Kept in sync with admin/src/components/BannerEditor.tsx's copy. */
export function backgroundSizeFor(zoomPct: number | null | undefined): string | undefined {
  if (zoomPct == null) return undefined
  if (zoomPct === 0) return 'contain'
  return `${zoomPct}%`
}

/** The visual box style for one banner layout element — kept in sync with
 * admin/src/components/BannerEditor.tsx's bannerElementStyle, so what the
 * admin sees in the editor is exactly what renders here. */
/** Default box size (reference-px, same unit as fontSize) for an 'image'
 * element that hasn't had its width/height set yet. */
const DEFAULT_IMAGE_SIZE = { width: 220, height: 270 }

export function bannerElementStyle(el: BannerElement, layout: BannerDeviceLayout, device: BannerDevice): CSSProperties {
  if (el.kind === 'image') {
    const shadow = shadowLevel(el.textShadow)
    return {
      width: cqw(layout.width ?? DEFAULT_IMAGE_SIZE.width, device),
      height: cqw(layout.height ?? DEFAULT_IMAGE_SIZE.height, device),
      borderRadius: cqw(layout.borderRadius ?? 0, device),
      objectFit: 'cover',
      boxShadow: shadow ? shadowCss(shadow) : undefined,
      border: el.borderColor ? `${cqw(layout.borderWidth ?? 1, device)} solid ${el.borderColor}` : undefined,
      transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
    }
  }
  const style: CSSProperties = {
    color: el.color,
    fontFamily: el.fontFamily,
    fontSize: cqw(layout.fontSize, device),
    fontWeight: el.fontWeight === 'bold' ? 700 : 400,
    padding: cqw(layout.padding ?? 0, device),
    borderRadius: cqw(layout.borderRadius ?? 0, device),
    backgroundColor: el.backgroundColor ?? undefined,
    textAlign: el.align === 'center' ? 'center' : undefined,
    transform: el.align === 'center' ? 'translateX(-50%)' : undefined,
    border: el.borderColor ? `${cqw(layout.borderWidth ?? 1, device)} solid ${el.borderColor}` : undefined,
    textShadow: shadowCss(shadowLevel(el.textShadow)),
    // Unset (auto-width, never wraps for a button per .hero-banner__layout-el)
    // unless the admin picked an explicit width in the editor — then the box
    // honors it and wraps its text inside instead, same as any normal box.
    width: layout.width != null ? cqw(layout.width, device) : undefined,
    whiteSpace: layout.width != null ? 'normal' : undefined,
  }
  if (el.glass) {
    style.backgroundColor = hexToRgba(el.backgroundColor ?? '#ffffff', 0.16)
    style.backdropFilter = 'blur(14px) saturate(160%)'
    style.WebkitBackdropFilter = 'blur(14px) saturate(160%)'
    if (!el.borderColor) style.border = '1px solid rgba(255, 255, 255, 0.35)'
  }
  return style
}
