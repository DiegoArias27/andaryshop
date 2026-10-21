import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Product } from '../api/types'

/** Fetches the current product list once on mount — used to check live stock
 * against data that may be stale (a favorited item, a cart snapshot). */
export function useLiveProducts(): Product[] {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    api
      .getProducts()
      .then(setProducts)
      .catch(() => {})
  }, [])

  return products
}
