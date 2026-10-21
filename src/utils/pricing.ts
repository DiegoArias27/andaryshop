import type { Collection, CollectionBundlePart, Product, WholesaleTier } from '../api/types'
import type { CartItem } from '../context/cart-context'

export function getProductQuantities(items: CartItem[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity)
  }
  return map
}

export function findTier(qty: number, tiers: WholesaleTier[]): WholesaleTier | null {
  return tiers.find((t) => qty >= t.min_qty && (t.max_qty === null || qty <= t.max_qty)) ?? null
}

/** The per-unit wholesale price for this line, only if it beats retail. */
export function getWholesalePrice(item: CartItem, productQty: number, tiers: WholesaleTier[]): number | null {
  const tier = findTier(productQty, tiers)
  if (!tier) return null
  const tierPrice = parseFloat(tier.price_per_unit)
  return tierPrice < item.price ? tierPrice : null
}

/** A straight product-level sale price (percent / fixed price / amount off). */
export function getProductDiscountPrice(product: Pick<Product, 'price' | 'discount_type' | 'discount_value'>): number | null {
  if (!product.discount_type || product.discount_value === null) return null
  const price = parseFloat(product.price)
  const value = parseFloat(product.discount_value)
  if (Number.isNaN(value)) return null

  let discounted: number
  if (product.discount_type === 'percent') discounted = price * (1 - value / 100)
  else if (product.discount_type === 'fixed_price') discounted = value
  else discounted = price - value

  discounted = Math.max(0, discounted)
  return discounted < price ? discounted : null
}

export interface ProductPromo {
  type: 'unit' | 'discount' | 'bundle'
  /** Per-unit price for 'unit'/'discount'; null for 'bundle' (pooled deal, no fixed unit price). */
  price: number | null
  collectionName: string
  collectionSlug: string
}

/** Derives the promo (if any) a product gets from being in an active,
 * priced collection — usable anywhere a product is shown (catalog card,
 * detail page, admin), without needing the full collections list. */
export function getCollectionPromo(product: Pick<Product, 'collections'>): ProductPromo | null {
  for (const c of product.collections ?? []) {
    if (c.discount_price) {
      return { type: 'discount', price: parseFloat(c.discount_price), collectionName: c.name, collectionSlug: c.slug }
    }
    if (c.pricing_mode === 'unit' && c.unit_price) {
      // A minimum quantity means the price isn't guaranteed for a single
      // unit — show it as an informational hint (like a bundle) instead of
      // asserting a price the customer might not actually get.
      if (c.unit_min_qty && c.unit_min_qty > 1) {
        return { type: 'bundle', price: null, collectionName: c.name, collectionSlug: c.slug }
      }
      return { type: 'unit', price: parseFloat(c.unit_price), collectionName: c.name, collectionSlug: c.slug }
    }
    if (c.pricing_mode === 'bundle' && c.bundle_qty && c.bundle_price) {
      return { type: 'bundle', price: null, collectionName: c.name, collectionSlug: c.slug }
    }
    // 'wholesale' has no fixed unit price (it depends on how much the
    // customer ends up picking) and 'combo' needs specific category quotas
    // met — both are informational hints only, like a bundle.
    if (c.pricing_mode === 'wholesale' || c.pricing_mode === 'combo') {
      return { type: 'bundle', price: null, collectionName: c.name, collectionSlug: c.slug }
    }
  }
  return null
}

/** The promo to show anywhere a product appears: an active collection's
 * pricing always wins — except a bundle deal, which doesn't count toward
 * that priority (it has no fixed unit price of its own), so the product's
 * own sale price is shown instead when it has one; the bundle only surfaces
 * when there's nothing else to show. */
export function getPromo(
  product: Pick<Product, 'collections' | 'price' | 'discount_type' | 'discount_value'>
): ProductPromo | null {
  const collectionPromo = getCollectionPromo(product)
  if (collectionPromo && collectionPromo.type !== 'bundle') return collectionPromo

  const discountPrice = getProductDiscountPrice(product)
  if (discountPrice !== null) {
    return { type: 'discount', price: discountPrice, collectionName: '', collectionSlug: '' }
  }
  return collectionPromo
}

export interface CollectionPriceInfo {
  collectionId: number
  collectionName: string
  pricingMode: Collection['pricing_mode']
  unitPrice: number | null
  unitMinQty: number | null
  bundleQty: number | null
  bundlePrice: number | null
  discountPrice: number | null
  bundleParts: CollectionBundlePart[]
  wholesaleCategoryId: number | null
  wholesaleAnyProduct: boolean
  /** Set only for a 'bundle' candidate scoped to one specific priced part
   * (its own "N unidades de esta categoría por $X" tier) instead of the
   * collection's flat bundle_qty/bundle_price pool — see
   * findBundlePartCandidates below. */
  bundlePartId: number | null
  /** Set only for a 'combo' candidate scoped to one specific tier (variant)
   * — see findComboTierCandidates below. Every 'combo' candidate has one
   * (combo has no flat/untiered pricing path anymore). */
  comboTierId: number | null
}

function toCollectionPriceInfo(
  collection: Collection,
  discountPrice: number | null = null,
  bundlePartId: number | null = null,
  comboTierId: number | null = null
): CollectionPriceInfo {
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    pricingMode: collection.pricing_mode,
    unitPrice: collection.unit_price ? parseFloat(collection.unit_price) : null,
    unitMinQty: collection.unit_min_qty,
    bundleQty: collection.bundle_qty,
    bundlePrice: collection.bundle_price ? parseFloat(collection.bundle_price) : null,
    discountPrice,
    bundleParts: collection.bundle_parts ?? [],
    wholesaleCategoryId: collection.wholesale_category_id,
    wholesaleAnyProduct: !!collection.wholesale_any_product,
    bundlePartId,
    comboTierId,
  }
}

/** First active collection (with pricing configured, or a per-product
 * discount) that a product belongs to. Collection pricing always wins over
 * wholesale/product discounts once found. */
export function buildCollectionPriceMap(collections: Collection[]): Map<number, CollectionPriceInfo> {
  const map = new Map<number, CollectionPriceInfo>()
  for (const collection of collections) {
    if (!collection.is_active) continue
    for (const product of collection.products) {
      if (map.has(product.id)) continue
      const discountPrice = product.collection_discount_price ? parseFloat(product.collection_discount_price) : null
      const hasPricing = collection.pricing_mode !== 'none' || discountPrice !== null
      if (!hasPricing) continue
      map.set(product.id, toCollectionPriceInfo(collection, discountPrice))
    }
  }
  return map
}

