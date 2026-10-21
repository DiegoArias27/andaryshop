import { useNavigate } from 'react-router-dom'
import { usePackageBuilder } from '../../hooks/usePackageBuilder'
import type { ComboPartProgress, SelectedUnit } from '../../context/package-builder-context'
import type { Collection, WholesaleTier } from '../../api/types'
import { CloseIcon } from '../icons'
import { formatPrice } from '../../utils/currency'

interface ThumbVariant {
  variantId: number
  size: string
  colorName: string
  colorHex: string
  count: number
}

interface ThumbGroup {
  productId: number
  slug: string
  name: string
  image: string | null
  variants: ThumbVariant[]
}

/** One thumbnail per product instead of one per picked unit — repeats of
 * the exact same variant collapse into a single "×N" count, and different
 * sizes/colors of the same product list side by side (comma-separated)
 * inside that one thumbnail, instead of duplicating the whole photo. */
function groupSelectedForThumbs(selected: SelectedUnit[]): ThumbGroup[] {
  const groups: ThumbGroup[] = []
  for (const unit of selected) {
    let group = groups.find((g) => g.productId === unit.productId)
    if (!group) {
      group = { productId: unit.productId, slug: unit.slug, name: unit.name, image: unit.image, variants: [] }
      groups.push(group)
    }
    let variant = group.variants.find((v) => v.variantId === unit.variantId)
    if (!variant) {
      variant = { variantId: unit.variantId, size: unit.size, colorName: unit.colorName, colorHex: unit.colorHex, count: 0 }
      group.variants.push(variant)
    }
    variant.count += 1
  }
  return groups
}

/** "Falta 1 Gorra" / "Faltan 2 Playeras · 1 Gorra de regalo" — names exactly
 * what's still missing instead of a bare count, so the customer knows which
 * category to go to next without checking the page banner. */
function comboProgressLabel(progress: ComboPartProgress[]): string | null {
  const incomplete = progress.filter((p) => p.remaining > 0)
  if (incomplete.length === 0) return null
  const totalRemaining = incomplete.reduce((sum, p) => sum + p.remaining, 0)
  const verb = totalRemaining === 1 ? 'Falta' : 'Faltan'
  const pieces = incomplete.map((p) => `${p.remaining} ${p.part.category_name}${p.part.is_gift ? ' de regalo' : ''}`)
  return `${verb} ${pieces.join(' · ')}`
}

function relevantWholesaleTiers(collection: Collection, tiers: WholesaleTier[]): WholesaleTier[] {
  return tiers.filter((t) => t.category_id === collection.wholesale_category_id).sort((a, b) => a.min_qty - b.min_qty)
}

/** Wholesale has no single fixed target (any quantity is welcome, priced
 * per whichever range it lands in) — this names the NEXT better price
 * tier instead, and how many more pieces reach it. The bar's own fill
 * ratio is scoped to just that current-to-next span, so crossing into a
 * new tier visibly resets and starts filling toward the one after it,
 * instead of one bar stretched across every tier at once. Null once
 * already in the best (highest) tier — nothing further to work toward.
 *
 * `entryMinQty` is set when the customer started from one specific range
 * card (e.g. "4 a 5 piezas") instead of the collection's generic entry
 * point — they already committed to at least that bracket, so lower tiers
 * are dropped from consideration and the counter starts targeting this
 * tier's own threshold right away instead of the very first one. */
function wholesaleProgress(
  tiers: WholesaleTier[],
  selectedCount: number,
  entryMinQty?: number
): { label: string; ratio: number } | null {
  const scoped = entryMinQty != null ? tiers.filter((t) => t.min_qty >= entryMinQty) : tiers
  const next = scoped.find((t) => selectedCount < t.min_qty)
  if (!next) return null
  const remaining = next.min_qty - selectedCount
  const prevMin = [...scoped].reverse().find((t) => selectedCount >= t.min_qty)?.min_qty ?? entryMinQty ?? 0
  const span = next.min_qty - prevMin || next.min_qty
  return {
    label: `${remaining === 1 ? 'Falta' : 'Faltan'} ${remaining} para ${formatPrice(next.price_per_unit)} c/u`,
    ratio: Math.min(100, Math.max(0, ((selectedCount - prevMin) / span) * 100)),
  }
}

