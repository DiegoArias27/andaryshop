import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useCartPricing } from '../hooks/useCartPricing'
import { useCustomerAuth } from '../hooks/useCustomerAuth'
import { useLiveProducts } from '../hooks/useLiveProducts'
import { variantStock } from '../utils/stock'
import { formatPrice } from '../utils/currency'
import { buildWhatsappOrderUrl, goToWhatsapp, openWhatsappTab, recordOrder } from '../utils/whatsapp'
import { groupByPackage } from '../utils/cartGroups'
import Header from '../components/layout/Header'
import { BackIcon, EditIcon, MinusIcon, PlusIcon, TrashIcon, WhatsappIcon } from '../components/icons'
import type { CartItem } from '../context/cart-context'
import { buildBreakdown, expandPricedItemForOrder, type PricedItem } from '../utils/pricing'
import type { EditCartItemState } from '../pages/ProductDetail'

export default function Cart() {
  const { items, updateQuantity, removeItem, removeItems } = useCart()
  const { pricedItems } = useCartPricing()
  const { customer } = useCustomerAuth()
  const customerDiscount = customer?.discountAmount ?? 0
  const [notes, setNotes] = useState('')
  const navigate = useNavigate()
  const liveProducts = useLiveProducts()

  // Stock can run out after an item was already added to the cart — check
  // live stock rather than trusting the `preorder` flag frozen at add-time.
  function isOutOfStock(item: CartItem) {
    const live = variantStock(liveProducts, item.productId, item.size, item.colorName)
    return live !== null ? live <= 0 : !!item.preorder
  }

  const inStockItems = pricedItems.filter((p) => !isOutOfStock(p.item))
  const outOfStockItems = pricedItems.filter((p) => isOutOfStock(p.item))
  // Subtotal/total shown here must reflect only what will actually be
  // ordered — an out-of-stock line is excluded from the WhatsApp order
  // entirely (see handleSendOrder), so it shouldn't inflate the displayed
  // total either.
  const breakdown = useMemo(() => buildBreakdown(inStockItems, customerDiscount), [inStockItems, customerDiscount])
  const totalPrice = breakdown.total

  async function handleSendOrder() {
    // Opened synchronously (before the await below) so it isn't blocked by
    // the browser's popup blocker — its location is filled in once the
    // folio comes back.
    const whatsappTab = openWhatsappTab()
    // Out-of-stock lines stay out of the order entirely now — no more
    // "avísame" inquiry riding along in the same message (see the plain
    // AGOTADO card below instead of the old editable "pendientes de
    // disponibilidad" section).
    const folio = await recordOrder(
      inStockItems.flatMap((p) =>
        expandPricedItemForOrder(p).map((seg) => ({
          item: seg.item,
          unitPrice: seg.unitPrice,
          quantity: seg.quantity,
          collectionId: p.collectionId,
          collectionName: p.collectionName,
          tierKey: p.tierKey,
          isGift: p.isGift,
        }))
      ),
      notes
    )
    goToWhatsapp(whatsappTab, buildWhatsappOrderUrl(inStockItems.map((p) => p.item), notes, folio))
    // Only the sent, in-stock items leave the cart — an out-of-stock line
    // stays put so the customer can still see it (or remove it) later.
    removeItems((item) => !isOutOfStock(item))
  }

  function handleEdit(item: CartItem) {
    const state: EditCartItemState = { editItem: { size: item.size, colorName: item.colorName, quantity: item.quantity } }
    navigate(`/producto/${item.slug}`, { state })
  }

  function renderItem({ item, effectivePrice, source, isGift, priceBreakdown }: PricedItem) {
    const displayPrice = Math.max(0, effectivePrice - customerDiscount)
    const hasAnyDiscount = source !== 'retail' || customerDiscount > 0
    return (
      <li key={`${item.productId}-${item.size}-${item.colorName}-${isGift ? 'gift' : 'paid'}`} className="cart-item">
        <Link to={`/producto/${item.slug}`} className="cart-item__media" aria-label={item.name}>
          {item.image ? <img src={item.image} alt={item.name} /> : <div className="cart-item__placeholder" />}
        </Link>
        <Link to={`/producto/${item.slug}`} className="cart-item__info">
          <h3>{item.name}</h3>
          <p className="cart-item__meta">
            Talla {item.size} · <span className="cart-item__swatch" style={{ backgroundColor: item.colorHex }} />{' '}
            {item.colorName}
          </p>
          {priceBreakdown ? (
            // The quantity spilled past a package/combo's cupo — showing one
            // blended average (e.g. "$246.67 c/u") reads as a mistake, so
            // each real price gets its own line instead (see PricedItem.
            // priceBreakdown); the total charged is unchanged either way.
            <div className="cart-item__price-breakdown">
              {priceBreakdown.map((seg, i) => (
                <p key={i} className="cart-item__price">
                  {seg.quantity} × {formatPrice(Math.max(0, seg.price - customerDiscount))}
                  {seg.price !== item.price && <span className="cart-item__was">{formatPrice(item.price)}</span>}
                </p>
              ))}
            </div>
          ) : (
            <p className="cart-item__price">
              {formatPrice(displayPrice)}
              {hasAnyDiscount && (
                <>
                  {' '}
                  <span className="cart-item__was">{formatPrice(item.price)}</span>
                  {isGift && <span className="tag-wholesale">Regalo</span>}
                  {!isGift && source === 'wholesale' && <span className="tag-wholesale">Mayoreo</span>}
                  {!isGift && source === 'discount' && <span className="tag-wholesale">Oferta</span>}
                  {/* 'collection' items are grouped under a section titled with
                      collectionName (see cart-section__title below) — no need
                      to repeat it on every row too. */}
                </>
              )}
            </p>
          )}
        </Link>
        <div className="cart-item__actions">
          <div className="cart-item__actions-top">
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
          <div className="qty-stepper">
            <button
              onClick={() => updateQuantity(item.productId, item.size, item.colorName, item.quantity - 1, item.isGift)}
              aria-label="Restar"
            >
              <MinusIcon />
            </button>
            {/* Uncontrolled + commit-on-blur/Enter, keyed on the committed
                quantity so it re-syncs after the +/- buttons or a previous
                edit — avoids a controlled input re-rendering (and losing
                focus) on every keystroke. */}
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
      </li>
    )
  }

  // A sold-out line stays visible (so the customer isn't left wondering
  // where it went) but read-only — no quantity stepper, no edit, and no
  // longer any "avísame" inquiry riding along with it; just the fact that
  // it sold out, and a way to remove it.
  function renderOutOfStockItem({ item }: PricedItem) {
    return (
      <li
        key={`${item.productId}-${item.size}-${item.colorName}-${item.isGift ? 'gift' : 'paid'}`}
        className="cart-item cart-item--outofstock"
      >
        <Link to={`/producto/${item.slug}`} className="cart-item__media" aria-label={item.name}>
          {item.image ? <img src={item.image} alt={item.name} /> : <div className="cart-item__placeholder" />}
        </Link>
        <Link to={`/producto/${item.slug}`} className="cart-item__info">
          <h3>{item.name}</h3>
          <p className="cart-item__meta">
            Talla {item.size} · <span className="cart-item__swatch" style={{ backgroundColor: item.colorHex }} />{' '}
            {item.colorName}
          </p>
          <span className="badge badge--outofstock">AGOTADO</span>
        </Link>
        <div className="cart-item__actions">
          <button
            className="icon-btn icon-btn--ghost"
            onClick={() => removeItem(item.productId, item.size, item.colorName, item.isGift)}
            aria-label="Quitar"
          >
            <TrashIcon />
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="page page--cart">
      <Header variant="home" />
      <div className="cart-content">
        <div className="page-title-row">
          <Link to="/" className="icon-btn page-title-row__back" aria-label="Volver al catálogo">
            <BackIcon />
          </Link>
          <h1>Tu carrito</h1>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <p>Tu carrito está vacío.</p>
            <Link to="/" className="btn btn--primary">
              Ir al catálogo
            </Link>
          </div>
        ) : (
          <div className="cart-body">
            <div className="cart-lists">
              {groupByPackage(inStockItems).map((group, i) => (
                <div key={group.collectionName ?? `default-${i}`} className={group.collectionName ? 'cart-section' : undefined}>
                  {group.collectionName && <h2 className="cart-section__title">{group.collectionName}</h2>}
                  <ul className="cart-list">{group.items.map(renderItem)}</ul>
                </div>
              ))}

              {outOfStockItems.length > 0 && (
                <div className="cart-section--outofstock">
                  <h2 className="cart-section__title">Agotados</h2>
                  <ul className="cart-list">{outOfStockItems.map(renderOutOfStockItem)}</ul>
                </div>
              )}
            </div>

            <div className="cart-summary">
              <label className="notes-field">
                Notas para tu pedido (opcional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Dirección, referencias, etc."
                />
              </label>

              <div className="cart-breakdown">
                <div className="cart-breakdown__row">
                  <span>Subtotal</span>
                  <span>{formatPrice(breakdown.subtotal)}</span>
                </div>
                {breakdown.wholesaleSavings > 0 && (
                  <div className="cart-breakdown__row cart-breakdown__row--discount">
                    <span>Descuento por mayoreo</span>
                    <span>-{formatPrice(breakdown.wholesaleSavings)}</span>
                  </div>
                )}
                {breakdown.discountSavings > 0 && (
                  <div className="cart-breakdown__row cart-breakdown__row--discount">
                    <span>Descuento en oferta</span>
                    <span>-{formatPrice(breakdown.discountSavings)}</span>
                  </div>
                )}
                {breakdown.collectionSavings > 0 && (
                  <div className="cart-breakdown__row cart-breakdown__row--discount">
                    <span>Descuento de colección</span>
                    <span>-{formatPrice(breakdown.collectionSavings)}</span>
                  </div>
                )}
                {breakdown.customerSavings > 0 && (
                  <div className="cart-breakdown__row cart-breakdown__row--discount">
                    <span>Descuento cliente frecuente</span>
                    <span>-{formatPrice(breakdown.customerSavings)}</span>
                  </div>
                )}
              </div>

              <div className="cart-total">
                <span>Total</span>
                <strong>{formatPrice(totalPrice)}</strong>
              </div>
              <p className="cart-total__hint">
                Los precios se confirman por WhatsApp; el mensaje enviado no incluye montos.
              </p>

              <button className="btn btn--whatsapp btn--block" onClick={handleSendOrder}>
                <WhatsappIcon /> ENVIAR PEDIDO POR WHATSAPP
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
