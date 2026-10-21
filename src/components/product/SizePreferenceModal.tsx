import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { Category } from '../../api/types'
import { useAccountSync } from '../../hooks/useAccountSync'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useSizePreference } from '../../hooks/useSizePreference'
import { CloseIcon } from '../icons'

/** Shown once on the homepage until the customer configures or dismisses
 * it — a per-category preferred size so quick-add/package picks (and, once
 * logged in, every device on the account) can skip asking every time. */
export default function SizePreferenceModal({ categories }: { categories: Category[] }) {
  const { sizeByCategory, setSizeForCategory } = useSizePreference()
  const { syncing } = useAccountSync()
  const [dismissed, setDismissed] = useLocalStorage('andary-size-modal-dismissed', false)
  const [sizesByCategory, setSizesByCategory] = useState<Record<string, string[]> | null>(null)

  useEffect(() => {
    // Waiting for `syncing` to settle first stops the customer from picking
    // a size while a logged-in account's own saved preference is still in
    // flight — otherwise that fetch can land afterward and silently
    // overwrite whatever they just chose (see AccountSync.tsx).
    if (dismissed || syncing || categories.length === 0) return
    api
      .getProducts()
      .then((products) => {
        const seen: Record<string, Set<string>> = {}
        for (const p of products) {
          if (!p.category_slug) continue
          const set = seen[p.category_slug] ?? (seen[p.category_slug] = new Set())
          for (const v of p.variants) set.add(v.size)
        }
        const result: Record<string, string[]> = {}
        for (const [slug, sizes] of Object.entries(seen)) result[slug] = [...sizes].sort()
        setSizesByCategory(result)
      })
      .catch(() => setSizesByCategory({}))
  }, [dismissed, syncing, categories.length])

  if (dismissed || syncing || !sizesByCategory) return null

  const categoriesWithSizes = categories.filter((c) => (sizesByCategory[c.slug]?.length ?? 0) > 0)
  if (categoriesWithSizes.length === 0) return null

  function handleDismiss() {
    setDismissed(true)
  }

  return (
    <div className="size-modal-overlay" onClick={handleDismiss}>
      <div className="size-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="size-modal__close" onClick={handleDismiss} aria-label="Cerrar">
          <CloseIcon />
        </button>
        <h2>Para mayor experiencia de uso, selecciona tu talla</h2>
        <p className="size-modal__hint">
          Así no tendrás que elegirla cada vez — se guarda en este dispositivo y, si inicias sesión, en tu cuenta.
        </p>
        <div className="size-modal__categories">
          {categoriesWithSizes.map((c) => (
            <div key={c.id} className="size-modal__category">
              <span className="size-modal__category-name">{c.name}</span>
              <div className="size-modal__sizes">
                {sizesByCategory[c.slug].map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`size-modal__chip ${sizeByCategory[c.slug] === size ? 'size-modal__chip--active' : ''}`}
                    onClick={() => setSizeForCategory(c.slug, size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--primary size-modal__done" onClick={handleDismiss}>
          Listo
        </button>
        <Link to="/cotizador" className="size-modal__quote-promo" onClick={handleDismiss}>
          💡 ¿Compras por mayoreo? Usa nuestro <strong>Cotizador</strong> y descubre el precio por pieza según cuánto pidas
        </Link>
      </div>
    </div>
  )
}
