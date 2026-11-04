import { CloseIcon } from '../icons'

function startTour(mode: 'full' | 'cotizador') {
  localStorage.setItem('andary-tour-mode', mode)
  localStorage.removeItem('andary-tour-seen')
  // A full reload (not react-router navigate) — OnboardingTour has been
  // mounted since the app started and already read `andary-tour-seen` (and
  // `andary-tour-mode`) into its own state once; only a fresh mount picks
  // up the cleared/updated flags.
  window.location.href = '/'
}

/** The "which tutorial?" choice, as its own standalone modal — used from Mi
 * cuenta's "Ver el tutorial de nuevo" button. Mirrors the same two options
 * SizePreferenceModal offers on first visit, just without that modal's
 * first-visit-only Cotizador promo copy around them. */
export default function TutorialChoiceModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="size-modal-overlay" onClick={onClose}>
      <div className="size-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="size-modal__close" onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </button>
        <h2>¿Qué tutorial quieres ver?</h2>
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
