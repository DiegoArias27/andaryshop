import { Link, useLocation } from 'react-router-dom'
import { TagIcon } from '../icons'

/** Floating entry point into the Cotizador, mirroring CartBubble's fixed
 * circle (left side, so the two never collide) — replaces the old
 * "Cotizador" pill in CategoryPills, with a periodic ring-style wiggle so it
 * still catches the eye without a badge/count to lean on. Hidden on the
 * Cotizador page itself, same as PackagePickerBar. */
export default function CotizadorBubble() {
  const location = useLocation()
  if (location.pathname.startsWith('/cotizador')) return null

  return (
    <Link to="/cotizador" className="cotizador-bubble" aria-label="Abrir el Cotizador" data-tour="cotizador-bubble">
      <TagIcon />
    </Link>
  )
}
