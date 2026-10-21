import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Collection, CollectionBundlePart, CollectionComboTier, Product, ProductVariant, WholesaleTier } from '../api/types'
import { useCart } from '../hooks/useCart'
import { isPackageCollection } from '../utils/collections'
import { productThumb } from '../utils/images'
import { PackageBuilderContext, type ComboPartProgress, type SelectedUnit } from './package-builder-context'

// combo: every part (paid or gift) is capped at its own required_qty, and
// the customer must fill each one specifically. unit/bundle parts (when
// configured) are pure eligibility filters with no individual cap — except
// a gift part, which is still capped (at 1, since there's no per-part qty
// field for those modes) since it's a free extra, not a normal pick.
function usesParts(collection: Collection): boolean {
  return (
    collection.pricing_mode === 'combo' ||
    ((collection.pricing_mode === 'unit' || collection.pricing_mode === 'bundle') && collection.bundle_parts.length > 0)
  )
}

/** Whether one bundle_part covers this product. A "cualquier producto" part
 * (is_specific false) matches any product in its category dynamically; a
 * "producto específico" part only matches products the admin has actually
 * curated into the collection (for that category) — chosen later in
 * "Gestionar productos", not pinned to one exact id from here. */
function partMatchesProduct(part: CollectionBundlePart, p: Product, curatedIds: Set<number>): boolean {
  if (part.category_id !== p.category_id) return false
  if (part.is_specific) return curatedIds.has(p.id)
  return true
}

/** Whether this product counts toward `collection` at all — explicitly
 * curated, wholesale's wildcard category, or (any mode with bundle_parts)
 * matching one of those parts. Pure/stateless so it can be reused both for
 * the collection currently being built and for arbitrary others (to find
 * which package a product not yet being built could start). */
function collectionMatchesProduct(collection: Collection, p: Product): boolean {
  if (collection.products.some((cp) => cp.id === p.id)) return true
  if (collection.pricing_mode === 'wholesale' && collection.wholesale_any_product) {
    return collection.wholesale_category_id == null || collection.wholesale_category_id === p.category_id
  }
  if (usesParts(collection)) {
    const curatedIds = new Set(collection.products.map((cp) => cp.id))
    return collection.bundle_parts.some((part) => partMatchesProduct(part, p, curatedIds))
  }
  return false
}

/** First part (from `parts`) this product could still fill (respecting each
 * part's own cap, given `selectedList` so far). Stateless — `selectedList`
 * is passed explicitly instead of closing over the live `selected` state, so
 * it can seed a brand-new build (empty list) as easily as extend an active
 * one. Takes an explicit `parts` list (rather than always reading
 * `collection.bundle_parts`) so a combo build scoped to one tier can pass
 * just that tier's parts. */
function findEligiblePartFrom(
  parts: CollectionBundlePart[],
  collection: Collection,
  selectedList: SelectedUnit[],
  p: Product
): CollectionBundlePart | null {
  const curatedIds = new Set(collection.products.map((cp) => cp.id))
  for (const part of parts) {
    if (!partMatchesProduct(part, p, curatedIds)) continue
    const isCapped = collection.pricing_mode === 'combo' || part.is_gift
    if (!isCapped) return part
    const filled = selectedList.filter((s) => s.partId === part.id).length
    if (filled < part.required_qty) return part
  }
  return null
}

function findEligiblePart(collection: Collection, selectedList: SelectedUnit[], p: Product): CollectionBundlePart | null {
  if (!usesParts(collection)) return null
  return findEligiblePartFrom(collection.bundle_parts, collection, selectedList, p)
}

/** The part this product matches, ignoring fill state — just to read its
 * is_gift flag (e.g. for the flat unit/bundle target's paid-vs-gift split). */
function findAnyMatchingPart(collection: Collection, p: Product): CollectionBundlePart | null {
  const curatedIds = new Set(collection.products.map((cp) => cp.id))
  return collection.bundle_parts.find((part) => partMatchesProduct(part, p, curatedIds)) ?? null
}

