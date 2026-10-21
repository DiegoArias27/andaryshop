import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { CartContext, type CartContextValue, type CartItem } from './cart-context'
import { playAddToCartSound } from '../utils/sound'

function sameVariant(item: CartItem, productId: number, size: string, colorName: string, isGift = false) {
  return item.productId === productId && item.size === size && item.colorName === colorName && !!item.isGift === isGift
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useLocalStorage<CartItem[]>('andary-cart', [])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [cartBumpId, setCartBumpId] = useState(0)

  function addItem(item: Omit<CartItem, 'quantity'>, quantity = 1) {
    setItems((prev) => {
      const existing = prev.find((p) => sameVariant(p, item.productId, item.size, item.colorName, !!item.isGift))
      if (existing) {
        return prev.map((p) =>
          sameVariant(p, item.productId, item.size, item.colorName, !!item.isGift)
            ? { ...p, ...item, quantity: p.quantity + quantity }
            : p
        )
      }
      return [...prev, { ...item, quantity }]
    })
    setCartBumpId((n) => n + 1)
    playAddToCartSound()
  }

  function removeItem(productId: number, size: string, colorName: string, isGift = false) {
    setItems((prev) => prev.filter((p) => !sameVariant(p, productId, size, colorName, isGift)))
  }

  function removeItems(matcher: (item: CartItem) => boolean) {
    setItems((prev) => prev.filter((p) => !matcher(p)))
  }

  function updateQuantity(productId: number, size: string, colorName: string, quantity: number, isGift = false) {
    if (quantity <= 0) {
      removeItem(productId, size, colorName, isGift)
      return
    }
    setItems((prev) =>
      prev.map((p) => (sameVariant(p, productId, size, colorName, isGift) ? { ...p, quantity } : p))
    )
  }

  function clear() {
    setItems([])
  }

  const replaceCart = useCallback((next: CartItem[]) => setItems(next), [setItems])

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.quantity * i.price, 0), [items])

  const value: CartContextValue = {
    items,
    addItem,
    removeItem,
    removeItems,
    updateQuantity,
    clear,
    replaceCart,
    totalItems,
    totalPrice,
    drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    cartBumpId,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
