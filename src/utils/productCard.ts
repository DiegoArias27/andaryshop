import type { Product } from '../api/types'
import type { ProductCardData } from '../components/product/ProductCard'
import { productThumb } from './images'
import { getPromo } from './pricing'

export function toCardData(p: Product): ProductCardData {
  const imagesByColor: Record<string, string> = {}
  for (const img of p.images) {
    if (img.color_name && !imagesByColor[img.color_name]) imagesByColor[img.color_name] = img.thumb_url ?? img.image_url
  }

  // A color with no photo of its own falls back to whichever photo is
  // tagged "General" (color_name null) — same rule GalleryManager's own
  // hint promises and ProductDetail's gallery already follows. Without
  // this, that color fell back to the product's single cover photo
  // instead (main_image_url/productThumb below), which is a different,
  // unrelated thing whenever the cover happens to be some OTHER color's
  // own tagged shot — tapping that color then looked like it did nothing,
  // since the image shown never actually changed.
  const generalImage = p.images.find((img) => !img.color_name)
  if (generalImage) {
    const generalUrl = generalImage.thumb_url ?? generalImage.image_url
    const colorNames = new Set(p.variants.map((v) => v.color_name))
    for (const name of colorNames) {
      if (!imagesByColor[name]) imagesByColor[name] = generalUrl
    }
  }

  const secondary = p.images.find((img) => img.image_url !== p.main_image_url)

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    promo: getPromo(p),
    image: productThumb(p),
    secondaryImage: secondary ? (secondary.thumb_url ?? secondary.image_url) : null,
    imagesByColor,
    isNew: !!p.is_new,
    isBestseller: !!p.is_bestseller,
    variants: p.variants.map((v) => ({
      id: v.id,
      size: v.size,
      colorName: v.color_name,
      colorHex: v.color_hex,
      stock: v.stock,
    })),
  }
}
