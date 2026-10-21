import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../../hooks/useCart'
import { useCartPricing } from '../../hooks/useCartPricing'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import { useLiveProducts } from '../../hooks/useLiveProducts'
import { variantStock } from '../../utils/stock'
import { formatPrice } from '../../utils/currency'
import { buildWhatsappOrderUrl, goToWhatsapp, openWhatsappTab, recordOrder } from '../../utils/whatsapp'
import { groupByPackage } from '../../utils/cartGroups'
import { CloseIcon, EditIcon, MinusIcon, PlusIcon, TrashIcon, WhatsappIcon } from '../icons'
import type { CartItem } from '../../context/cart-context'
import { expandPricedItemForOrder, type PricedItem } from '../../utils/pricing'
import type { EditCartItemState } from '../../pages/ProductDetail'

export default function CartDrawer() {
  const { items, updateQuantity, removeItem, removeItems, drawerOpen, closeDrawer } = useCart()
  const { pricedItems, totalPrice, breakdown } = useCartPricing()
  const { customer } = useCustomerAuth()
  const customerDiscount = customer?.discountAmount ?? 0
  const totalSavings =
    breakdown.wholesaleSavings + breakdown.discountSavings + breakdown.collectionSavings + breakdown.customerSavings
  const navigate = useNavigate()
  const liveProducts = useLiveProducts()

  if (items.length === 0) return null

  function isOutOfStock(item: CartItem) {
    const live = variantStock(liveProducts, item.productId, item.size, item.colorName)
    return live !== null ? live <= 0 : !!item.preorder
  }

  const inStockItems = pricedItems.filter((p) => !isOutOfStock(p.item))
  const outOfStockItems = pricedItems.filter((p) => isOutOfStock(p.item))

  async function handleSendOrder() {
    const whatsappTab = openWhatsappTab()
    const enriched = items.map((item) => ({ ...item, preorder: isOutOfStock(item) }))
    const folio = await recordOrder(
      pricedItems.flatMap((p) =>
        expandPricedItemForOrder(p).map((seg) => ({
          item: { ...seg.item, preorder: isOutOfStock(seg.item) },
          unitPrice: seg.unitPrice,
          quantity: seg.quantity,
          collectionId: p.collectionId,
          collectionName: p.collectionName,
          tierKey: p.tierKey,
          isGift: p.isGift,
        }))
      ),
      ''
    )
    goToWhatsapp(whatsappTab, buildWhatsappOrderUrl(enriched, '', folio))
    removeItems((item) => !isOutOfStock(item))
  }

  function handleEdit(item: CartItem) {
    const state: EditCartItemState = { editItem: { size: item.size, colorName: item.colorName, quantity: item.quantity } }
    closeDrawer()
    navigate(`/producto/${item.slug}`, { state })
  }

  function renderItem({ item, effectivePrice, source, isGift, priceBreakdown }: PricedItem) {
    const displayPrice = Math.max(0, effectivePrice - customerDiscount)
    const hasAnyDiscount = source !== 'retail' || customerDiscount > 0
    return (
      <li key={`${item.productId}-${item.size}-${item.colorName}-${isGift ? 'gift' : 'paid'}`} className="cart-drawer__item">
        <Link
          to={`/producto/${item.slug}`}
          className="cart-drawer__item-media"
          onClick={closeDrawer}
          aria-label={item.name}
        >
          {item.image ? <img src={item.image} alt={item.name} /> : <div className="cart-drawer__item-placeholder" />}
        </Link>
        <div className="cart-drawer__item-info">
          <Link to={`/producto/${item.slug}`} onClick={closeDrawer} className="cart-drawer__item-link">
            <h3>{item.name}</h3>
            <p>
              Talla {item.size} · {item.colorName}
            </p>
            {priceBreakdown ? (
              // See Cart.tsx's renderItem — same "don't show a confusing
              // blended average" rule when a quantity spills past a
              // package/combo's cupo.
              <div className="cart-item__price-breakdown">
                {priceBreakdown.map((seg, i) => (
                  <p key={i} className="cart-drawer__item-price">
                    {seg.quantity} × {formatPrice(Math.max(0, seg.price - customerDiscount))}
                    {seg.price !== item.price && <span className="cart-item__was">{formatPrice(item.price)}</span>}
                  </p>
                ))}
              </div>
            ) : (
              <p className="cart-drawer__item-price">
                {formatPrice(displayPrice)}
                {hasAnyDiscount && <span className="cart-item__was">{formatPrice(item.price)}</span>}
                {isOutOfStock(item) && <span className="tag-outofstock">Agotado</span>}
                {isGift && <span className="tag-wholesale">Regalo</span>}
                {!isGift && source === 'wholesale' && <span className="tag-wholesale">Mayoreo</span>}
                {!isGift && source === 'discount' && <span className="tag-wholesale">Oferta</span>}
                {/* 'collection' items are grouped under a section titled with
                    collectionName (see cart-drawer__section-title below) — no
                    need to repeat it on every row too. */}
              </p>
            )}
          </Link>
          <div className="qty-stepper qty-stepper--sm">
            <button
              onClick={() => updateQuantity(item.productId, item.size, item.colorName, item.quantity - 1, item.isGift)}
              aria-label="Restar"
            >
              <MinusIcon />
            </button>
            <input
              type="number"
              min={1}
              key={item.quantity}
              defaultValue={item.quantity}
              aria-label="Cantidad"
              onBlur={(e) => {
                const n = Math.max(1, Math.round(Number(e.target.value)) || 1)
                if (n !== item.quantity) updateQuantity(item.productId, item.size, item.colorName, n, item.isGift)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <button
              onClick={() => updateQuantity(item.productId, item.size, item.colorName, item.quantity + 1, item.isGift)}
              aria-label="Sumar"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
        <div className="cart-drawer__item-actions">
          <button className="icon-btn icon-btn--ghost" onClick={() => handleEdit(item)} aria-label="Editar">
            <EditIcon />
          </button>
          <button
            className="icon-btn icon-btn--ghost"
            onClick={() => removeItem(item.productId, item.size, item.colorName, item.isGift)}
            aria-label="Eliminar"
          >
            <TrashIcon />
          </button>
        </div>
      </li>
    )
  }

  return (
    <div
      className={`cart-drawer-overlay ${drawerOpen ? 'cart-drawer-overlay--open' : ''}`}
      onClick={closeDrawer}
      aria-hidden={!drawerOpen}
    >
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-drawer__header">
          <h2>Tu carrito</h2>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>

        <div className="cart-drawer__scroll">
          {groupByPackage(inStockItems).map((group, i) => (
            <div
              key={group.collectionName ?? `default-${i}`}
              className={group.collectionName ? 'cart-drawer__section' : undefined}
            >
              {group.collectionName && <h3 className="cart-drawer__section-title">{group.collectionName}</h3>}
              <ul className="cart-drawer__list">{group.items.map(renderItem)}</ul>
            </div>
          ))}

          {outOfStockItems.length > 0 && (
            <div className="cart-drawer__section--outofstock">
              <h3 className="cart-drawer__section-title">Agotados</h3>
              <ul className="cart-drawer__list">{outOfStockItems.map(renderItem)}</ul>
            </div>
          )}
        </div>

        <div className="cart-drawer__footer">
          {totalSavings > 0 && (
            <div className="cart-drawer__savings">
              Ahorras {formatPrice(totalSavings)}
            </div>
          )}
          {breakdown.customerSavings > 0 && (
            <div className="cart-drawer__savings cart-drawer__savings--customer">
              Incluye descuento de cliente frecuente: -{formatPrice(breakdown.customerSavings)}
            </div>
          )}
          <div className="cart-total">
            <span>Total</span>
            <strong>{formatPrice(totalPrice)}</strong>
          </div>
          <Link to="/carrito" className="btn btn--light" onClick={closeDrawer}>
            Ver carrito completo
          </Link>
          <button className="btn btn--whatsapp btn--block" onClick={handleSendOrder}>
            <WhatsappIcon /> ENVIAR PEDIDO
          </button>
        </div>
      </aside>
    </div>
  )
}