function wholesaleCurrentPriceLabel(tiers: WholesaleTier[], selectedCount: number): string | null {
  const current = [...tiers].reverse().find((t) => selectedCount >= t.min_qty)
  return current ? `Mejor precio: ${formatPrice(current.price_per_unit)} c/u` : null
}

/** Rendered once at the app shell level (like CartBubble/CartDrawer) so it
 * stays visible while the customer navigates to a product's detail page
 * mid-pick, instead of living inside the Catalog page component tree. */
export default function PackagePickerBar() {
  const {
    activeCollection,
    activeWholesaleTier,
    selected,
    target,
    finish,
    cancel,
    removeOne,
    comboPartProgress,
    wholesaleTiers,
  } = usePackageBuilder()
  const navigate = useNavigate()
  if (!activeCollection) return null

  function handleEditGroup(group: ThumbGroup) {
    const first = group.variants[0]
    navigate(`/producto/${group.slug}`, {
      state: { editSelection: { variantId: first.variantId, size: first.size, colorName: first.colorName } },
    })
  }

  // No single variant to attribute a tap to once several are grouped under
  // one photo — drops the most recently distinct one (last in the list),
  // same as removing one instance of it would via removeOne.
  function handleRemoveFromGroup(group: ThumbGroup) {
    const last = group.variants[group.variants.length - 1]
    removeOne(last.variantId)
  }

  const thumbGroups = groupSelectedForThumbs(selected)
  const comboLabel = activeCollection.pricing_mode === 'combo' ? comboProgressLabel(comboPartProgress) : null
  const isWholesale = activeCollection.pricing_mode === 'wholesale'
  const tiers = isWholesale ? relevantWholesaleTiers(activeCollection, wholesaleTiers) : []
  const wholesaleStep = isWholesale ? wholesaleProgress(tiers, selected.length, activeWholesaleTier?.min_qty) : null

  return (
    <div className="package-picker">
      {thumbGroups.length > 0 && (
        <div className="package-picker__thumbs">
          {thumbGroups.map((group) => (
            <div key={group.productId} className="package-picker__thumb">
              <button
                type="button"
                className="package-picker__thumb-img"
                onClick={() => handleEditGroup(group)}
                aria-label={`Editar ${group.name}`}
              >
                <span className="package-picker__thumb-photo">
                  {group.image ? <img src={group.image} alt="" /> : <span className="package-picker__thumb-placeholder" />}
                  <span className="package-picker__thumb-meta">
                    {group.variants.map((v, i) => (
                      <span key={v.variantId} className="package-picker__thumb-chip">
                        <span className="package-picker__thumb-color" style={{ backgroundColor: v.colorHex }} />
                        {v.size}
                        {v.count > 1 ? ` ×${v.count}` : ''}
                        {i < group.variants.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="package-picker__thumb-remove"
                onClick={() => handleRemoveFromGroup(group)}
                aria-label="Quitar de la selección"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="build-progress-pill">
        <span className="build-progress-pill__name">{activeCollection.name}</span>
        <div className="build-progress-pill__row">
          {target > 0 ? (
            <>
              <div className="build-progress-pill__bar">
                <div
                  className="build-progress-pill__fill"
                  style={{ width: `${Math.min(100, (selected.length / target) * 100)}%` }}
                />
              </div>
              <span>{comboLabel ?? `${selected.length} de ${target} seleccionados`}</span>
            </>
          ) : isWholesale ? (
            <>
              {wholesaleStep ? (
                <div className="build-progress-pill__bar">
                  <div className="build-progress-pill__fill" style={{ width: `${wholesaleStep.ratio}%` }} />
                </div>
              ) : null}
              <span>{wholesaleStep?.label ?? wholesaleCurrentPriceLabel(tiers, selected.length) ?? `${selected.length} seleccionado${selected.length === 1 ? '' : 's'}`}</span>
              <button type="button" className="build-progress-pill__done" onClick={finish} disabled={selected.length === 0}>
                Agregar al carrito
              </button>
            </>
          ) : (
            <>
              <span>{selected.length} seleccionado{selected.length === 1 ? '' : 's'}</span>
              <button type="button" className="build-progress-pill__done" onClick={finish} disabled={selected.length === 0}>
                Agregar al carrito
              </button>
            </>
          )}
          <button className="build-progress-pill__close" onClick={cancel} aria-label="Cancelar selección">
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
