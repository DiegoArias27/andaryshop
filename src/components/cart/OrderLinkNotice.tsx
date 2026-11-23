import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RecordedOrder } from '../../utils/whatsapp'
import { CheckIcon, CloseIcon, CopyIcon } from '../icons'

/** Shown right after "Enviar pedido por WhatsApp" — a guest order has no
 * other way back to it afterward, so this is the one chance to hand over
 * the link before it's gone. A logged-in customer doesn't need any of
 * this (their order already shows up in Mi cuenta → Mis pedidos on its
 * own), so only the folio line renders for them. */
export default function OrderLinkNotice({
  order,
  loggedIn,
  onClose,
}: {
  order: RecordedOrder
  loggedIn: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/pedido/${order.token}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied or unavailable — the link is still
      // right there to select and copy by hand.
    }
  }

  return (
    <div className="order-link-notice">
      <button type="button" className="icon-btn order-link-notice__close" onClick={onClose} aria-label="Cerrar">
        <CloseIcon />
      </button>
      <p className="order-link-notice__title">¡Pedido #{order.id} enviado!</p>
      {loggedIn ? (
        <p className="order-link-notice__hint">Puedes verlo cuando quieras en Mi cuenta → Mis pedidos.</p>
      ) : (
        <>
          <p className="order-link-notice__hint">Guarda este link para ver el estado de tu pedido más tarde:</p>
          <div className="order-link-notice__link-row">
            <Link to={`/pedido/${order.token}`} className="order-link-notice__link">
              {url}
            </Link>
            <button
              type="button"
              className="icon-btn order-link-notice__copy"
              onClick={handleCopy}
              aria-label="Copiar link"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <Link to="/cuenta" className="order-link-notice__login">
            O inicia sesión para que tus pedidos se guarden solos →
          </Link>
        </>
      )}
    </div>
  )
}
