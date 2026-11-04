/** Mirrors the real .cotizador-fields grid (a card per product type) while
 * the wholesale tiers/types are still loading. */
export default function CotizadorSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="cotizador-fields" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="cotizador-field">
          <div className="skeleton cotizador-skeleton__label" />
          <div className="skeleton cotizador-skeleton__stepper" />
        </div>
      ))}
    </div>
  )
}
