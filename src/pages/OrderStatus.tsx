import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { PublicOrder } from '../api/types'
import Header from '../components/layout/Header'
import { BackIcon, CheckIcon, CopyIcon, WhatsappIcon } from '../components/icons'
import { formatPrice } from '../utils/currency'

const STATUS_LABELS: Record<PublicOrder['status'], string> = {
  pending: 'Pendiente de confirmación',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
}

const STATUS_HINTS: Record<PublicOrder['status'], string> = {
  pending: 'Ya llegó tu pedido — en cuanto lo confirmemos por WhatsApp verás el cambio aquí.',
  confirmed: '¡Tu pedido ya está confirmado!',
  cancelled: 'Este pedido fue cancelado.',
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso
  }
}

export default function OrderStatus() {
  const { token } = useParams<{ token: string }>()
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!token) return
    let ignore = false
    api
      .getOrderByToken(token)
      .then((data) => {
        if (ignore) return
        setOrder(data)
        setLoading(false)
      })
      .catch(() => {
        if (ignore) return
        setNotFound(true)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [token])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied or unavailable — the URL is still
      // right there in the address bar to copy by hand.
    }
  }

  function buildContactUrl() {
    const phone = import.meta.env.VITE_WHATSAPP_NUMBER
    const text = encodeURIComponent(`Hola! Tengo una pregunta sobre mi pedido #${order?.id}.`)
    return `https://wa.me/${phone}?text=${text}`
  }

  return (
    <div className="page page--order-status">
      <Header variant="home" />
      <div className="catalog-content">
        <div className="page-title-row">
          <Link to="/" className="icon-btn page-title-row__back" aria-label="Volver al catálogo">
            <BackIcon />
          </Link>
          <h1>{order ? `Pedido #${order.id}` : 'Tu pedido'}</h1>
        </div>

        {loading && <p className="state-msg">Cargando tu pedido…</p>}

        {notFound && !loading && (
          <div className="empty-state">
            <p>No encontramos este pedido — revisa que el link esté completo.</p>
            <Link to="/" className="btn btn--primary">
              Ir al catálogo
            </Link>
          </div>
        )}

        {order && !loading && (
          <div className="order-status">
            <div className={`order-status__banner order-status__banner--${order.status}`}>
              <span className="order-status__badge">{STATUS_LABELS[order.status]}</span>
              <p>{STATUS_HINTS[order.status]}</p>
            </div>

            <button type="button" className="btn btn--ghost btn--block" onClick={handleCopyLink}>
              {copied ? (
                <>
                  <CheckIcon /> Link copiado
                </>
              ) : (
                <>
                  <CopyIcon /> Copiar link de este pedido
                </>
              )}
            </button>

            <ul className="order-status__items">
              {order.items.map((item, i) => (
                <li key={i} className="order-status__item">
                  {item.image ? <img src={item.image} alt="" /> : <div className="order-status__item-placeholder" />}
                  <div className="order-status__item-info">
                    <span className="order-status__item-name">{item.name}</span>
                    <span className="order-status__item-meta">
                      {item.size && `Talla ${item.size}`}
                      {item.size && item.colorName && ' · '}
                      {item.colorName}
                      {item.isGift && <span className="tag-wholesale">Regalo</span>}
                      {item.isPreorder && <span className="badge badge--outofstock">Aviso de disponibilidad</span>}
                    </span>
                  </div>
                  <div className="order-status__item-price">
                    <span>x{item.quantity}</span>
                    <strong>{formatPrice(Math.max(0, item.unitPrice - item.discountAmount) * item.quantity)}</strong>
                  </div>
                </li>
              ))}
            </ul>

            <div className="order-status__total">
              <span>Total</span>
              <strong>{formatPrice(order.total)}</strong>
            </div>
            <p className="order-status__date">Pedido el {formatDate(order.createdAt)}</p>

            <a href={buildContactUrl()} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp btn--block">
              <WhatsappIcon /> PREGUNTAR POR WHATSAPP
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