export type PriceSource = 'retail' | 'wholesale' | 'discount' | 'collection'

export interface PricedItem {
  item: CartItem
  effectivePrice: number
  source: PriceSource
  collectionId?: number
  collectionName?: string
  collectionPricingMode?: Collection['pricing_mode']
  /** Which specific tier within the collection this line actually used —
   * `bundle:<partId>`, `combo:<tierId>` or `wholesale:<wholesaleTierId>`.
   * Snapshotted onto the order so real sales (not just tier position) can
   * later decide which tier is genuinely "Más elegido" — see
   * Catalog.tsx's featuredTierIndex fallback. */
  tierKey?: string | null
  /** True when this line's collection pricing fully resolved to $0 — a
   * combo/bundle/unit "gift" slot (see is_gift on CollectionBundlePart).
   * Deliberately never set for a merely-cheap line (only an exact $0), since
   * that's also what keeps a partially-gift-blended line (see consumeBuckets)
   * from wrongly zeroing out real revenue when this gets recorded server-side. */
  isGift?: boolean
  /** Only set when this line's quantity spilled past a package/combo's cupo
   * and got blended across more than one real price (see consumeBuckets) —
   * e.g. [{quantity:2,price:100},{quantity:1,price:540}] for "2 fit the
   * package, 1 didn't". `effectivePrice` stays the blended average either
   * way (unchanged, still what the totals/order math use) — this is purely
   * for showing each real price on its own instead of one confusing
   * average. Absent (not a 1-item array) for the common, uniformly-priced
   * line. */
  priceBreakdown?: PriceSegment[]
}

export interface PriceSegment {
  quantity: number
  price: number
}

/** Resolves per-line prices for the whole cart in one pass: collection
 * pricing (unit price, per-product discount, or bundle pooling) always
 * wins; otherwise the cheapest of retail / product discount / wholesale
 * tier is used, mirroring the "never charge more than retail" rule. */
