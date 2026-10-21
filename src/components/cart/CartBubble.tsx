import { useCart } from '../../hooks/useCart'
import { useCartPricing } from '../../hooks/useCartPricing'
import { plaquePrice } from '../../utils/currency'
import { CartIcon } from '../icons'

export default function CartBubble() {
  const { items, totalItems, drawerOpen, openDrawer, cartBumpId } = useCart()
  const { totalPrice } = useCartPricing()

  if (items.length === 0 || drawerOpen) return null

  return (
    <button key={cartBumpId} className="cart-bubble cart-bubble--bump" onClick={openDrawer} aria-label="Ver carrito">
      <span className="cart-bubble__sparkles" aria-hidden="true">
        <span className="cart-bubble__spark cart-bubble__spark--1">✦</span>
        <span className="cart-bubble__spark cart-bubble__spark--2">✦</span>
        <span className="cart-bubble__spark cart-bubble__spark--3">✦</span>
        <span className="cart-bubble__spark cart-bubble__spark--4">✦</span>
        <span className="cart-bubble__spark cart-bubble__spark--5">✦</span>
        <span className="cart-bubble__spark cart-bubble__spark--6">✦</span>
      </span>
      <CartIcon />
      <span className="cart-bubble__badge">{totalItems}</span>
      <span className="cart-bubble__total">{plaquePrice(totalPrice)}</span>
    </button>
  )
}