/** Which parts of a 'combo' collection are "in scope" right now: the active
 * tier's own parts when one was explicitly chosen (a tier-card), or — since
 * every combo collection has at least one tier — the collection's only tier
 * when there's just one (skipping the tier-card step entirely, same as a
 * single-part bundle). With 2+ tiers and none chosen yet, nothing is in
 * scope (the customer must pick a tier-card first). */
function comboTierParts(collection: Collection, activeComboTier: CollectionComboTier | null): CollectionBundlePart[] {
  const tier = activeComboTier ?? (collection.combo_tiers.length === 1 ? collection.combo_tiers[0] : null)
  if (!tier) return []
  return collection.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
}

export function PackageBuilderProvider({ children }: { children: ReactNode }) {
  const { addItem, openDrawer } = useCart()
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null)
  // Set only when the build was started from one specific priced bundle
  // tier (e.g. the "Gorras — 2 unidades por $800" tier-card) instead of the
  // whole collection — scopes picking to just that part's category/curation
  // and its own required_qty, instead of the collection's other parts.
  const [activePart, setActivePart] = useState<CollectionBundlePart | null>(null)
  // Set only when a 'combo' build was started from one specific tier-card
  // (a priced variant like "2 Playeras + 2 Gorras — $1380") — scopes picking
  // to just that tier's parts. Stays null for a single-tier combo, where
  // comboTierParts() falls back to that one tier automatically.
  const [activeComboTier, setActiveComboTier] = useState<CollectionComboTier | null>(null)
  // Set only when a 'wholesale' build was started from one specific range
  // card — see the field doc in package-builder-context.ts.
  const [activeWholesaleTier, setActiveWholesaleTier] = useState<WholesaleTier | null>(null)
  const [selected, setSelected] = useState<SelectedUnit[]>([])
  // Fetched once so any product, anywhere in the app, can be recognized as
  // belonging to a package even before the customer has pressed "Elige tus
  // productos" for it — otherwise only Catalog's own collection sections
  // (which fetch this themselves) would know.
  const [allCollections, setAllCollections] = useState<Collection[]>([])
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([])

  useEffect(() => {
    api.getCollections().then(setAllCollections).catch(() => {})
    api.getWholesaleTiers().then(setWholesaleTiers).catch(() => {})
  }, [])

  const target = !activeCollection
    ? 0
    : activeCollection.pricing_mode === 'bundle'
      ? (activePart ? activePart.required_qty : activeCollection.bundle_qty ?? 0)
      : activeCollection.pricing_mode === 'unit'
        ? activeCollection.unit_min_qty ?? 0
        : activeCollection.pricing_mode === 'combo'
          ? comboTierParts(activeCollection, activeComboTier).reduce((sum, p) => sum + p.required_qty, 0)
          : 0

  function countFor(variantId: number) {
    return selected.filter((s) => s.variantId === variantId).length
  }

  function eligiblePartFor(p: Product): CollectionBundlePart | null {
    if (!activeCollection) return null
    if (activePart) {
      const curatedIds = new Set(activeCollection.products.map((cp) => cp.id))
      if (!partMatchesProduct(activePart, p, curatedIds)) return null
      const filled = selected.filter((s) => s.partId === activePart.id).length
      return filled < activePart.required_qty ? activePart : null
    }
    if (activeCollection.pricing_mode === 'combo') {
      return findEligiblePartFrom(comboTierParts(activeCollection, activeComboTier), activeCollection, selected, p)
    }
    return findEligiblePart(activeCollection, selected, p)
  }

  function matchingPartFor(p: Product): CollectionBundlePart | null {
    if (!activeCollection) return null
    if (activePart) {
      const curatedIds = new Set(activeCollection.products.map((cp) => cp.id))
      return partMatchesProduct(activePart, p, curatedIds) ? activePart : null
    }
    if (activeCollection.pricing_mode === 'combo') {
      const curatedIds = new Set(activeCollection.products.map((cp) => cp.id))
      return comboTierParts(activeCollection, activeComboTier).find((part) => partMatchesProduct(part, p, curatedIds)) ?? null
    }
    return findAnyMatchingPart(activeCollection, p)
  }

  function isInActiveCollection(p: Product): boolean {
    if (!activeCollection) return false
    if (activePart) {
      const curatedIds = new Set(activeCollection.products.map((cp) => cp.id))
      return partMatchesProduct(activePart, p, curatedIds)
    }
    if (activeCollection.pricing_mode === 'combo') {
      const curatedIds = new Set(activeCollection.products.map((cp) => cp.id))
      return comboTierParts(activeCollection, activeComboTier).some((part) => partMatchesProduct(part, p, curatedIds))
    }
    return collectionMatchesProduct(activeCollection, p)
  }

  /** Every active package-type collection this product belongs to — purely
   * informational (a "Disponible en el paquete: X" mention the customer can
   * tap to jump to that collection's section), independent of whether a
   * build is in progress. Doesn't start or change anything by itself: the
   * customer still presses "Elige tus productos" there to actually build. */
  function packagesFor(p: Product): Collection[] {
    return allCollections.filter((c) => c.is_active && isPackageCollection(c) && collectionMatchesProduct(c, p))
  }

  const comboPartProgress: ComboPartProgress[] =
    activeCollection?.pricing_mode === 'combo'
      ? comboTierParts(activeCollection, activeComboTier).map((part) => {
          const picked = selected.filter((s) => s.partId === part.id).length
          return { part, picked, remaining: Math.max(0, part.required_qty - picked) }
        })
      : []

  function canPick(p: Product, v: ProductVariant): boolean {
    if (!activeCollection) return false
    if (!isInActiveCollection(p)) return false
    if (v.stock === 0) return false
    const count = countFor(v.id)
    if (count >= v.stock) return false
    if (target > 0 && selected.length >= target && count === 0) return false
    // A gift-flagged part is still a real slot within the flat target (just
    // priced at 0 in the cart, see pricing.ts) — it needs its own 1-unit cap
    // the same way combo parts do, since there's no per-part qty field for
    // unit/bundle to express that limit otherwise. A non-gift unit/bundle
    // part stays an uncapped eligibility filter, same as before.
    // A part-scoped tier build always caps at that part's own required_qty
    // (the whole point of picking one specific tier), not just when gifted.
    const needsPartCap = activeCollection.pricing_mode === 'combo' || !!activePart || !!matchingPartFor(p)?.is_gift
    if (usesParts(activeCollection) && needsPartCap && !eligiblePartFor(p) && count === 0) return false
    return true
  }

  function startBuilding(
    collection: Collection,
    part: CollectionBundlePart | null = null,
    comboTier: CollectionComboTier | null = null,
    wholesaleTier: WholesaleTier | null = null
  ) {
    setActiveCollection(collection)
    setActivePart(part)
    setActiveComboTier(comboTier)
    setActiveWholesaleTier(wholesaleTier)
    setSelected([])
  }

  function cancel() {
    setActiveWholesaleTier(null)
    setActiveCollection(null)
    setActivePart(null)
    setActiveComboTier(null)
    setSelected([])
  }

  function pick(p: Product, v: ProductVariant) {
    if (!canPick(p, v)) return
    let partId: number | null = null
    if (activeCollection!.pricing_mode === 'combo') {
      const part = eligiblePartFor(p)
      if (!part) return
      partId = part.id
    } else if (usesParts(activeCollection!)) {
      // unit/bundle: a product not matching any part (or matching a
      // non-gift one, which is an uncapped eligibility filter, not a slot to
      // fill) is still a perfectly normal pick — just untracked by any part.
      const part = eligiblePartFor(p)
      partId = part ? part.id : null
    }
    setSelected((prev) => [
      ...prev,
      {
        productId: p.id,
        variantId: v.id,
        slug: p.slug,
        name: p.name,
        price: parseFloat(p.price),
        image: productThumb(p),
        size: v.size,
        colorName: v.color_name,
        colorHex: v.color_hex,
        partId,
      },
    ])
  }

  /** Starts a build for `collection` AND performs the first pick(s) in one
   * atomic state update — used only where the caller already knows exactly
   * which collection this is (e.g. a card rendered inside that collection's
   * own homepage section), never from an ambiguous site-wide lookup. Building
   * off of `collection` and a freshly-built `units` list here (rather than
   * calling startBuilding then pick in sequence) sidesteps React's state
   * batching, which would otherwise still see the old (null) activeCollection
   * on the first pick. */
  function startBuildingAndPick(
    collection: Collection,
    p: Product,
    v: ProductVariant,
    count = 1,
    part: CollectionBundlePart | null = null,
    comboTier: CollectionComboTier | null = null
  ) {
    if (v.stock <= 0) return
    const curatedIds = new Set(collection.products.map((cp) => cp.id))
    const units: SelectedUnit[] = []
    const maxCount = Math.min(count, v.stock)
    const scopedComboParts = collection.pricing_mode === 'combo' ? comboTierParts(collection, comboTier) : null
    for (let i = 0; i < maxCount; i++) {
      let partId: number | null = null
      if (part) {
        if (!partMatchesProduct(part, p, curatedIds)) break
        const filled = units.filter((u) => u.partId === part.id).length
        if (filled >= part.required_qty) break
        partId = part.id
      } else if (scopedComboParts) {
        const eligible = findEligiblePartFrom(scopedComboParts, collection, units, p)
        if (!eligible) break
        partId = eligible.id
      } else if (usesParts(collection)) {
        const eligible = findEligiblePart(collection, units, p)
        partId = eligible ? eligible.id : null
      }
      units.push({
        productId: p.id,
        variantId: v.id,
        slug: p.slug,
        name: p.name,
        price: parseFloat(p.price),
        image: productThumb(p),
        size: v.size,
        colorName: v.color_name,
        colorHex: v.color_hex,
        partId,
      })
    }
    if (units.length === 0) return
    setActiveCollection(collection)
    setActivePart(part)
    setActiveComboTier(comboTier)
    setSelected(units)
  }

  function removeOne(variantId: number) {
    setSelected((prev) => {
      const idx = prev.findIndex((s) => s.variantId === variantId)
      if (idx === -1) return prev
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }

  function addSelectedToCart() {
    for (const unit of selected) {
      // A gift-part unit becomes its own cart line (see CartItem.isGift) —
      // never merged into a paid line of the same product/size/color, or the
      // free unit would just get blended into (and hidden inside) the paid
      // line's price and quantity.
      const isGift = !!activeCollection?.bundle_parts.find((part) => part.id === unit.partId)?.is_gift
      addItem({
        productId: unit.productId,
        slug: unit.slug,
        name: unit.name,
        price: unit.price,
        image: unit.image,
        size: unit.size,
        colorName: unit.colorName,
        colorHex: unit.colorHex,
        isGift,
      })
    }
    openDrawer()
  }

  function finish() {
    if (selected.length === 0) return
    addSelectedToCart()
    cancel()
  }

  // Once a fixed target is reached, add everything picked to the real cart
  // and reveal it — no extra "confirm" step needed, the count itself is the
  // ask. Wholesale mode (target === 0) always finishes manually instead.
  useEffect(() => {
    if (!activeCollection || target <= 0 || selected.length < target) return
    addSelectedToCart()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the in-progress pick state once the completed package has been added to the cart
    cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.length, target, activeCollection])

  return (
    <PackageBuilderContext.Provider
      value={{
        activeCollection,
        activePart,
        activeComboTier,
        activeWholesaleTier,
        selected,
        target,
        startBuilding,
        startBuildingAndPick,
        pick,
        removeOne,
        finish,
        cancel,
        countFor,
        eligiblePartFor,
        comboPartProgress,
        isInActiveCollection,
        packagesFor,
        canPick,
        wholesaleTiers,
      }}
    >
      {children}
    </PackageBuilderContext.Provider>
  )
}
