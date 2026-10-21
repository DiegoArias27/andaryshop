import type { Product } from '../api/types'
import type { ProductCardData } from '../components/product/ProductCard'
import { productThumb } from './images'
import { getPromo } from './pricing'

export function toCardData(p: Product): ProductCardData {
  const imagesByColor: Record<string, string> = {}
  for (const img of p.images) {
    if (img.color_name && !imagesByColor[img.color_name]) imagesByColor[img.color_name] = img.thumb_url ?? img.image_url
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
