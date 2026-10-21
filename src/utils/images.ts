import type { Product } from '../api/types'

/** The small, catalog/list-context version of a product's cover photo — the
 * catalog grid, cart lines, favorites and package-builder summaries all show
 * this at icon/card size, so there's no reason to pull the full up-to-2000px
 * photo the product detail page uses. Falls back to the full photo for a
 * product uploaded before thumbnails existed. */
export function productThumb(p: Pick<Product, 'main_image_url' | 'main_thumb_url'>): string | null {
  return p.main_thumb_url ?? p.main_image_url
}
