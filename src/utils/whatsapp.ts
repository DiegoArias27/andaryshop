import { api } from '../api/client'
import type { CartItem } from '../context/cart-context'

/** Opens a blank tab synchronously (within the click handler, before any
 * `await`) so it isn't caught by the browser's popup blocker, then hands
 * back a reference to redirect once the async work (recordOrder, below)
 * finishes — see goToWhatsapp. Deliberately does NOT pass 'noopener': per
 * spec, window.open with noopener/noreferrer always returns null, which
 * silently breaks this whole pattern (the tab opens blank and never
 * navigates anywhere). `opener` is cleared manually right after instead, to
 * still avoid handing wa.me a live reference back to this tab. */
export function openWhatsappTab(): Window | null {
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.opener = null
    } catch {
      // Some browsers make `opener` read-only — fine, the tab still works.
    }
  }
  return tab
}

/** Sends a previously-opened blank tab (see openWhatsappTab) to its real
 * destination. Falls back to a direct window.open if the tab never opened
 * (e.g. a strict popup blocker) — that one DOES need noopener/noreferrer,
 * since there's no follow-up navigation relying on keeping a reference. */
export function goToWhatsapp(tab: Window | null, url: string): void {
  if (tab) tab.location.href = url
  else window.open(url, '_blank', 'noopener,noreferrer')
}

/** What recordOrder (below) resolves to — null on failure. */
export interface RecordedOrder {
  id: number
  /** Unguessable token for the public /pedido/:token page — see
   * getOrderByToken on the backend. */
  token: string
}

// Prices are intentionally left out of the message: it's plain text the
// customer can edit before sending, so it must never be treated as a
// trustworthy price quote. Totals are confirmed by the seller over chat.
// Used to also link each line to its own /producto/:slug (wa.me can only
// pre-fill text, never attach a photo) — replaced by the one order-level
// link below, which now shows every item with its photo on one page
// instead of a link per line cluttering a multi-item message.
// `order` (from recordOrder below) lets the seller match this exact chat to
// the right row in Pedidos — without its id, two customers ordering the
// same thing look identical in the admin panel. Called "pedido #" in the
// message itself (not "folio") since that's the term a customer actually
// recognizes. Its token builds the one link in the message: the customer
// can reopen it later (or share it back with the seller) to see this exact
// order's status, without needing an account.
export function buildWhatsappOrderUrl(items: CartItem[], notes: string, order?: RecordedOrder | null): string {
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER

  const lines = [
    order ? `Hola! Quiero hacer el pedido #${order.id} en ANDARY SHOP:` : 'Hola! Quiero hacer un pedido en ANDARY SHOP:',
    '',
    ...items.map(
      (item) =>
        `• ${item.name} — Talla ${item.size}, Color ${item.colorName} x${item.quantity}` +
        (item.preorder ? ' (⚠ agotado — ¿me confirman fecha de disponibilidad?)' : '')
    ),
  ]

  if (notes.trim()) {
    lines.push('', `Notas: ${notes.trim()}`)
  }

  if (order) {
    lines.push('', `Para ver el estado de tu pedido: ${window.location.origin}/pedido/${order.token}`)
  }

  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${phone}?text=${text}`
}

/** Records the order in the admin's Pedidos page, right before sending it to
 * WhatsApp, and returns its id/token — the id becomes the folio in the
 * message (so the seller can match an incoming chat to the right row,
 * since two people ordering the same thing otherwise look identical in the
 * admin panel), the token becomes the /pedido/:token tracking link.
 * Best-effort: on failure returns null and the message just goes out
 * without either, since a logging hiccup must never block the customer's
 * actual WhatsApp message. Starts 'pending'; the admin confirms it (and
 * stock is deducted) from the panel. Takes the actually-charged unit price
 * per item (not item.price, which is only the raw catalog price — a
 * wholesale/collection/package discount can make the real price different)
 * so sales totals in the admin are accurate. An item already flagged
 * `preorder` (out of stock at add-time) is recorded as an availability
 * inquiry, not a real sale — shown distinctly in Pedidos and blocked from
 * confirming until restocked. */
export async function recordOrder(
  items: {
    item: CartItem
    unitPrice: number
    /** Defaults to item.quantity — set explicitly when this entry is only
     * PART of a cart line (see expandPricedItemForOrder), so a quantity that
     * spilled past a package/combo's cupo records as separate order lines at
     * each real price, instead of one row with a confusing blended average. */
    quantity?: number
    collectionId?: number
    collectionName?: string
    tierKey?: string | null
    isGift?: boolean
  }[],
  notes: string
): Promise<RecordedOrder | null> {
  try {
    const { id, token } = await api.createOrder({
      items: items.map(({ item, unitPrice, quantity, collectionId, collectionName, tierKey, isGift }) => ({
        productId: item.productId,
        size: item.size,
        colorName: item.colorName,
        name: item.name,
        image: item.image,
        unitPrice,
        quantity: quantity ?? item.quantity,
        isPreorder: !!item.preorder,
        isGift: !!isGift,
        collectionId,
        collectionName,
        tierKey,
      })),
      notes: notes.trim() || undefined,
    })
    return { id, token }
  } catch {
    return null
  }
}

/** A dedicated "notify me" message for an out-of-stock item — shorter and
 * clearly not an order, so the seller can tell it apart from a real pedido.
 * Still recorded in Pedidos (as a single preorder line) so it shows up
 * there too, tagged "Aviso de disponibilidad" instead of looking like a
 * regular pending sale. */
export function buildWhatsappNotifyUrl(
  item: { name: string; size: string; colorName: string },
  order?: RecordedOrder | null
): string {
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER

  const lines = [
    order
      ? `Hola! ¿Me pueden avisar cuando vuelva a haber stock de este producto? (pedido #${order.id})`
      : 'Hola! ¿Me pueden avisar cuando vuelva a haber stock de este producto?',
    '',
    `• ${item.name} — Talla ${item.size}, Color ${item.colorName}`,
  ]

  if (order) {
    lines.push('', `Para ver el estado de tu aviso: ${window.location.origin}/pedido/${order.token}`)
  }

  const text = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${phone}?text=${text}`
}
