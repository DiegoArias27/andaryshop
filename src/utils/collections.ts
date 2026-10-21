import type { Collection } from '../api/types'

/** Whether this collection represents an actual "package" deal a customer
 * builds toward (as opposed to a plain curated list or an unconfigured
 * pricing mode) — used to decide whether a product should offer "Añadir a
 * la selección" and drive the package picker at all. */
export function isPackageCollection(c: Collection): boolean {
  // A collection can define its package purely through priced parts (one or
  // more "N unidades de esta categoría por $X" tiers) instead of — or in
  // addition to — the flat bundle_qty/bundle_price pool.
  if (c.pricing_mode === 'bundle')
    return (!!c.bundle_qty && !!c.bundle_price) || c.bundle_parts.some((p) => p.price !== null)
  // A real minimum-quantity threshold makes it a package on its own; even
  // without one (or with min 1, i.e. no real threshold), scoping it to
  // specific categories via parts (e.g. "cualquier Gorra o Playera a $129")
  // already makes it a curated package too.
  if (c.pricing_mode === 'unit') return !!c.unit_price && (!!(c.unit_min_qty && c.unit_min_qty > 1) || c.bundle_parts.length > 0)
  if (c.pricing_mode === 'wholesale') return true
  // Every real combo has at least one priced tier (see CollectionComboTier).
  if (c.pricing_mode === 'combo') return c.combo_tiers.length > 0
  return false
}
