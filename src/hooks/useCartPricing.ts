import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Collection, WholesaleTier } from '../api/types'
import { useCart } from './useCart'
import { useCustomerAuth } from './useCustomerAuth'
import { getProductDiscountPrice, priceCart } from '../utils/pricing'

export function useCartPricing() {
  const { items } = useCart()
  const { customer } = useCustomerAuth()
  const [tiers, setTiers] = useState<WholesaleTier[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [discounts, setDiscounts] = useState<Map<number, number>>(new Map())
  const [productCategories, setProductCategories] = useState<Map<number, number | null>>(new Map())

  useEffect(() => {
    api
      .getWholesaleTiers()
      .then(setTiers)
      .catch(() => {})
    api
      .getCollections()
      .then(setCollections)
      .catch(() => {})
    api
      .getProducts()
      .then((products) => {
        const discountMap = new Map<number, number>()
        const categoryMap = new Map<number, number | null>()
        for (const p of products) {
          const discounted = getProductDiscountPrice(p)
          if (discounted !== null) discountMap.set(p.id, discounted)
          categoryMap.set(p.id, p.category_id)
        }
        setDiscounts(discountMap)
        setProductCategories(categoryMap)
      })
      .catch(() => {})
  }, [])

  const customerDiscount = customer?.discountAmount ?? 0

  const { pricedItems, breakdown } = useMemo(
    () => priceCart(items, tiers, collections, discounts, productCategories, customerDiscount),
    [items, tiers, collections, discounts, productCategories, customerDiscount]
  )

  return { pricedItems, totalPrice: breakdown.total, breakdown }
}
