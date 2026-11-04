import { useLocalStorage } from '../../hooks/useLocalStorage'
import { CloseIcon } from '../icons'

/** Shown once on the homepage until the customer dismisses it — a quick
 * pointer to the Cotizador (wholesale pricing) and an easy way to replay the
 * guided tour, instead of asking them to pick a size up front. */
export default function SizePreferenceModal() {
  const [dismissed, setDismissed] = useLocalStorage('andary-size-modal-dismissed', false)

  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
  }

  function startTour(mode: 'full' | 'cotizador') {
    setDismissed(true)
    localStorage.setItem('andary-tour-mode', mode)
    localStorage.removeItem('andary-tour-seen')
    // A full reload (not react-router navigate) — OnboardingTour has been
    // mounted since the app started and already read `andary-tour-seen` (and
    // `andary-tour-mode`) into its own state once; only a fresh mount picks
    // up the cleared/updated flags.
    window.location.href = '/'
  }

  return (
    <div className="size-modal-overlay" onClick={handleDismiss}>
      <div className="size-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="size-modal__close" onClick={handleDismiss} aria-label="Cerrar">
          <CloseIcon />
        </button>
        <h2>💡 ¿Compras por mayoreo?</h2>
        <p className="size-modal__quote-promo">
          Usa nuestro <strong>Cotizador</strong> y descubre el precio por pieza según cuánto pidas — mientras más
          juntas, menos pagas.
        </p>
        <button type="button" className="btn btn--primary size-modal__done" onClick={() => startTour('cotizador')}>
          Ver tutorial del Cotizador
        </button>
        <button type="button" className="btn btn--ghost size-modal__tutorial-btn" onClick={() => startTour('full')}>
          Ver tutorial de cómo comprar
        </button>
      </div>
    </div>
  )
}
