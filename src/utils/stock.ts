import type { Product } from '../api/types'

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.stock, 0)
}

/** Live stock for one exact size/color combination, or null if the product
 * (or that specific variant) isn't in the given list yet. */
export function variantStock(products: Product[], productId: number, size: string, colorName: string): number | null {
  const product = products.find((p) => p.id === productId)
  if (!product) return null
  const variant = product.variants.find((v) => v.size === size && v.color_name === colorName)
  return variant ? variant.stock : null
}
