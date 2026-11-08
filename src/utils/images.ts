import type { Product } from '../api/types'

/** The small, catalog/list-context version of a product's cover photo — the
 * catalog grid, cart lines, favorites and package-builder summaries all show
 * this at icon/card size, so there's no reason to pull the full up-to-2000px
 * photo the product detail page uses. Falls back to the full photo for a
 * product uploaded before thumbnails existed. */
export function productThumb(p: Pick<Product, 'main_image_url' | 'main_thumb_url'>): string | null {
  return p.main_thumb_url ?? p.main_image_url
}

/** Same idea as productThumb, but for whichever color is actually being
 * added — a cart line should show the photo of the color/variant it's
 * actually for, not always the product's one generic cover photo (which
 * may well be a different color's). Falls back to the generic thumb when
 * this color has no photo of its own tagged (see admin's GalleryManager). */
export function colorThumb(p: Pick<Product, 'images' | 'main_image_url' | 'main_thumb_url'>, colorName: string): string | null {
  const match = p.images.find((img) => img.color_name === colorName)
  return (match?.thumb_url ?? match?.image_url) || productThumb(p)
}
