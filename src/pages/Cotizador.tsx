import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Category, Collection, WholesaleTier } from '../api/types'
import Header from '../components/layout/Header'
import LoadingState from '../components/ui/LoadingState'
import { BackIcon, CheckIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/icons'
import { plaquePrice } from '../utils/currency'
import { usePackageBuilder } from '../hooks/usePackageBuilder'
import { useQuotes } from '../hooks/useQuotes'
import type { SavedQuote } from '../context/quotes-context'

/** Every category the calculator COULD show, in this order — matched by
 * slug against whatever `/api/categories` returns. A type only actually
 * renders once its matching category is effectively visible (show_in_nav
 * AND has real stock somewhere) — see visibleTypes below; a hidden or
 * currently-stockless one (e.g. Pants/Paq. 3 Boss before they have real
 * inventory) drops out of the calculator entirely instead of showing as a
 * quote-only, unpickable row. */
const QUOTE_TYPES: { slug: string; label: string; note?: string }[] = [
  { slug: 'playeras', label: 'Playeras' },
  { slug: 'gorras', label: 'Gorras' },
  { slug: 'sudaderas', label: 'Sudaderas' },
  { slug: 'pants', label: 'Pants' },
  { slug: 'paq-3-boss', label: 'Paq. 3 Boss', note: 'Cuenta como 3 pzas c/u' },
]

/** The price for `totalQty` combined pieces, from whichever bracket it falls
 * into — same "shared pool" idea Mayoreo already uses elsewhere on the site
 * (see pricing.ts's global wholesale pool): every type here is priced off
 * ONE combined total, not its own quantity alone, so mixing playeras, gorras,
 * etc. in the same order counts toward the same volume discount. */
function tierPriceFor(tiers: WholesaleTier[], categoryId: number, totalQty: number): number | null {
  if (totalQty <= 0) return null
  const relevant = [...tiers].filter((t) => t.category_id === categoryId).sort((a, b) => a.min_qty - b.min_qty)
  if (relevant.length === 0) return null
  for (const t of relevant) {
    if (totalQty >= t.min_qty && (t.max_qty === null || totalQty <= t.max_qty)) return Number(t.price_per_unit)
  }
  // Past every bracket's own max (shouldn't happen — the last one is always
  // unbounded) — fall back to the highest-quantity bracket's price.
  return Number(relevant[relevant.length - 1].price_per_unit)
}

export default function Cotizador() {
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<WholesaleTier[]>([])
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(QUOTE_TYPES.map((t) => [t.slug, 0]))
  )
  const { startBuilding } = usePackageBuilder()
  const { quotes, saveQuote, deleteQuote } = useQuotes()
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.getCategories(), api.getWholesaleTiers()])
      .then(([cats, tierData]) => {
        setCategories(cats)
        setTiers(tierData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const categoryBySlug = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories])
  // A category hidden (show_in_nav=0) or currently out of stock everywhere
  // (has_stock=0) drops out of the calculator entirely — no field, no table
  // column, no quote line — same effective-visibility rule the catalog
  // itself uses (see Catalog.tsx), so the Cotizador never promises a price
  // for something the shopper can't actually find or buy right now.
  const visibleTypes = useMemo(
    () => QUOTE_TYPES.filter((t) => {
      const c = categoryBySlug.get(t.slug)
      return !!c && !!c.show_in_nav && !!c.has_stock
    }),
    [categoryBySlug]
  )
  const totalPieces = Object.values(quantities).reduce((sum, n) => sum + n, 0)

  function setQty(slug: string, raw: number) {
    const value = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0
    setQuantities((prev) => ({ ...prev, [slug]: value }))
    setActiveQuoteId(null)
  }

  /** A saved quote only stores quantities, never a price — always recomputed
   * live against the current tiers, same as the active builder above, so it
   * never shows a stale number if Mayoreo pricing changes later. */
  function summarizeQuote(q: SavedQuote) {
    const qTotalPieces = Object.values(q.quantities).reduce((sum, n) => sum + (n || 0), 0)
    const qLines = visibleTypes.map((type) => {
      const category = categoryBySlug.get(type.slug)
      const qty = q.quantities[type.slug] ?? 0
      if (!category || qty <= 0) return null
      const price = tierPriceFor(tiers, category.id, qTotalPieces)
      if (price === null) return null
      return { label: type.label, qty, subtotal: price * qty }
    }).filter((l): l is NonNullable<typeof l> => !!l)
    return {
      totalPieces: qTotalPieces,
      total: qLines.reduce((sum, l) => sum + l.subtotal, 0),
      summary: qLines.map((l) => `${l.qty} ${l.label}`).join(', '),
    }
  }

  function handleSaveQuote() {
    if (totalPieces === 0) return
    saveQuote(quantities)
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 2000)
  }

  function handleResumeQuote(quote: SavedQuote) {
    setQuantities(Object.fromEntries(QUOTE_TYPES.map((t) => [t.slug, quote.quantities[t.slug] ?? 0])))
    setActiveQuoteId(quote.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleDeleteQuote(id: string) {
    deleteQuote(id)
    if (activeQuoteId === id) setActiveQuoteId(null)
  }

  const lines = visibleTypes.map((type) => {
    const category = categoryBySlug.get(type.slug)
    const qty = quantities[type.slug] ?? 0
    if (!category || qty <= 0) return null
    const price = tierPriceFor(tiers, category.id, totalPieces)
    if (price === null) return null
    return { ...type, category, qty, price, subtotal: price * qty }
  }).filter((l): l is NonNullable<typeof l> => !!l)

  const total = lines.reduce((sum, l) => sum + l.subtotal, 0)

  function tierRowsFor(slug: string) {
    const category = categoryBySlug.get(slug)
    if (!category) return []
    return [...tiers].filter((t) => t.category_id === category.id).sort((a, b) => a.min_qty - b.min_qty)
  }

  // Every distinct bracket boundary across all 5 types, so the table still
  // lines up correctly even if one type's brackets don't exactly match
  // another's (rather than assuming they're all in the same order).
  const canonicalRanges = useMemo(() => {
    const map = new Map<string, { min: number; max: number | null }>()
    for (const type of visibleTypes) {
      const category = categoryBySlug.get(type.slug)
      if (!category) continue
      for (const t of tiers.filter((row) => row.category_id === category.id)) {
        const key = `${t.min_qty}-${t.max_qty ?? 'inf'}`
        if (!map.has(key)) map.set(key, { min: t.min_qty, max: t.max_qty })
      }
    }
    return [...map.values()].sort((a, b) => a.min - b.min)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, categoryBySlug, visibleTypes])

  /** Feeds the quoted quantities into the SAME "elige tus productos" system
   * every real combo/bundle collection already uses (see
   * PackageBuilderContext + PackagePickerBar) — a synthetic, never-persisted
   * 'combo' collection with one part per quoted category, each capped at
   * its own quoted quantity. It only ever drives the picking/progress UI;
   * the actual price charged still comes from the real Mayoreo brackets
   * (pricing.ts), completely independent of this. */
  function handleStartPicking() {
    if (lines.length === 0) return
    const tierId = -1
    const collection: Collection = {
      id: -1,
      name: 'Tu cotización',
      slug: 'cotizacion',
      description: null,
      pricing_mode: 'combo',
      unit_price: null,
      unit_min_qty: null,
      bundle_qty: null,
      bundle_price: null,
      wholesale_category_id: null,
      wholesale_any_product: 0,
      allow_add_all_to_cart: 0,
      promo_text: null,
      banner_image_url: null,
      layout_json: null,
      image_focus_x: 50,
      image_focus_y: 50,
      is_active: 1,
      show_on_home: 0,
      limited_time: 0,
      limited_time_starts_at: null,
      limited_time_ends_at: null,
      sort_order: 0,
      products: [],
      bundle_parts: lines.map((l, i) => ({
        id: -(i + 1),
        category_id: l.category.id,
        category_name: l.category.name,
        category_slug: l.category.slug,
        product_id: null,
        is_specific: 0,
        required_qty: l.qty,
        price: null,
        is_gift: 0,
        combo_tier_id: tierId,
      })),
      combo_tiers: [{ id: tierId, price: String(total), sort_order: 0 }],
      most_chosen_tier_key: null,
    }
    startBuilding(collection)
    // A resumed saved quote is considered "in progress" once its products
    // are being picked — the exact fulfillment moment isn't observable here
    // (PackageBuilderContext is generic, shared by every real collection
    // too), so this is the simplest faithful proxy for "hasta que... haga el
    // pedido de la cotización".
    if (activeQuoteId) {
      deleteQuote(activeQuoteId)
      setActiveQuoteId(null)
    }
    navigate('/')
  }

  return (
    <div className="page page--cotizador">
      <Header variant="home" />
      <div className="cotizador-content">
        <div className="page-title-row">
          <Link to="/" className="icon-btn page-title-row__back" aria-label="Volver al catálogo">
            <BackIcon />
          </Link>
          <h1>Cotizador</h1>
        </div>

        {loading && <LoadingState />}

        {!loading && (
          <div className="cotizador-grid">
            <div className="cotizador-fields">
              {visibleTypes.map((type) => (
                <div key={type.slug} className="cotizador-field">
                  <div className="cotizador-field__info">
                    <span className="cotizador-field__label">{type.label}</span>
                    {type.note && <span className="cotizador-field__note">{type.note}</span>}
                  </div>
                  <div className="cotizador-field__stepper">
                    <button
                      type="button"
                      onClick={() => setQty(type.slug, (quantities[type.slug] ?? 0) - 1)}
                      aria-label={`Restar ${type.label}`}
                    >
                      <MinusIcon />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={quantities[type.slug] === 0 ? '' : quantities[type.slug]}
                      placeholder="0"
                      onChange={(e) => setQty(type.slug, e.target.value === '' ? 0 : Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => setQty(type.slug, (quantities[type.slug] ?? 0) + 1)}
                      aria-label={`Sumar ${type.label}`}
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="cotizador-total-pieces">
              Piezas totales combinadas: <strong>{totalPieces}</strong>
            </p>

            <div className="cotizador-table-wrap">
              <table className="cotizador-table">
                <thead>
                  <tr>
                    {visibleTypes.map((type) => (
                      <th key={type.slug}>{type.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {canonicalRanges.map((range) => {
                    const active = totalPieces >= range.min && (range.max === null || totalPieces <= range.max)
                    const rangeLabel = range.max ? `${range.min} a ${range.max}` : `${range.min} a 100`
                    return (
                      <tr key={`${range.min}-${range.max ?? 'inf'}`}>
                        {visibleTypes.map((type) => {
                          const row = tierRowsFor(type.slug).find((t) => t.min_qty === range.min && t.max_qty === range.max)
                          if (!row) return <td key={type.slug} />
                          return (
                            <td key={type.slug} className={active ? 'cotizador-table__cell--active' : ''}>
                              <div className="cotizador-table__cell">
                                <span className="cotizador-table__range">{rangeLabel}</span>
                                <span className="cotizador-table__price">{plaquePrice(row.price_per_unit)}</span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Link to="/?paquetes=1" className="cotizador-packages-promo">
              <span>¿Sabías que también tenemos paquetes ya armados con precio especial?</span>
              <strong>Ver paquetes →</strong>
            </Link>

            <div className="cotizador-summary">
              <h2>Tu cotización</h2>
              {lines.length === 0 ? (
                <p className="state-msg">Elige cuántas piezas de cada tipo quieres para ver tu precio.</p>
              ) : (
                <>
                  <ul className="cotizador-summary__list">
                    {lines.map((l) => (
                      <li key={l.slug}>
                        <span>
                          {l.qty} {l.label} × {plaquePrice(l.price)}
                        </span>
                        <strong>{plaquePrice(l.subtotal)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="cotizador-summary__total">
                    <span>Total</span>
                    <strong>{plaquePrice(total)}</strong>
                  </div>
                  <button
                    type="button"
                    className={`btn btn--block ${justSaved ? 'btn--saved' : 'btn--ghost'}`}
                    onClick={handleSaveQuote}
                    disabled={justSaved}
                  >
                    {justSaved ? (
                      <>
                        <CheckIcon /> ¡Guardada!
                      </>
                    ) : activeQuoteId ? (
                      'Guardar como nueva cotización'
                    ) : (
                      'Guardar esta cotización'
                    )}
                  </button>
                </>
              )}
            </div>

            {quotes.length > 0 && (
              <div className="cotizador-saved">
                <h2>Cotizaciones guardadas</h2>
                <ul className="cotizador-saved__list">
                  {quotes.map((q) => {
                    const s = summarizeQuote(q)
                    return (
                      <li key={q.id} className={activeQuoteId === q.id ? 'cotizador-saved__item--active' : ''}>
                        <div className="cotizador-saved__info">
                          <span className="cotizador-saved__pieces">{s.summary || `${s.totalPieces} piezas`}</span>
                          <strong>{plaquePrice(s.total)}</strong>
                        </div>
                        <div className="cotizador-saved__actions">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleResumeQuote(q)}>
                            Continuar
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn--ghost"
                            onClick={() => handleDeleteQuote(q.id)}
                            aria-label="Eliminar cotización guardada"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        {/* Reserves the space the fixed footer below covers, so the last bit
            of scrollable content (the packages promo / saved quotes) is
            never hidden behind it. */}
        {lines.length > 0 && <div className="cotizador-footer-spacer" aria-hidden="true" />}
      </div>

      {lines.length > 0 && (
        <div className="cotizador-footer">
          <div className="cotizador-footer__inner">
            <div className="cotizador-footer__total">
              <span>Total</span>
              <strong>{plaquePrice(total)}</strong>
            </div>
            {lines.length > 0 && (
              <button type="button" className="btn btn--primary" onClick={handleStartPicking}>
                Elegir productos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
