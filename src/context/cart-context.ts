import { createContext } from 'react'

export interface CartItem {
  productId: number
  slug: string
  name: string
  price: number
  image: string | null
  size: string
  colorName: string
  colorHex: string
  quantity: number
  /** True when this was added while out of stock — an availability inquiry
   * rather than a confirmed order; flagged in the WhatsApp message and in
   * the cart UI so the seller knows to check before confirming. */
  preorder?: boolean
  /** True for a unit picked as a combo/bundle "de regalo" slot (see
   * CollectionBundlePart.is_gift) — kept as its OWN cart line even when it's
   * the exact same product/size/color as a paid line, the same way Punto de
   * venta's SaleLine never merges a gift line into a non-gift one, so a free
   * unit is never silently blended into (and thus hidden inside) a paid
   * line's price/quantity. */
  isGift?: boolean
}

export interface CartContextValue {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  /** `isGift` defaults to false — every existing call site (a normal, non-
   * gift line) omits it and keeps matching exactly as before; only a gift
   * line's own controls need to pass `true` so they don't touch a co-existing
   * paid line of the same product/size/color. */
  removeItem: (productId: number, size: string, colorName: string, isGift?: boolean) => void
  /** Removes every item matching the predicate — used to clear only the
   * confirmed (in-stock) items after sending an order, keeping agotado ones. */
  removeItems: (matcher: (item: CartItem) => boolean) => void
  updateQuantity: (productId: number, size: string, colorName: string, quantity: number, isGift?: boolean) => void
  clear: () => void
  /** Replaces the whole cart at once — used to hydrate from/reset an account's saved state. */
  replaceCart: (items: CartItem[]) => void
  totalItems: number
  totalPrice: number
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  /** Increments on every addItem call — used to (re)trigger the cart bubble's add animation. */
  cartBumpId: number
}

export const CartContext = createContext<CartContextValue | null>(null)