export function priceCart(
  items: CartItem[],
  tiers: WholesaleTier[],
  collections: Collection[],
  productDiscounts: Map<number, number>,
  productCategories: Map<number, number | null> = new Map(),
  /** A logged-in "cliente frecuente"'s flat per-unit discount (see
   * Customer.discountAmount) — applied on top of whatever price/source the
   * line already resolved to, same stacking rule the backend already uses
   * when a WhatsApp order is recorded (orders.controller.js's
   * loyaltyDiscount), just also shown live in the cart now. */
  customerDiscount = 0
): { pricedItems: PricedItem[]; breakdown: PriceBreakdown } {
  const collectionMap = buildCollectionPriceMap(collections)
  const productQuantities = getProductQuantities(items)

  // A wholesale collection with wholesale_any_product=true doesn't need its
  // products curated by hand — every product in wholesale_category_id (or
  // the whole catalog, when that's unset) counts, falling back to this only
  // for products not explicitly listed in any priced collection.
  const wildcardWholesaleByCategory = new Map<number, CollectionPriceInfo>()
  let wildcardWholesaleAny: CollectionPriceInfo | null = null
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'wholesale' || !collection.wholesale_any_product) continue
    const info = toCollectionPriceInfo(collection)
    if (collection.wholesale_category_id != null) {
      if (!wildcardWholesaleByCategory.has(collection.wholesale_category_id)) {
        wildcardWholesaleByCategory.set(collection.wholesale_category_id, info)
      }
    } else if (!wildcardWholesaleAny) {
      wildcardWholesaleAny = info
    }
  }

  // A "cualquier producto" part (is_specific false) isn't limited to the
  // collection's curated product list either — matched the same way as
  // ProductCard/PackageBuilderContext's isInActiveCollection, so the fix
  // applies consistently at pick time and at checkout time. A "producto
  // específico" part relies purely on curation (already covered by the
  // `collectionMap` explicit lookup above), so it's excluded here. Only
  // 'unit'/'bundle' use this path now (when that collection opted into parts
  // at all, i.e. bundle_parts.length > 0) — 'combo' is always tier-scoped,
  // handled entirely by findComboTierCandidates below instead.
  function findPartsFallbacks(categoryId: number, mode: Collection['pricing_mode']): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== mode || collection.bundle_parts.length === 0) continue
      // A 'bundle' part with its own price is handled as its own scoped tier
      // by findBundlePartCandidates below, not folded into the collection's
      // flat bundle_qty/bundle_price pool.
      const matches = collection.bundle_parts.some(
        (part) => !part.is_specific && part.category_id === categoryId && (mode !== 'bundle' || part.price === null)
      )
      if (matches) result.push(toCollectionPriceInfo(collection))
    }
    return result
  }

  /** Every priced part, across every active 'bundle' collection, whose
   * category matches this item — each one is its own independent tier ("N
   * unidades de esta categoría por $X"), so a single category can surface
   * several simultaneously (e.g. a 2-for-$800 tier and a 3-for-$1000 tier on
   * the same "Gorras" category); the best-price-wins loop below picks
   * whichever currently applies at the lowest price. */
  function findBundlePartCandidates(item: CartItem, categoryId: number): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
      for (const part of collection.bundle_parts) {
        if (part.price === null || part.category_id !== categoryId) continue
        if (part.is_specific) {
          const curatedIds = new Set(collection.products.map((p) => p.id))
          if (!curatedIds.has(item.productId)) continue
        }
        result.push(toCollectionPriceInfo(collection, null, part.id))
      }
    }
    return result
  }

  /** Every combo tier (variant), across every active 'combo' collection,
   * with a part matching this item's category — a collection with several
   * tiers on the same category (e.g. a 2-for-$1380 and a 3-for-$1970 combo,
   * both needing "Playeras") surfaces one candidate per tier, and the
   * best-price-wins loop below picks whichever currently applies cheapest. */
  function findComboTierCandidates(item: CartItem, categoryId: number): CollectionPriceInfo[] {
    const result: CollectionPriceInfo[] = []
    for (const collection of collections) {
      if (!collection.is_active || collection.pricing_mode !== 'combo') continue
      const curatedIds = new Set(collection.products.map((p) => p.id))
      for (const tier of collection.combo_tiers) {
        const matches = collection.bundle_parts.some((part) => {
          if (part.combo_tier_id !== tier.id || part.category_id !== categoryId) return false
          if (part.is_specific) return curatedIds.has(item.productId)
          return true
        })
        if (matches) result.push(toCollectionPriceInfo(collection, null, null, tier.id))
      }
    }
    return result
  }

  /** Every active collection this item could plausibly be priced under —
   * a product can genuinely qualify for several at once (e.g. a wildcard
   * combo AND a wildcard unit-price deal AND wholesale, simultaneously), and
   * whichever one isn't complete/met yet shouldn't shadow one that is. The
   * pricing pass below tries each and keeps whichever actually applies at
   * the lowest price, instead of committing to just the first match. */
  function resolveCollectionCandidates(item: CartItem): CollectionPriceInfo[] {
    const candidates: CollectionPriceInfo[] = []
    const seen = new Set<string>()
    function add(info: CollectionPriceInfo | null | undefined) {
      if (!info) return
      const key = `${info.collectionId}:${info.bundlePartId ?? ''}:${info.comboTierId ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      candidates.push(info)
    }
    add(collectionMap.get(item.productId))
    const categoryId = productCategories.get(item.productId)
    if (categoryId != null) {
      add(wildcardWholesaleByCategory.get(categoryId))
    }
    add(wildcardWholesaleAny)
    if (categoryId != null) {
      findPartsFallbacks(categoryId, 'unit').forEach(add)
      findPartsFallbacks(categoryId, 'bundle').forEach(add)
      findBundlePartCandidates(item, categoryId).forEach(add)
      findComboTierCandidates(item, categoryId).forEach(add)
    }
    return candidates
  }

  /** Whether this item matches a part explicitly flagged as a free gift on
   * its resolved collection — used by 'unit'/'bundle' pricing (combo has its
   * own bucket system below that already prices gift parts at 0). */
  function isGiftMatch(categoryId: number, info: CollectionPriceInfo): boolean {
    return info.bundleParts.some((part) => part.is_gift && part.category_id === categoryId)
  }


  // A category with its own tiers uses only those; everything else falls
  // back to the tiers left with no category (category_id === null).
  const fallbackTiers = tiers.filter((t) => t.category_id === null)
  const tiersByCategory = new Map<number, WholesaleTier[]>()
  for (const t of tiers) {
    if (t.category_id === null) continue
    if (!tiersByCategory.has(t.category_id)) tiersByCategory.set(t.category_id, [])
    tiersByCategory.get(t.category_id)!.push(t)
  }
  function tiersFor(productId: number): WholesaleTier[] {
    const categoryId = productCategories.get(productId)
    if (categoryId != null && tiersByCategory.has(categoryId)) return tiersByCategory.get(categoryId)!
    return fallbackTiers
  }

  /** This item's best price OUTSIDE of any combo/bundle-with-parts pooling —
   * a per-product discount, the combined-category wholesale pool, or a plain
   * per-product wholesale tier, whichever is cheapest, otherwise plain
   * retail. Used as the overflow price for a combo/bundle line that only
   * PARTLY fits its package's cupo (see consumeBuckets calls below) — the
   * units that don't fit still get whatever's genuinely their next-best
   * price (e.g. a 2nd gorra beyond a combo's single free slot should still
   * get the SAME combined-total pool price the Cotizador promises, not just
   * its own product's isolated quantity bracket), instead of always falling
   * back to full retail. References wholesaleCategoryFor/
   * globalWholesaleTierByCategory, both defined further below in this same
   * closure — safe since this is only ever CALLED later, inside the
   * pricedItems pass, well after those are initialized. Same exact rule the
   * bottom of the pricedItems loop already uses when NO collection applies
   * at all — kept here as its own function so both places agree. */
  function independentPrice(item: CartItem): number {
    const candidates = [item.price]
    const productQty = productQuantities.get(item.productId) ?? item.quantity
    const wholesalePrice = getWholesalePrice(item, productQty, tiersFor(item.productId))
    if (wholesalePrice !== null) candidates.push(wholesalePrice)
    const discountPrice = productDiscounts.get(item.productId) ?? null
    if (discountPrice !== null) candidates.push(discountPrice)
    const poolCategoryId = wholesaleCategoryFor(item)
    const poolTier = poolCategoryId != null ? globalWholesaleTierByCategory.get(poolCategoryId) : null
    if (poolTier) candidates.push(parseFloat(poolTier.price_per_unit))
    return Math.min(...candidates)
  }

  // GLOBAL WHOLESALE POOL: normally each 'wholesale' collection pools only
  // its own matching items (see wholesaleCollectionPrice further below) —
  // but when 2+ wholesale-configured categories (e.g. playeras, gorras)
  // have items in the SAME cart, their quantities combine into ONE shared
  // total, and EACH category then looks up its OWN tier for that shared
  // total (its own min_qty/max_qty brackets, same tier list as always —
  // only the qty fed into the lookup changes). With 0 or 1 participating
  // categories this collapses to exactly today's per-collection pooling
  // below, so the common case is unaffected. A collection with
  // wholesale_category_id === null (the whole-catalog wildcard / shared
  // fallback tiers) doesn't participate — it already spans everything, so
  // there's no second category to combine it with; it keeps using the
  // per-collection pooling below.
  //
  // Each item is attributed to at most ONE wholesale category — whichever
  // wholesale candidate resolveCollectionCandidates would try first (curated
  // collection membership beats a wildcard match, same precedence used
  // everywhere else in this file) — so an item that happens to qualify for
  // more than one wholesale collection is never double-counted into two
  // categories' totals.
  function primaryWholesaleCandidate(item: CartItem): CollectionPriceInfo | null {
    return resolveCollectionCandidates(item).find((c) => c.pricingMode === 'wholesale' && c.wholesaleCategoryId != null) ?? null
  }

  // Which category (if any) an item pools its wholesale quantity under — a
  // curated/wildcard 'wholesale' collection wins when one exists (it may
  // point at a different category, or carry its own product scoping), but a
  // category can have real wholesale_tiers rows with NO collection wrapping
  // it at all (e.g. Sudaderas/Pants/Paq. 3 Boss, priced only through the
  // Cotizador's own category dropdowns) — the Cotizador (tierPriceFor) pools
  // every one of those by category unconditionally, straight off the tiers
  // table, so the cart must fall back the same way instead of only pooling
  // the categories that happen to also have a "X Por Pieza" collection.
  function wholesaleCategoryFor(item: CartItem): number | null {
    const candidateCategoryId = primaryWholesaleCandidate(item)?.wholesaleCategoryId
    if (candidateCategoryId != null) return candidateCategoryId
    const categoryId = productCategories.get(item.productId)
    return categoryId != null && tiersByCategory.has(categoryId) ? categoryId : null
  }

  // Every category with its own wholesale_tiers rows is poolable — same
  // source of truth the Cotizador uses, independent of whether a collection
  // happens to wrap it.
  const globalWholesaleCategoryIds = new Set<number>(tiersByCategory.keys())

  const wholesaleCategoryQty = new Map<number, number>()
  for (const item of items) {
    const categoryId = wholesaleCategoryFor(item)
    if (categoryId == null) continue
    wholesaleCategoryQty.set(categoryId, (wholesaleCategoryQty.get(categoryId) ?? 0) + item.quantity)
  }

  const participatingCategoryIds = [...globalWholesaleCategoryIds].filter((id) => (wholesaleCategoryQty.get(id) ?? 0) > 0)

  // Null only when NO wholesale-eligible category has anything in the cart
  // right now. Even a single participating category still goes through this
  // same pool (pricing it off the combined total of every matching product
  // in that category, not just same-product-id lines) — the "combine with
  // OTHER categories" case naturally falls out of the same sum once 2+
  // participate, so there's exactly one code path for both instead of two.
  const combinedWholesaleQty =
    participatingCategoryIds.length >= 1
      ? participatingCategoryIds.reduce((sum, id) => sum + wholesaleCategoryQty.get(id)!, 0)
      : null

  // Per participating category, the tier the COMBINED total unlocks — null
  // means that category's own lowest min_qty still isn't reached even at
  // the combined total, so it falls back to normal pricing exactly as if
  // the global pool never triggered for it (each category's eligibility is
  // independent even though the qty fed into the lookup is shared).
  const globalWholesaleTierByCategory = new Map<number, WholesaleTier | null>()
  if (combinedWholesaleQty !== null) {
    for (const categoryId of participatingCategoryIds) {
      globalWholesaleTierByCategory.set(categoryId, findTier(combinedWholesaleQty, tiersByCategory.get(categoryId) ?? fallbackTiers))
    }
  }

  /** Non-null only for an item whose global-pool category resolved to a
   * tier above. This is fed into the pricedItems loop below as just ONE MORE
   * candidate in the same "keep whichever actually applies at the lowest
   * price" comparison every other pricing mode already competes in — a
   * combo/bundle deal that's genuinely better still wins on its own merits,
   * but one that happens to be WORSE than the volume discount this combined
   * total unlocks (e.g. a "2 playeras + 1 free gorra" combo priced higher
   * per playera than the Cotizador's own combined-total bracket for the same
   * 4 pieces) no longer traps the customer into it just because the cart
   * happens to also complete that combo — same "never beat retail" rule as
   * everywhere else, and an explicit admin-set per-product discount price is
   * never competed against (that's a deliberate manual pin). `info` is null
   * for a category with no backing collection at all (Sudaderas/Pants/Paq. 3
   * Boss) — the caller shows those as a plain 'wholesale' line instead of a
   * named collection, same as the item's own un-pooled wholesale price
   * would otherwise render. */
  function globalWholesaleOverride(item: CartItem): { info: CollectionPriceInfo | null; tier: WholesaleTier } | null {
    if (combinedWholesaleQty === null) return null
    if (collectionMap.get(item.productId)?.discountPrice != null) return null
    const effectiveCategoryId = wholesaleCategoryFor(item)
    if (effectiveCategoryId == null) return null
    const tier = globalWholesaleTierByCategory.get(effectiveCategoryId)
    if (!tier) return null
    const tierPrice = parseFloat(tier.price_per_unit)
    if (tierPrice >= item.price) return null
    return { info: primaryWholesaleCandidate(item), tier }
  }

  // Pre-compute bundle consumption per collection so mixed-product bundles
  // are shared fairly across the collection's cart lines, in item order.
  // Iterated straight from `collections` (not collectionMap) so a
  // parts-driven bundle with no curated products still gets a pool
  // computed, and totalQty is pooled via resolveCollectionCandidates so parts
  // (wildcard) matches count too, not just explicitly curated ones. A part
  // flagged "gift" reserves up to 1 of the completed bundle's slots to
  // price at 0 instead of splitting bundlePrice across it like the rest.
  const bundleRemaining = new Map<number, number>()
  const bundleGiftRemaining = new Map<number, number>()
  const bundleGiftPartsCount = new Map<number, number>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
    if (!collection.bundle_qty || !collection.bundle_price) continue
    if (bundleRemaining.has(collection.id)) continue
    const info = toCollectionPriceInfo(collection)
    const giftPartsCount = info.bundleParts.filter((p) => p.is_gift).length
    let totalQty = 0
    for (const item of items) {
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    const bundleUnits = Math.floor(totalQty / info.bundleQty!) * info.bundleQty!
    const giftUnits = Math.min(giftPartsCount, bundleUnits)
    bundleRemaining.set(collection.id, bundleUnits - giftUnits)
    bundleGiftRemaining.set(collection.id, giftUnits)
    bundleGiftPartsCount.set(collection.id, giftPartsCount)
  }

  // Each priced bundle part is its own independent tier pool — "N unidades
  // de esta categoría por $X" — separate from the collection-level
  // bundleRemaining above (which only ever covers parts with no price of
  // their own, or collections with no parts at all). Keyed by part id since
  // several priced parts can share the same category (different tiers).
  const bundlePartBuckets = new Map<number, ComboBucket>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'bundle') continue
    for (const part of collection.bundle_parts) {
      if (part.price === null || bundlePartBuckets.has(part.id)) continue
      const curatedIds = new Set(collection.products.map((p) => p.id))
      let have = 0
      for (const item of items) {
        const categoryId = productCategories.get(item.productId)
        if (categoryId !== part.category_id) continue
        if (part.is_specific && !curatedIds.has(item.productId)) continue
        have += item.quantity
      }
      const completeSets = part.required_qty > 0 ? Math.floor(have / part.required_qty) : 0
      const totalUnits = completeSets * part.required_qty
      const unitPrice = part.is_gift ? 0 : parseFloat(part.price) / part.required_qty
      bundlePartBuckets.set(part.id, { remaining: totalUnits, price: unitPrice })
    }
  }

  // A 'unit' collection with a minimum quantity only unlocks its price once
  // the cart holds at least that many units pooled across the collection's
  // products (mirrors how wholesale tiers gate on accumulated quantity).
  // Same iterate-from-`collections` + resolveCollectionCandidates pooling as
  // bundle above, for the same reason (parts-driven wildcard matching).
  const unitQualifies = new Map<number, boolean>()
  const unitGiftRemaining = new Map<number, number>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'unit' || !collection.unit_price) continue
    if (unitQualifies.has(collection.id)) continue
    const info = toCollectionPriceInfo(collection)
    unitGiftRemaining.set(collection.id, info.bundleParts.filter((p) => p.is_gift).length)
    if (!info.unitMinQty || info.unitMinQty <= 1) {
      unitQualifies.set(collection.id, true)
      continue
    }
    let totalQty = 0
    for (const item of items) {
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    unitQualifies.set(collection.id, totalQty >= info.unitMinQty)
  }

  // 'wholesale' collections have no price of their own — the pooled quantity
  // of the collection's products in the cart (mixed products count together,
  // unlike the per-product wholesale tiers below) is looked up against
  // wholesale_tiers rows for the collection's own wholesale_category_id (or
  // the fallback, no-category, rows when that's unset). Iterated straight
  // from `collections` (not collectionMap) so a wildcard collection with no
  // curated products still gets a pooled price computed.
  const wholesaleCollectionPrice = new Map<number, number | null>()
  const wholesaleTierIdByCollection = new Map<number, number | null>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'wholesale') continue
    if (wholesaleCollectionPrice.has(collection.id)) continue
    let totalQty = 0
    for (const item of items) {
      if (resolveCollectionCandidates(item).some((c) => c.collectionId === collection.id)) totalQty += item.quantity
    }
    const relevantTiers =
      collection.wholesale_category_id != null
        ? (tiersByCategory.get(collection.wholesale_category_id) ?? fallbackTiers)
        : fallbackTiers
    const tier = findTier(totalQty, relevantTiers)
    wholesaleCollectionPrice.set(collection.id, tier ? parseFloat(tier.price_per_unit) : null)
    wholesaleTierIdByCollection.set(collection.id, tier?.id ?? null)
  }

  // 'combo' collections require per-category quotas (e.g. 2 Playeras + 2
  // Gorras, maybe with a gift quota) to be met before a tier's price
  // applies. A "producto específico" part only counts products actually
  // curated into the collection (for its category) instead of any product
  // in that category. Every combo collection has at least one tier (see
  // CollectionComboTier) — for each tier, group its own parts by category
  // into ordered price buckets (gift parts price at 0), scaled to however
  // many complete sets the cart currently holds for THAT tier — items are
  // priced by draining the buckets they qualify for, in cart order, same
  // mutate-as-you-go pattern as bundleRemaining. Keyed by tier id (not
  // collection id) so a collection with several tiers on the same category
  // (e.g. 2-for-$1380 and 3-for-$1970, both needing Playeras) keeps each
  // tier's pool independent.
  interface ComboBucket {
    remaining: number
    price: number
  }
  const comboBucketsByTier = new Map<number, Map<number, ComboBucket[]>>()
  for (const collection of collections) {
    if (!collection.is_active || collection.pricing_mode !== 'combo') continue
    const curatedIds = new Set(collection.products.map((p) => p.id))

    for (const tier of collection.combo_tiers) {
      if (comboBucketsByTier.has(tier.id)) continue
      const tierParts = collection.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
      if (tierParts.length === 0) continue

      const tierPrice = parseFloat(tier.price)
      const paidParts = tierParts.filter((p) => !p.is_gift)
      const giftParts = tierParts.filter((p) => p.is_gift)
      const paidQtyPerSet = paidParts.reduce((sum, p) => sum + p.required_qty, 0)
      if (paidQtyPerSet === 0) continue

      // "Have" quantity for one part: a "específico" part only counts
      // curated products; a "cualquier producto" part counts the whole
      // category (this can overlap with a específico part's count, but that
      // only ever makes things a conservative underestimate, never an
      // overcharge, since actual allocation below still respects each
      // bucket's own scope).
      function haveFor(part: CollectionBundlePart): number {
        let have = 0
        for (const item of items) {
          if (!resolveCollectionCandidates(item).some((c) => c.comboTierId === tier.id)) continue
          const categoryId = productCategories.get(item.productId)
          if (categoryId !== part.category_id) continue
          if (part.is_specific && !curatedIds.has(item.productId)) continue
          have += item.quantity
        }
        return have
      }

      const byCategory = new Map<number, ComboBucket[]>()

      if (giftParts.length > 0) {
        // A "paquete de menudeo" (any combo tier with a free gift part) is
        // meant for a genuinely small, one-off purchase — not a stack of
        // complete sets bought in bulk. It tolerates exactly ONE paid unit
        // beyond its configured size (the tier's total price spreads across
        // the larger count instead, gift unchanged); two or more extra units
        // revokes the whole deal, gift included, so the entire quantity
        // falls through to plain Mayoreo instead of discounting a bulk
        // purchase as if it were still this small retail bundle.
        const totalPaidHave = paidParts.reduce((sum, p) => sum + haveFor(p), 0)
        const giftRequirementMet = giftParts.every((p) => haveFor(p) >= p.required_qty)
        const extra = totalPaidHave - paidQtyPerSet
        const dealApplies = totalPaidHave >= paidQtyPerSet && giftRequirementMet && extra <= 1
        const effectivePaidQty = paidQtyPerSet + Math.max(0, extra)
        const paidUnitPrice = tierPrice / effectivePaidQty

        if (dealApplies) {
          // Gift parts listed first within each category — a normal
          // (non-gift) cart line is allowed to draw from a completed
          // combo's free slot too (see cloneBuckets below), and
          // consumeBuckets drains buckets in array order, so this ordering
          // is what makes the free unit actually go first instead of being
          // tried only after the paid bucket runs out.
          for (const part of [...tierParts].sort((a, b) => Number(!a.is_gift) - Number(!b.is_gift))) {
            const list = byCategory.get(part.category_id) ?? []
            list.push({
              remaining: part.is_gift ? part.required_qty : haveFor(part),
              price: part.is_gift ? 0 : paidUnitPrice,
            })
            byCategory.set(part.category_id, list)
          }
        }
        // Else: leave byCategory empty — every matching item in this tier
        // falls through to whatever's otherwise its best price.
      } else {
        // No gift part: today's original behavior, unchanged — however many
        // COMPLETE sets the cart holds, each priced the same way, with no
        // upper cap (this is a flat bulk bundle, not a "menudeo" deal).
        let completeSets = Infinity
        for (const part of tierParts) {
          completeSets = Math.min(completeSets, Math.floor(haveFor(part) / part.required_qty))
        }
        if (!Number.isFinite(completeSets)) completeSets = 0
        const paidUnitPrice = tierPrice / paidQtyPerSet
        for (const part of tierParts) {
          const list = byCategory.get(part.category_id) ?? []
          list.push({ remaining: part.required_qty * completeSets, price: paidUnitPrice })
          byCategory.set(part.category_id, list)
        }
      }

      comboBucketsByTier.set(tier.id, byCategory)
    }
  }

  /** Drains `quantity` units across `buckets` in order (mutating their
   * remaining counts), pricing any leftover at `fallbackPrice`. Returns the
   * blended per-unit price for the whole line AND the actual segments that
   * blend came from (e.g. "2 at $100, 1 at $540" for a line that spills past
   * a package's cupo) — a single-segment result means the line was priced
   * uniformly, same as before this existed. */
  function consumeBuckets(
    quantity: number,
    buckets: ComboBucket[],
    fallbackPrice: number
  ): { price: number; segments: PriceSegment[] } {
    let qtyLeft = quantity
    let totalCost = 0
    const segments: PriceSegment[] = []
    for (const bucket of buckets) {
      if (qtyLeft <= 0) break
      if (bucket.remaining <= 0) continue
      const take = Math.min(qtyLeft, bucket.remaining)
      totalCost += take * bucket.price
      bucket.remaining -= take
      qtyLeft -= take
      segments.push({ quantity: take, price: bucket.price })
    }
    if (qtyLeft > 0) {
      totalCost += qtyLeft * fallbackPrice
      segments.push({ quantity: qtyLeft, price: fallbackPrice })
    }
    return { price: totalCost / quantity, segments }
  }

  /** Prices `item` as if it belonged to `info`, WITHOUT committing any pool
   * consumption yet — returns null if this candidate doesn't actually apply
   * (e.g. a combo whose quotas aren't met). `commit()` performs the real
   * drain against the live pools; call it only for whichever candidate ends
   * up winning, never for ones only used to compare prices. */
  function tryPriceForCandidate(
    item: CartItem,
    info: CollectionPriceInfo
  ): { price: number; segments?: PriceSegment[]; commit: () => void } | null {
    // A gift-flagged cart line (see CartItem.isGift) must only ever resolve
    // through a collection's own $0 gift-bucket path — the 'unit'/'bundle'-
    // with-bundleQty/'combo' branches below, each gated on item.isGift
    // internally. Everything else (a manual admin discount price, an
    // individually-priced bundle part, a plain wholesale tier) has no gift
    // concept at all, so it must never apply to a gift line or that $0 line
    // would get re-priced as a real sale.
    if (item.isGift) {
      const canBeGift = info.pricingMode === 'unit' || info.pricingMode === 'combo' || (info.pricingMode === 'bundle' && !!info.bundleQty)
      if (!canBeGift) return null
    }

    if (info.discountPrice !== null && !item.isGift) {
      return { price: info.discountPrice, commit: () => {} }
    }

    if (info.pricingMode === 'unit' && info.unitPrice !== null && unitQualifies.get(info.collectionId)) {
      const categoryId = productCategories.get(item.productId)
      const giftEligible = categoryId != null && isGiftMatch(categoryId, info)
      // A gift-flagged cart line (see CartItem.isGift) — from the real
      // package picker — represents an already-committed free unit and must
      // only ever draw from the $0 bucket, nothing else.
      if (item.isGift) {
        if (!giftEligible) return null
        const trialBuckets: ComboBucket[] = [{ remaining: unitGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
        if (!trialBuckets.some((b) => b.remaining > 0)) return null
        const trial = consumeBuckets(item.quantity, trialBuckets, info.unitPrice)
        return {
          price: trial.price,
          segments: trial.segments,
          commit: () => {
            const liveBuckets: ComboBucket[] = [{ remaining: unitGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
            consumeBuckets(item.quantity, liveBuckets, info.unitPrice!)
            unitGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
          },
        }
      }
      // A normal line — added straight from the product page, no picker
      // involved — gets the same auto-detected deal the paid part already
      // gets, and now ALSO auto-claims any still-available free gift slot
      // first: the customer shouldn't have to use the package picker just to
      // receive the freebie a completed deal already promises.
      const giftRemaining = giftEligible ? (unitGiftRemaining.get(info.collectionId) ?? 0) : 0
      if (giftRemaining <= 0) return { price: info.unitPrice, commit: () => {} }
      const trial = consumeBuckets(item.quantity, [{ remaining: giftRemaining, price: 0 }], info.unitPrice)
      return {
        price: trial.price,
        segments: trial.segments,
        commit: () => {
          const liveBuckets: ComboBucket[] = [{ remaining: unitGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
          consumeBuckets(item.quantity, liveBuckets, info.unitPrice!)
          unitGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
        },
      }
    }

    if (info.pricingMode === 'bundle' && info.bundlePartId != null) {
      const buildBucket = (): ComboBucket[] => {
        const b = bundlePartBuckets.get(info.bundlePartId!)
        return b ? [{ ...b }] : []
      }
      const trialBuckets = buildBucket()
      // A discrete "N piezas por $X" deal (as opposed to a wholesale-by-
      // quantity BRACKET, which already covers a whole range with one flat
      // price) only ever applies to a quantity it can cover OUTRIGHT — never
      // partially. Splitting it (e.g. "4 a $349.75 + 1 a $350" for a line of
      // 5 against a 4-pack deal) technically charges the right total, but
      // looks like a pricing mistake: the SAME line jumping between "one
      // clean price" and "two blended prices" as the quantity changes by
      // just one unit. Rejecting the candidate outright when it can't cover
      // the whole line lets it fall through to a smooth wholesale bracket
      // instead, which always covers any quantity with a single price.
      if (!trialBuckets.length || trialBuckets[0].remaining < item.quantity) return null
      const trial = consumeBuckets(item.quantity, trialBuckets, item.price)
      return {
        price: trial.price,
        segments: trial.segments,
        commit: () => {
          const liveBuckets = buildBucket()
          if (liveBuckets.length === 0) return
          consumeBuckets(item.quantity, liveBuckets, item.price)
          bundlePartBuckets.set(info.bundlePartId!, liveBuckets[0])
        },
      }
    }

    if (info.pricingMode === 'bundle' && info.bundleQty && info.bundlePrice) {
      const giftPartsCount = bundleGiftPartsCount.get(info.collectionId) ?? 0
      const paidQtyPerSet = Math.max(1, info.bundleQty - giftPartsCount)
      const bundleUnitPrice = info.bundlePrice / paidQtyPerSet
      const bundleCategoryId = productCategories.get(item.productId)
      const bundleGiftEligible = bundleCategoryId != null && isGiftMatch(bundleCategoryId, info)
      // A gift-flagged cart line (from the real package picker) represents
      // an already-committed free unit and must only ever draw from the $0
      // bucket, nothing else.
      if (item.isGift) {
        if (!bundleGiftEligible) return null
        const trialBuckets: ComboBucket[] = [{ remaining: bundleGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
        if (!trialBuckets.some((b) => b.remaining > 0)) return null
        const trial = consumeBuckets(item.quantity, trialBuckets, item.price)
        return {
          price: trial.price,
          segments: trial.segments,
          commit: () => {
            const liveBuckets: ComboBucket[] = [{ remaining: bundleGiftRemaining.get(info.collectionId) ?? 0, price: 0 }]
            consumeBuckets(item.quantity, liveBuckets, item.price)
            bundleGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
          },
        }
      }
      const trialBuckets: ComboBucket[] = [{ remaining: bundleRemaining.get(info.collectionId) ?? 0, price: bundleUnitPrice }]
      if (!trialBuckets.some((b) => b.remaining > 0)) return null
      // A normal line ALSO auto-claims any still-available free gift slot
      // first (same reasoning as the 'unit' branch above) — the paid bundle
      // bucket is tried after it, then genuine overflow falls to whichever
      // price is otherwise best for this product.
      const bundleGiftRemainingQty = bundleGiftEligible ? (bundleGiftRemaining.get(info.collectionId) ?? 0) : 0
      if (bundleGiftRemainingQty > 0) trialBuckets.unshift({ remaining: bundleGiftRemainingQty, price: 0 })
      const overflowPrice = independentPrice(item)
      const trial = consumeBuckets(item.quantity, trialBuckets, overflowPrice)
      return {
        price: trial.price,
        segments: trial.segments,
        commit: () => {
          const liveGiftRemaining = bundleGiftRemainingQty > 0 ? (bundleGiftRemaining.get(info.collectionId) ?? 0) : 0
          const liveBuckets: ComboBucket[] = [{ remaining: bundleRemaining.get(info.collectionId) ?? 0, price: bundleUnitPrice }]
          if (liveGiftRemaining > 0) liveBuckets.unshift({ remaining: liveGiftRemaining, price: 0 })
          consumeBuckets(item.quantity, liveBuckets, overflowPrice)
          if (liveGiftRemaining > 0) {
            bundleGiftRemaining.set(info.collectionId, liveBuckets[0].remaining)
            bundleRemaining.set(info.collectionId, liveBuckets[1].remaining)
          } else {
            bundleRemaining.set(info.collectionId, liveBuckets[0].remaining)
          }
        },
      }
    }

    if (info.pricingMode === 'wholesale') {
      const tierPrice = wholesaleCollectionPrice.get(info.collectionId) ?? null
      if (tierPrice === null || tierPrice >= item.price) return null
      return { price: tierPrice, commit: () => {} }
    }

    if (info.pricingMode === 'combo') {
      if (info.comboTierId == null) return null
      const categoryId = productCategories.get(item.productId)
      const cloneBuckets = (): ComboBucket[] | undefined => {
        const source = categoryId != null ? comboBucketsByTier.get(info.comboTierId!)?.get(categoryId) : undefined
        if (!source) return undefined
        // A gift-flagged cart line (from the real package picker) represents
        // an already-committed free unit and must only ever draw from the $0
        // bucket(s) — zeroed out (not filtered out) so the array keeps
        // `source`'s exact length/order, since commit() below writes back
        // into it by index. A normal line, on the other hand, now ALSO gets
        // to claim a completed combo's free slot automatically (byCategory
        // above lists gift buckets first, so consumeBuckets drains the free
        // one(s) before the paid one) — same auto-detected deal the paid
        // part already gets, without needing the package picker at all.
        return item.isGift ? source.map((b) => (b.price === 0 ? { ...b } : { ...b, remaining: 0 })) : source.map((b) => ({ ...b }))
      }
      const trialBuckets = cloneBuckets()
      const eligibleRemaining = trialBuckets?.reduce((sum, b) => sum + b.remaining, 0) ?? 0
      if (!trialBuckets || eligibleRemaining <= 0) return null
      // Same "overflow gets its own best price" rule as the bundle branches
      // above — but only for a paid line. An over-picked GIFT slot (more
      // gift units than the combo actually grants) has no sensible discount
      // to fall back to, so it stays at plain retail as a signal something's
      // off, same as before this existed.
      const overflowPrice = item.isGift ? item.price : independentPrice(item)
      const trial = consumeBuckets(item.quantity, trialBuckets, overflowPrice)
      return {
        price: trial.price,
        segments: trial.segments,
        commit: () => {
          const liveBuckets = cloneBuckets()
          if (!liveBuckets) return
          consumeBuckets(item.quantity, liveBuckets, overflowPrice)
          const source = comboBucketsByTier.get(info.comboTierId!)?.get(categoryId!)
          if (source) for (let i = 0; i < source.length; i++) source[i].remaining = liveBuckets[i].remaining
        },
      }
    }

    return null
  }

  const pricedItems: PricedItem[] = items.map((item) => {
    // GLOBAL WHOLESALE POOL: once wholesale-tiered categories combine to
    // reach a bracket, that bracket's per-unit price enters the SAME
    // "keep whichever applies at the lowest price" comparison as every other
    // candidate below — a genuinely better combo/bundle still wins on its
    // own merits, but the pool is no longer unconditionally skipped just
    // because the item could also be some combo/bundle's part, so a combo
    // that turns out WORSE than the pool no longer traps the customer into
    // it (see globalWholesaleOverride above for the full reasoning). Never
    // beats retail, and never competes against a manual per-product
    // discount (handled separately, below).
    let best: { price: number; segments?: PriceSegment[]; commit: () => void; info: CollectionPriceInfo | null; isPool: boolean } | null =
      null
    const globalOverride = globalWholesaleOverride(item)
    if (globalOverride) {
      best = { price: parseFloat(globalOverride.tier.price_per_unit), commit: () => {}, info: globalOverride.info, isPool: true }
    }

    // Try every collection this item could qualify for and keep whichever
    // actually applies at the lowest price — a combo that isn't complete
    // yet (or a wholesale tier that isn't reached) must never shadow a
    // different, currently-applicable deal on the same product. An explicit
    // admin-set discount price is authoritative and short-circuits the rest.
    for (const info of resolveCollectionCandidates(item)) {
      const result = tryPriceForCandidate(item, info)
      if (!result) continue
      if (!best || result.price < best.price) best = { ...result, info, isPool: false }
      if (info.discountPrice !== null) break
    }

    if (best) {
      best.commit()
      let tierKey: string | null = null
      if (best.isPool) tierKey = `wholesale:${globalOverride!.tier.id}`
      else if (best.info?.bundlePartId != null) tierKey = `bundle:${best.info.bundlePartId}`
      else if (best.info?.comboTierId != null) tierKey = `combo:${best.info.comboTierId}`
      else if (best.info?.pricingMode === 'wholesale') {
        const wholesaleTierId = wholesaleTierIdByCollection.get(best.info.collectionId)
        tierKey = wholesaleTierId != null ? `wholesale:${wholesaleTierId}` : null
      }
      // A pool win with no backing collection (Sudaderas/Pants/Paq. 3 Boss,
      // see wholesaleCategoryFor) shows as a plain 'wholesale' line (the
      // "Mayoreo" tag) instead of a named collection section.
      return {
        item,
        effectivePrice: best.price,
        source: best.isPool && !best.info ? 'wholesale' : 'collection',
        collectionId: best.info?.collectionId,
        collectionName: best.info?.collectionName,
        collectionPricingMode: best.isPool ? 'wholesale' : best.info?.pricingMode,
        tierKey,
        isGift: best.price === 0,
        priceBreakdown: best.segments && best.segments.length > 1 ? best.segments : undefined,
      }
    }

    const productQty = productQuantities.get(item.productId) ?? item.quantity
    const wholesalePrice = getWholesalePrice(item, productQty, tiersFor(item.productId))
    const discountPrice = productDiscounts.get(item.productId) ?? null

    if (discountPrice !== null && (wholesalePrice === null || discountPrice <= wholesalePrice)) {
      return { item, effectivePrice: discountPrice, source: 'discount' }
    }
    if (wholesalePrice !== null) {
      return { item, effectivePrice: wholesalePrice, source: 'wholesale' }
    }

    return { item, effectivePrice: item.price, source: 'retail' }
  })

  // effectivePrice deliberately stays the PRE-customer-discount, source-
  // resolved price — it's what gets recorded as unitPrice on a WhatsApp
  // order, and the backend re-applies the customer's discount itself from a
  // fresh DB lookup at that point (orders.controller.js's loyaltyDiscount),
  // so baking it in here too would double-apply it there. The aggregate
  // total below already reflects it; a per-line DISPLAY that also wants to
  // show the discounted price should subtract customerDiscount itself.
  return { pricedItems, breakdown: buildBreakdown(pricedItems, customerDiscount) }
}

export interface PriceBreakdown {
  subtotal: number
  wholesaleSavings: number
  discountSavings: number
  collectionSavings: number
  /** From a logged-in "cliente frecuente"'s standing discount — see
   * priceCart's customerDiscount parameter. */
  customerSavings: number
  total: number
}

export function buildBreakdown(pricedItems: PricedItem[], customerDiscount = 0): PriceBreakdown {
  let subtotal = 0
  let wholesaleSavings = 0
  let discountSavings = 0
  let collectionSavings = 0
  let customerSavings = 0

  for (const { item, effectivePrice, source } of pricedItems) {
    subtotal += item.price * item.quantity
    const savings = (item.price - effectivePrice) * item.quantity
    if (source === 'wholesale') wholesaleSavings += savings
    if (source === 'discount') discountSavings += savings
    if (source === 'collection') collectionSavings += savings
    // Capped at the line's own (pre-customer-discount) price, same
    // Math.max(0, ...) clamp the actual charged price gets — a heavily
    // discounted or gift line can't show more "savings" than it was worth.
    if (customerDiscount > 0) customerSavings += Math.min(effectivePrice, customerDiscount) * item.quantity
  }

  return {
    subtotal,
    wholesaleSavings,
    discountSavings,
    collectionSavings,
    customerSavings,
    total: subtotal - wholesaleSavings - discountSavings - collectionSavings - customerSavings,
  }
}

/** Expands one priced cart line into the order-recording entries it should
 * become — one per real price it charges. The common, uniformly-priced line
 * passes through unchanged; a line whose quantity spilled past a package/
 * combo's cupo (see PricedItem.priceBreakdown) becomes one entry per segment
 * instead, so the order recorded server-side shows the same clear per-price
 * lines the cart itself does, rather than one row with a blended average
 * unit price. */
export function expandPricedItemForOrder(p: PricedItem): { item: CartItem; unitPrice: number; quantity: number }[] {
  if (!p.priceBreakdown) return [{ item: p.item, unitPrice: p.effectivePrice, quantity: p.item.quantity }]
  return p.priceBreakdown.map((seg) => ({ item: p.item, unitPrice: seg.price, quantity: seg.quantity }))
}
