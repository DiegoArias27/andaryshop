import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type {
  Banner,
  Category,
  Collection,
  CollectionBundlePart,
  CollectionComboTier,
  PackagesTile,
  PageLayoutEntry,
  Product,
  WholesaleTier,
} from '../api/types'
import Header from '../components/layout/Header'
import Hero from '../components/product/Hero'
import BannerLayoutElements from '../components/product/BannerLayoutElements'
import CategoryPills from '../components/product/CategoryPills'
import FilterMenu from '../components/product/FilterMenu'
import SizePreferenceModal from '../components/product/SizePreferenceModal'
import ProductCard from '../components/product/ProductCard'
import Pagination from '../components/product/Pagination'
import { CloseIcon, SearchIcon } from '../components/icons'
import ProductGridSkeleton from '../components/product/ProductGridSkeleton'
import { useCart } from '../hooks/useCart'
import { usePackageBuilder } from '../hooks/usePackageBuilder'
import { useSizePreference } from '../hooks/useSizePreference'
import { useCatalogFilters } from '../hooks/useCatalogFilters'
import { useToast } from '../hooks/useToast'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { toCardData } from '../utils/productCard'
import { productThumb } from '../utils/images'
import { formatPrice, plaquePrice } from '../utils/currency'
import { scrimGradient, backgroundSizeFor, useBannerDevice } from '../utils/bannerLayout'
import { isPackageCollection } from '../utils/collections'
import type { ComboPartProgress } from '../context/package-builder-context'
import type { SizePreferences } from '../context/size-preference-context'

/** The size to auto-pick for this exact product's quick-add: an explicit
 * Talla filter always wins (an in-session choice already made); otherwise
 * fall back to the customer's saved per-category preference, if any. */
function resolveAutoSize(filterSize: string | null, product: Product, sizeByCategory: SizePreferences): string | null {
  if (filterSize) return filterSize
  return product.category_slug ? (sizeByCategory[product.category_slug] ?? null) : null
}

const PAGE_SIZE_DESKTOP = 24
const PAGE_SIZE_MOBILE = 8
const SECTION_PREVIEW_CAP = 11

function tierRangeLabel(t: WholesaleTier, categoryName?: string | null): string {
  const base = t.max_qty ? `${t.min_qty} a ${t.max_qty} piezas` : `${t.min_qty} piezas o más`
  return categoryName ? `${base} de ${categoryName}` : base
}


/** Which tier index (0-based) gets the "Más elegido" treatment when there's
 * no sales data yet to go on — the second-to-last tier (a common "best
 * value, one step short of the biggest" placement), skipped entirely under
 * 3 tiers where that distinction isn't meaningful. */
function featuredTierIndex(total: number): number {
  return total >= 3 ? total - 2 : -1
}

/** Real confirmed sales (collection.most_chosen_tier_key, snapshotted per
 * order line as 'bundle:<id>' | 'combo:<id>' | 'wholesale:<id>') decide the
 * "Más elegido" ribbon once there's any — a brand-new collection with no
 * sales yet falls back to the position heuristic above. A wholesale tier's
 * own admin-set `is_featured` flag outranks both: once ANY tier in the list
 * has it set, the automatic pick (sales-data or positional) is suppressed
 * entirely for the rest, so there's never two ribbons showing at once. */
function isTierFeatured(
  collection: Collection,
  tierKey: string,
  index: number,
  total: number,
  manualFeatured = false,
  anyManualFeatured = false
): boolean {
  if (anyManualFeatured) return manualFeatured
  if (collection.most_chosen_tier_key) return collection.most_chosen_tier_key === tierKey
  return index === featuredTierIndex(total)
}

/** A pricing-tier card — every pricing-mode (wholesale ranges, priced bundle
 * parts, combo tiers) renders through this one component so the look stays
 * consistent everywhere. One tier per collection can be marked `featured`
 * (see featuredTierIndex) to stand out as the recommended pick. */
function TierCard({
  range,
  price,
  caption,
  featured,
  onSelect,
}: {
  range: string
  price: string
  caption?: ReactNode
  featured: boolean
  onSelect: () => void
}) {
  return (
    <div className={`tier-card ${featured ? 'tier-card--featured' : ''}`}>
      {featured && <span className="tier-card__ribbon">Más elegido</span>}
      <p className="tier-card__title">{range}</p>
      <p className="tier-card__price">{price}</p>
      {caption && <p className="tier-card__caption">{caption}</p>}
      <button type="button" className="btn btn--primary btn--sm tier-card__cta" onClick={onSelect}>
        Seleccionar productos
      </button>
    </div>
  )
}

/** Which top-nav categories are relevant to the collection currently being
 * assembled, so CategoryPills can flag them. For combo, only parts that
 * still need units stay highlighted — it shifts to the next category as
 * each one gets completed. */
function relevantCategorySlugs(
  collection: Collection,
  categories: Category[],
  comboPartProgress: ComboPartProgress[],
  activePart: CollectionBundlePart | null
): Set<string> {
  if (activePart) return new Set([activePart.category_slug])
  if (collection.pricing_mode === 'combo') {
    return new Set(comboPartProgress.filter((p) => p.remaining > 0).map((p) => p.part.category_slug))
  }
  if (collection.pricing_mode === 'wholesale') {
    if (collection.wholesale_category_id == null) return new Set()
    const slug = categories.find((c) => c.id === collection.wholesale_category_id)?.slug
    return slug ? new Set([slug]) : new Set()
  }
  if (collection.bundle_parts.length > 0) {
    return new Set(collection.bundle_parts.map((p) => p.category_slug))
  }
  return new Set(collection.products.map((p) => p.category_slug).filter((s): s is string => !!s))
}

/** Every category name relevant to this collection — used for the "Ve a la
 * sección de X y elige" toast shown right when a build starts, alongside
 * the pulsing CategoryPills highlight. */
function relevantCategoryNames(collection: Collection, categories: Category[]): string[] {
  if (collection.pricing_mode === 'wholesale') {
    if (collection.wholesale_category_id == null) return []
    const name = categories.find((c) => c.id === collection.wholesale_category_id)?.name
    return name ? [name] : []
  }
  if (collection.bundle_parts.length > 0) {
    return [...new Set(collection.bundle_parts.map((p) => p.category_name))]
  }
  const slugs = new Set(collection.products.map((p) => p.category_slug).filter((s): s is string => !!s))
  return [...slugs]
    .map((slug) => categories.find((c) => c.slug === slug)?.name)
    .filter((n): n is string => !!n)
}

/** "Ve a la sección de X y elige" / "Ve a las secciones de X y Y y elige" —
 * shared by the whole-collection toast and any tier-scoped one (a bundle
 * part or combo tier, each naming just its own category/categories). */
function toastMessageForCategoryNames(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `Ve a la sección de ${names[0]} y elige`
  return `Ve a las secciones de ${names.join(' y ')} y elige`
}

function startBuildingToastMessage(collection: Collection, categories: Category[]): string | null {
  return toastMessageForCategoryNames(relevantCategoryNames(collection, categories))
}

/** The one category this collection's "Ver más" tile should send the
 * customer to — the wholesale-scoped category for wholesale mode, the
 * shared category across a combo's parts, or whichever single category all
 * its curated products share; null when the collection spans more than one
 * (no single obvious destination). */
function primaryCategorySlug(collection: Collection, categories: Category[]): string | null {
  if (collection.pricing_mode === 'wholesale' && collection.wholesale_category_id != null) {
    return categories.find((c) => c.id === collection.wholesale_category_id)?.slug ?? null
  }
  if (collection.bundle_parts.length > 0) {
    const partSlugs = new Set(collection.bundle_parts.map((p) => p.category_slug))
    if (partSlugs.size === 1) return [...partSlugs][0]
  }
  const slugs = new Set(collection.products.map((p) => p.category_slug).filter((s): s is string => !!s))
  return slugs.size === 1 ? [...slugs][0] : null
}

const LIMITED_TIME_COUNTDOWN_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "Tiempo limitado" tag for a package/collection — plain tag when there's
 * no end date (or it's still more than 3 days out), a live "Xd HH:MM:SS"
 * countdown once 3 days or fewer remain. Ticks its own state every second
 * only while a countdown is actually showing, so it doesn't re-render the
 * whole page every second for every other collection. */
function LimitedTimeBadge({ collection }: { collection: Collection }) {
  const [now, setNow] = useState(() => Date.now())
  const endsAt = collection.limited_time_ends_at ? new Date(collection.limited_time_ends_at).getTime() : null
  const msLeft = endsAt != null ? endsAt - now : null
  const showCountdown = msLeft != null && msLeft > 0 && msLeft <= LIMITED_TIME_COUNTDOWN_THRESHOLD_MS

  useEffect(() => {
    if (!showCountdown) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [showCountdown])

  if (!collection.limited_time) return null

  if (!showCountdown) {
    return <span className="limited-time-badge">Tiempo limitado</span>
  }

  const totalSeconds = Math.max(0, Math.floor(msLeft! / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return (
    <span className="limited-time-badge limited-time-badge--countdown">
      Termina en {days > 0 ? `${days}d ` : ''}
      {pad2(hours)}:{pad2(minutes)}:{pad2(seconds)}
    </span>
  )
}

function CollectionSection({
  collection,
  categories,
  wholesaleTiers,
  selectedSizes,
  selectedBrands,
}: {
  collection: Collection
  categories: Category[]
  wholesaleTiers: WholesaleTier[]
  selectedSizes: string[]
  selectedBrands: string[]
}) {
  const { addItem } = useCart()
  const { activeCollection, startBuilding } = usePackageBuilder()
  const { sizeByCategory } = useSizePreference()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const buildMode = activeCollection?.id === collection.id

  // Kicks off the build and, alongside the pulsing CategoryPills highlight,
  // names the exact category (or categories) to go pick from.
  function handleStartBuilding() {
    startBuilding(collection)
    const message = startBuildingToastMessage(collection, categories)
    if (message) showToast(message)
  }

  // Same, but scoped to one specific priced bundle tier (a tier-card) —
  // picking only counts toward that part's own category and required_qty.
  function handleStartBuildingForPart(part: CollectionBundlePart) {
    startBuilding(collection, part)
    showToast(`Ve a la sección de ${part.category_name} y elige`)
  }

  // Same, but for one specific wholesale range card — the customer already
  // committed to at least that bracket, so the progress bar/label should
  // count toward its own threshold instead of the lowest one.
  function handleStartBuildingForWholesaleTier(tier: WholesaleTier) {
    startBuilding(collection, null, null, tier)
    const message = startBuildingToastMessage(collection, categories)
    if (message) showToast(message)
  }

  // Same, but scoped to one specific combo tier (variant) — picking only
  // counts toward that tier's own set of category quotas.
  function handleStartBuildingForComboTier(tier: CollectionComboTier) {
    startBuilding(collection, null, tier)
    const names = [...new Set(collection.bundle_parts.filter((p) => p.combo_tier_id === tier.id).map((p) => p.category_name))]
    const message = toastMessageForCategoryNames(names)
    if (message) showToast(message)
  }

  const isBundle = collection.pricing_mode === 'bundle' && !!collection.bundle_qty && !!collection.bundle_price
  // A hand-curated set of specific products (not a computed bundle price) —
  // admin-flagged per collection so plain showcases ("Lo más nuevo") don't
  // get an "add everything" button that doesn't make sense for them.
  const isCuratedAddAll =
    collection.pricing_mode === 'none' && !!collection.allow_add_all_to_cart && collection.products.length > 0
  const showAddAll = isBundle || isCuratedAddAll
  const isWholesale = collection.pricing_mode === 'wholesale'
  const isWildcardWholesale = isWholesale && !!collection.wholesale_any_product
  const isPackage = isPackageCollection(collection)
  const bundleLabel = isPackage ? packageDealLabel(collection) : null
  const isTieredCombo = collection.pricing_mode === 'combo' && collection.combo_tiers.length > 1

  // A bundle part with its own price is its own independent tier (like a
  // wholesale quantity range, but with a fixed total instead of a per-unit
  // one). More than one such part means the customer picks a tier first,
  // same as wholesale's range cards; exactly one means there's nothing to
  // choose between, so its category's products show directly (below, via
  // the regular filteredPreview grid — showsWithoutCuration already covers
  // that case since bundle_parts.length > 0).
  const bundlePricedParts = useMemo(
    () => (collection.pricing_mode === 'bundle' ? collection.bundle_parts.filter((p) => p.price !== null) : []),
    [collection]
  )
  const isTieredBundle = bundlePricedParts.length > 1

  const relevantTiers = useMemo(
    () => wholesaleTiers.filter((t) => t.category_id === collection.wholesale_category_id),
    [wholesaleTiers, collection.wholesale_category_id]
  )
  const wholesaleCategoryName = categories.find((c) => c.id === collection.wholesale_category_id)?.name ?? null

  // Wholesale-wildcard and combo collections don't need their own curated
  // product list — wholesale draws from its whole wholesale category and
  // combo draws from each part's category, matched wherever those products
  // show up across the site (see PackageBuilderContext.isInActiveCollection),
  // so an empty list here doesn't mean "nothing to show".
  const showsWithoutCuration = isWildcardWholesale || collection.bundle_parts.length > 0

  // Every category referenced by this collection's parts — used to keep the
  // wildcard preview scoped to products that actually qualify, instead of
  // falling back to the whole catalog once a combo spans more than one
  // category (which used to bury the eligible cards among unrelated ones,
  // showing "Añadir al carrito" instead of "Añadir a la selección" for most
  // of the first screenful).
  const partCategorySlugs = useMemo(
    () => new Set(collection.bundle_parts.map((p) => p.category_slug)),
    [collection.bundle_parts]
  )

  // With no curated products of its own, fetch a real preview from the same
  // scope the picker itself would use, so the section still shows something
  // (and gets a "Ver más" button) instead of sitting empty below the header.
  const [wildcardPreview, setWildcardPreview] = useState<Product[]>([])
  useEffect(() => {
    if (!showsWithoutCuration || collection.products.length > 0) return
    const categorySlug = primaryCategorySlug(collection, categories)
    api
      .getProducts(categorySlug ? { category: categorySlug } : {})
      .then((products) => {
        if (categorySlug || partCategorySlugs.size === 0) {
          setWildcardPreview(products)
          return
        }
        setWildcardPreview(products.filter((p) => !!p.category_slug && partCategorySlugs.has(p.category_slug)))
      })
      .catch(() => {})
  }, [showsWithoutCuration, collection, categories, partCategorySlugs])

  const previewSource = collection.products.length > 0 ? collection.products : wildcardPreview

  // The top toolbar's Talla/Marca filters apply here too, not just on a
  // single-category page — otherwise they'd sit visible and do nothing
  // while browsing the homepage's collection sections.
  const filteredPreview = previewSource.filter((p) => {
    const inStock = p.variants.some((v) => v.stock > 0)
    const sizeOk = selectedSizes.length === 0 || p.variants.some((v) => selectedSizes.includes(v.size))
    const brandOk = selectedBrands.length === 0 || (!!p.brand_name && selectedBrands.includes(p.brand_name))
    return inStock && sizeOk && brandOk
  })

  // A single active Talla filter counts as an explicit size choice already
  // made — quick-add only still needs a color tap after that.
  const filterSize = selectedSizes.length === 1 ? selectedSizes[0] : null

  // For a fixed bundle deal ("10 piezas por $X"), one click should add
  // exactly bundle_qty units — cycling through the collection's products
  // (each one's first in-stock variant) so the mix is spread out rather
  // than piling every unit onto a single product/variant.
  function handleAddAll() {
    // previewSource already falls back to the wildcard-scoped preview when
    // this collection has no curated products of its own (parts-driven
    // combo/unit/bundle) — reuse it so the quick-add still has a pool to
    // draw from in that case, instead of silently doing nothing.
    const pool = collection.products.length > 0 ? collection.products : previewSource
    if (isBundle) {
      let remaining = collection.bundle_qty!
      const consumed = new Map<number, number>()
      let guard = 0
      while (remaining > 0 && guard < 1000) {
        guard++
        let addedThisRound = false
        for (const p of pool) {
          if (remaining <= 0) break
          const variant = p.variants.find((v) => v.stock - (consumed.get(v.id) ?? 0) > 0)
          if (!variant) continue
          addItem({
            productId: p.id,
            slug: p.slug,
            name: p.name,
            price: parseFloat(p.price),
            image: productThumb(p),
            size: variant.size,
            colorName: variant.color_name,
            colorHex: variant.color_hex,
          })
          consumed.set(variant.id, (consumed.get(variant.id) ?? 0) + 1)
          remaining--
          addedThisRound = true
        }
        if (!addedThisRound) break
      }
      return
    }
    for (const p of pool) {
      const variant = p.variants.find((v) => v.stock > 0)
      if (!variant) continue
      addItem({
        productId: p.id,
        slug: p.slug,
        name: p.name,
        price: parseFloat(p.price),
        image: productThumb(p),
        size: variant.size,
        colorName: variant.color_name,
        colorHex: variant.color_hex,
      })
    }
  }

  const collectionLayout = collection.layout_json && collection.layout_json.length > 0 ? collection.layout_json : null

  const bannerActions = (
    <div className="collection-banner__actions">
      {showAddAll && (
        <button className="btn btn--light" onClick={handleAddAll}>
          Añadir al carrito
        </button>
      )}
      {isPackage && !isWholesale && !isTieredBundle && !isTieredCombo && !buildMode && (
        <button className="btn btn--light" onClick={handleStartBuilding}>
          Elige tus productos
        </button>
      )}
    </div>
  )

  if (collection.products.length === 0 && !showsWithoutCuration) {
    if (!isPackage && !collection.promo_text) return null
    return (
      <section className="section collection-section" id={`collection-${collection.slug}`}>
        <div className="promo-card">
          <h2>{collection.name}</h2>
          <LimitedTimeBadge collection={collection} />
          {(collection.promo_text || bundleLabel) && <p className="promo-card__text">{collection.promo_text || bundleLabel}</p>}
          <p className="state-msg">Aún no hay productos asignados a esta promoción.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="section collection-section" id={`collection-${collection.slug}`}>
      {collection.banner_image_url ? (
        <div
          className={`collection-banner ${collectionLayout ? 'collection-banner--custom-layout' : ''}`}
          style={{
            backgroundImage: `url(${collection.banner_image_url})`,
            backgroundPosition: `${collection.image_focus_x}% ${collection.image_focus_y}%`,
          }}
        >
          <div className="collection-banner__scrim" />
          {collectionLayout ? <BannerLayoutElements layout={collectionLayout} titleTag="h2" /> : null}
          {collectionLayout ? (
            bannerActions
          ) : (
            <div className="collection-banner__content">
              <h2>{collection.name}</h2>
              <LimitedTimeBadge collection={collection} />
              {collection.description && <p>{collection.description}</p>}
              {(collection.promo_text || bundleLabel) && (
                <p className="collection-banner__promo">{collection.promo_text || bundleLabel}</p>
              )}
              {bannerActions}
            </div>
          )}
        </div>
      ) : (
        <div className="section__header">
          <div>
            <h2>{collection.name}</h2>
            <LimitedTimeBadge collection={collection} />
            {collection.description && <p className="section__description">{collection.description}</p>}
            {(collection.promo_text || bundleLabel) && (
              <p className="section__promo">{collection.promo_text || bundleLabel}</p>
            )}
          </div>
          {((isPackage && !isWholesale && !isTieredBundle && !isTieredCombo && !buildMode) || isCuratedAddAll) && (
            <div className="section__actions">
              {showAddAll && (
                <button className="btn btn--primary btn--sm" onClick={handleAddAll}>
                  Añadir al carrito
                </button>
              )}
              {isPackage && !isWholesale && !isTieredBundle && !isTieredCombo && !buildMode && (
                <button className="btn btn--light btn--sm" onClick={handleStartBuilding}>
                  Elige tus productos
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isWholesale && !buildMode && (
        <div className="tier-grid">
          {relevantTiers.length === 0 ? (
            <p className="state-msg">Aún no hay rangos de mayoreo configurados para esta colección.</p>
          ) : (
            (() => {
              const anyManualFeatured = relevantTiers.some((t) => !!t.is_featured)
              return relevantTiers.map((tier, i) => (
                <TierCard
                  key={tier.id}
                  featured={isTierFeatured(collection, `wholesale:${tier.id}`, i, relevantTiers.length, !!tier.is_featured, anyManualFeatured)}
                  range={tierRangeLabel(tier, wholesaleCategoryName)}
                  price={plaquePrice(tier.price_per_unit)}
                  caption="c/u"
                  onSelect={() => handleStartBuildingForWholesaleTier(tier)}
                />
              ))
            })()
          )}
        </div>
      )}

      {isTieredBundle && !buildMode && (
        <div className="tier-grid">
          {bundlePricedParts.map((part, i) => (
            <TierCard
              key={part.id}
              featured={isTierFeatured(collection, `bundle:${part.id}`, i, bundlePricedParts.length)}
              range={`Paquete de ${part.required_qty} ${part.category_name}`}
              price={plaquePrice(part.price!)}
              // No per-unit caption here — the price is for the whole
              // package, not a per-piece rate, so showing "$X c/u" reads as
              // a second (wrong) price instead of a helpful breakdown.
              onSelect={() => handleStartBuildingForPart(part)}
            />
          ))}
        </div>
      )}

      {isTieredCombo && !buildMode && (
        <div className="tier-grid">
          {collection.combo_tiers.map((tier, i) => {
            const tierParts = collection.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
            const paid = tierParts.filter((p) => !p.is_gift)
            const gifts = tierParts.filter((p) => p.is_gift)
            const label = paid.map(comboPartLabel).join(' + ')
            const giftLabel = gifts.length > 0 ? ` + ${gifts.map((p) => `${comboPartLabel(p)} de regalo`).join(' + ')}` : ''
            const paidQty = paid.reduce((sum, p) => sum + p.required_qty, 0)
            return (
              <TierCard
                key={tier.id}
                featured={isTierFeatured(collection, `combo:${tier.id}`, i, collection.combo_tiers.length)}
                range={`${label}${giftLabel}`}
                price={plaquePrice(tier.price)}
                caption={paidQty > 0 ? `${plaquePrice(parseFloat(tier.price) / paidQty)} c/u` : undefined}
                onSelect={() => handleStartBuildingForComboTier(tier)}
              />
            )
          })}
        </div>
      )}

      {filteredPreview.length > 0 &&
        (!isWholesale || buildMode) &&
        (!isTieredBundle || buildMode) &&
        (!isTieredCombo || buildMode) && (
        <>
          <div className="product-grid">
            {filteredPreview.slice(0, SECTION_PREVIEW_CAP).map((p) => (
              <ProductCard
                key={p.id}
                product={toCardData(p)}
                rawProduct={p}
                autoSize={resolveAutoSize(filterSize, p, sizeByCategory)}
                packageCollection={isPackage ? collection : undefined}
              />
            ))}
          </div>
          {filteredPreview.length > SECTION_PREVIEW_CAP && (
            <button
              type="button"
              className="see-more-btn"
              onClick={() => {
                const slug = primaryCategorySlug(collection, categories)
                if (slug) navigate(`/?categoria=${slug}`)
                else startBuilding(collection)
              }}
            >
              Ver más
            </button>
          )}
        </>
      )}
    </section>
  )
}

function comboPartLabel(p: CollectionBundlePart): string {
  return `${p.required_qty} ${p.category_name}`
}

function packageDealLabel(c: Collection): string {
  if (c.pricing_mode === 'bundle') {
    if (c.bundle_qty && c.bundle_price) return `${c.bundle_qty} piezas por ${formatPrice(c.bundle_price)}`
    // A collection defined purely through priced parts has no flat total —
    // with a single tier there's still one obvious label to show; with more
    // than one, the tier-cards themselves already say it, so stay silent
    // here instead of picking one tier to (misleadingly) headline.
    const priced = c.bundle_parts.filter((p) => p.price !== null)
    if (priced.length === 1) return `${priced[0].required_qty} ${priced[0].category_name} por ${formatPrice(priced[0].price!)}`
    return ''
  }
  if (c.pricing_mode === 'unit') {
    if (c.unit_min_qty && c.unit_min_qty > 1) return `Desde ${c.unit_min_qty} piezas a ${formatPrice(c.unit_price!)} c/u`
    return `${formatPrice(c.unit_price!)} c/u`
  }
  if (c.pricing_mode === 'wholesale') return 'Precio de mayoreo según la cantidad que elijas'
  // combo — every combo has at least one tier; with more than one, the
  // tier-cards themselves already say each variant's deal, so stay silent
  // here instead of headlining just one of them.
  if (c.combo_tiers.length !== 1) return ''
  const tier = c.combo_tiers[0]
  const tierParts = c.bundle_parts.filter((p) => p.combo_tier_id === tier.id)
  const paid = tierParts.filter((p) => !p.is_gift)
  const gifts = tierParts.filter((p) => p.is_gift)
  const paidText = paid.map(comboPartLabel).join(' + ')
  const priceText = ` a ${formatPrice(tier.price)}`
  const giftText = gifts.length > 0 ? ` + ${gifts.map((p) => `${comboPartLabel(p)} de regalo`).join(' + ')}` : ''
  return `${paidText}${priceText}${giftText}`
}

/** Defaults for the home page's promo strip when the admin hasn't configured
 * any 'home_promo' banner yet — keeps the original always-on "Arma tu
 * paquete" marketing strip instead of leaving a blank gap. The 'packages'
 * and 'category' placements are brand new optional slots with no such
 * legacy default: nothing configured there just renders nothing. */
const HOME_PROMO_DEFAULTS = {
  title: 'Arma tu paquete y ahorra más',
  subtitle: 'Combina tus favoritos y obtén precios especiales.',
  badgeText: 'Precios especiales',
  ctaText: 'Ver paquetes',
  ctaLink: '/?paquetes=1',
}

/** Simple image+title+subtitle+badge marketing strip — a 'promo' kind
 * banner (as opposed to the richer, freely-positioned 'hero' kind used only
 * for the home carousel). `fallbackImage` is one representative photo from
 * any product that belongs to a package, used only when the banner itself
 * has no uploaded photo. */
function PromoBanner({
  banner,
  fallbackImage,
  defaults,
}: {
  banner: Banner | null
  fallbackImage: string | null
  defaults?: typeof HOME_PROMO_DEFAULTS
}) {
  const bannerDevice = useBannerDevice()
  const bgImage = (bannerDevice === 'mobile' && banner?.image_url_mobile) || banner?.image_url || fallbackImage
  // Only the admin's own uploaded photo (not the auto-derived product photo
  // fallback) has a meaningful position/zoom to apply.
  const style: CSSProperties | undefined = bgImage
    ? {
        backgroundImage: `url(${bgImage})`,
        ...(banner?.image_url
          ? {
              backgroundSize: backgroundSizeFor(banner.image_zoom) ?? 'cover',
              backgroundPosition: `${banner.image_focus_x}% ${banner.image_focus_y}%`,
            }
          : null),
      }
    : undefined

  const layout = banner?.layout_json && banner.layout_json.length > 0 ? banner.layout_json : null

  const title = banner?.title || defaults?.title
  const subtitle = banner?.subtitle || defaults?.subtitle
  const badgeText = banner?.badge_text || defaults?.badgeText
  const ctaText = banner?.cta_text || defaults?.ctaText
  const ctaLink = banner?.cta_link || defaults?.ctaLink

  if (!layout && !title && !subtitle && !ctaText && !badgeText) return null

  return (
    <section className={`package-promo ${layout ? 'package-promo--custom-layout' : ''}`} style={style}>
      <div className="package-promo__scrim" style={{ background: scrimGradient('promo', banner?.scrim_opacity) }} />
      {layout ? (
        <BannerLayoutElements layout={layout} titleTag="h2" />
      ) : (
        <>
          <div className="package-promo__content">
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
            {ctaText && (
              <Link to={ctaLink || '/?paquetes=1'} className="btn btn--primary btn--sm">
                {ctaText}
              </Link>
            )}
          </div>
          {badgeText && <span className="package-promo__badge">{badgeText}</span>}
        </>
      )}
    </section>
  )
}

interface CategoryTile {
  slug: string
  name: string
  tagline: string
  image: string | null
  /** Only meaningful when `image` came from the category's own image_url
   * (an admin-set photo, positioned via ImagePositionEditor) — an
   * auto-derived product photo fallback always renders centered/cover. */
  focusX: number
  focusY: number
  zoom: number | null
  /** Only meaningful alongside `image` coming from the category's own
   * image_url (same caveat as zoom above). */
  scrimOpacity: number | null
}

/** Home-page-only "shop by category" tiles — one per real category, plus a
 * fixed "Paquetes" tile routing to the packagesOnly filtered view. */
function CategoryShowcase({
  tiles,
  packagesImage,
  packagesTile,
}: {
  tiles: CategoryTile[]
  packagesImage: string | null
  /** Admin-set photo/tagline overrides for the Paquetes tile — same idea as
   * each real category's own image_url/tagline. Falls back to the
   * auto-derived packagesImage (always centered/cover, like a category
   * tile with no photo of its own) and the fixed tagline when unset. */
  packagesTile: PackagesTile | null
}) {
  if (tiles.length === 0) return null
  const packagesTileImage = packagesTile?.image_url || packagesImage
  return (
    <section className="category-showcase">
      {tiles.map((t) => (
        <Link
          key={t.slug}
          to={`/?categoria=${t.slug}`}
          className="category-showcase__tile"
          style={
            t.image
              ? {
                  backgroundImage: `url(${t.image})`,
                  backgroundSize: t.zoom != null ? `${t.zoom}%` : 'cover',
                  backgroundPosition: `${t.focusX}% ${t.focusY}%`,
                }
              : undefined
          }
        >
          <div className="category-showcase__scrim" style={{ background: scrimGradient('category', t.scrimOpacity) }} />
          <div className="category-showcase__body">
            <h3>{t.name}</h3>
            <p>{t.tagline}</p>
            <span className="category-showcase__cta">Comprar</span>
          </div>
        </Link>
      ))}
      <Link
        to="/?paquetes=1"
        className="category-showcase__tile"
        style={
          packagesTileImage
            ? {
                backgroundImage: `url(${packagesTileImage})`,
                ...(packagesTile?.image_url
                  ? {
                      backgroundSize: packagesTile.image_zoom != null ? `${packagesTile.image_zoom}%` : 'cover',
                      backgroundPosition: `${packagesTile.image_focus_x}% ${packagesTile.image_focus_y}%`,
                    }
                  : null),
              }
            : undefined
        }
      >
        <div
          className="category-showcase__scrim"
          style={{ background: scrimGradient('category', packagesTile?.image_url ? packagesTile.scrim_opacity : null) }}
        />
        <div className="category-showcase__body">
          <h3>Paquetes</h3>
          <p>{packagesTile?.tagline || 'Más piezas, mejor precio.'}</p>
          <span className="category-showcase__cta">Comprar</span>
        </div>
      </Link>
    </section>
  )
}

interface ProductsSectionProps {
  category: string | null
  categoryName: string
  categories: Category[]
  onSelectCategory: (slug: string | null) => void
  /** The "Paquetes" tile (see CategoryShowcase) routes here instead of a
   * real category — same product-grid layout, scoped to every product that
   * belongs to at least one package/collection instead of one category_id. */
  packagesOnly: boolean
  onSelectPackages: () => void
}

/** A short, generic tagline per category slug for CategoryShowcase's tiles —
 * falls back to one that reads fine for any category name when a shop adds
 * one this doesn't know about. */
const CATEGORY_TAGLINES: Record<string, string> = {
  playeras: 'Esenciales que hablan por ti.',
  gorras: 'El detalle que lo cambia todo.',
}

function ProductsSection({ category, categoryName, categories, onSelectCategory, packagesOnly, onSelectPackages }: ProductsSectionProps) {
  // The toolbar floats over the hero banner (see showHero below) via a
  // negative margin-bottom equal to its own rendered height, so the next
  // sibling (Hero) starts flush at the same y position instead of after the
  // toolbar's reserved space — measured live since its height varies (the
  // chip row, mobile search). Keeping the toolbar an ordinary in-flow sticky
  // sibling (not nested in a short wrapper) is what keeps it actually
  // sticking for the whole page scroll, not just past the hero's height.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    // offsetHeight (not entries[0].contentRect.height, which excludes
    // padding) — the negative margin below needs to cancel out the
    // toolbar's FULL box height, padding included.
    const ro = new ResizeObserver(() => setToolbarHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { sizeByCategory } = useSizePreference()
  // Lifted into a context so it survives this component's own remounts
  // (route changes, and this section's `key` swap on category change —
  // see CatalogFiltersProvider) instead of resetting every time.
  const { selectedSizes, selectedBrands, toggleSize, toggleBrand, clearFilters } = useCatalogFilters()
  const [collections, setCollections] = useState<Collection[]>([])
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([])
  const [homePromoBanners, setHomePromoBanners] = useState<Banner[]>([])
  const [packagesPromoBanners, setPackagesPromoBanners] = useState<Banner[]>([])
  const [categoryPromoBanners, setCategoryPromoBanners] = useState<Banner[]>([])
  const [packagesTile, setPackagesTile] = useState<PackagesTile | null>(null)
  // null = not loaded yet (or the fetch failed) — the home branch falls
  // back to a fixed banners/categories/collections order instead of
  // rendering nothing; re-fetched with a different `page` whenever
  // packagesOnly toggles (this component remounts on that transition — see
  // its `key` in the exported Catalog below — so this is never stale).
  const [pageLayout, setPageLayout] = useState<PageLayoutEntry[] | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const mobileSearchOpen = searchParams.get('buscar') === '1'
  const [page, setPage] = useState(1)
  // How many cards the home page's "Todos los productos" section shows —
  // grows by SECTION_PREVIEW_CAP each "Ver más" click instead of navigating
  // away, since there's no single category/collection this mixed grid maps
  // to.
  const [allProductsVisible, setAllProductsVisible] = useState(SECTION_PREVIEW_CAP)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { activeCollection, activePart, isInActiveCollection, comboPartProgress, packagesFor } = usePackageBuilder()
  // A single active Talla filter counts as an explicit size choice already
  // made — quick-add only still needs a color tap after that.
  const filterSize = selectedSizes.length === 1 ? selectedSizes[0] : null
  const highlightSlugs = activeCollection
    ? relevantCategorySlugs(activeCollection, categories, comboPartProgress, activePart)
    : undefined
  // While browsing a category matching an unmet combo part, name the exact
  // ask up front ("Selecciona 2 Gorras") — the pill tracks the running
  // "falta(n)" count once picks start.
  const activeComboPart =
    category && activeCollection?.pricing_mode === 'combo'
      ? comboPartProgress.find((p) => p.part.category_slug === category && p.remaining > 0)
      : undefined

  function closeMobileSearch() {
    setSearchTerm('')
    const next = new URLSearchParams(searchParams)
    next.delete('buscar')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (category) return
    api
      .getCollections()
      .then((data) => {
        setCollections(data)
        if (window.location.hash.startsWith('#collection-')) {
          requestAnimationFrame(() => {
            document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
          })
        }
      })
      .catch(() => {})
    api
      .getWholesaleTiers()
      .then(setWholesaleTiers)
      .catch(() => {})
    api
      .getBanners({ placement: 'home_promo' })
      .then(setHomePromoBanners)
      .catch(() => {})
    api
      .getBanners({ placement: 'packages' })
      .then(setPackagesPromoBanners)
      .catch(() => {})
    api
      .getPackagesTile()
      .then(setPackagesTile)
      .catch(() => {})
  }, [category])

  useEffect(() => {
    if (category) return
    api
      .getPageLayout(packagesOnly ? 'packages' : 'home')
      .then(setPageLayout)
      .catch(() => setPageLayout(null))
  }, [category, packagesOnly])

  useEffect(() => {
    if (!category) {
      setCategoryPromoBanners([])
      return
    }
    api
      .getBanners({ placement: 'category', categorySlug: category })
      .then(setCategoryPromoBanners)
      .catch(() => {})
  }, [category])

  useEffect(() => {
    let ignore = false

    api
      .getProducts(category ? { category } : {})
      .then((data) => {
        if (ignore) return
        setProducts(data)
        setLoading(false)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [category])

  // The Talla filter groups its sizes by category so a saved per-category
  // preference (see SizePreferenceModal) reads the same way here as it does
  // there, instead of one undifferentiated flat list.
  const sizeGroups = useMemo(() => {
    const byCategory = new Map<string, { label: string; sizes: Set<string> }>()
    for (const p of products) {
      if (!p.category_slug) continue
      const entry = byCategory.get(p.category_slug) ?? { label: p.category_name ?? p.category_slug, sizes: new Set<string>() }
      for (const v of p.variants) entry.sizes.add(v.size)
      byCategory.set(p.category_slug, entry)
    }
    return [...byCategory.values()]
      .map((g) => ({ label: g.label, options: [...g.sizes].sort() }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [products])

  const availableBrands = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.brand_name) set.add(p.brand_name)
    })
    return [...set].sort()
  }, [products])

  const searchActive = searchTerm.trim().length > 0

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return products.filter((p) => {
      // A product with every variant sold out has nothing a customer could
      // actually buy — dropped from every listing instead of showing an
      // "agotado" card nobody can act on (ProductDetail's own AVISARME flow
      // still works fine for someone who reaches it via a direct link).
      const inStock = p.variants.some((v) => v.stock > 0)
      const sizeOk = selectedSizes.length === 0 || p.variants.some((v) => selectedSizes.includes(v.size))
      const brandOk = selectedBrands.length === 0 || (!!p.brand_name && selectedBrands.includes(p.brand_name))
      const searchOk = !term || p.name.toLowerCase().includes(term) || (p.description ?? '').toLowerCase().includes(term)
      return inStock && sizeOk && brandOk && searchOk
    })
  }, [products, selectedSizes, selectedBrands, searchTerm])

  // One representative photo per real category, plus one for the "Paquetes"
  // tile (any product that belongs to at least one package) — reused from
  // whatever's already loaded on the home view instead of extra requests.
  const categoryTiles = useMemo(
    () =>
      categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        tagline: c.tagline || CATEGORY_TAGLINES[c.slug] || 'Piezas seleccionadas para ti.',
        image: c.image_url || products.find((p) => p.category_slug === c.slug && p.main_image_url)?.main_image_url || null,
        focusX: c.image_url ? c.image_focus_x : 50,
        focusY: c.image_url ? c.image_focus_y : 50,
        zoom: c.image_url ? c.image_zoom : null,
        scrimOpacity: c.image_url ? c.scrim_opacity : null,
      })),
    [categories, products]
  )
  const packagesTileImage = useMemo(
    () => products.find((p) => p.main_image_url && packagesFor(p).length > 0)?.main_image_url ?? null,
    [products, packagesFor]
  )

  // While a package is being assembled, a category page that has none of
  // its products is a dead end for the customer — say so plainly instead of
  // showing an empty/irrelevant grid.
  const categoryAppliesToPackage = !activeCollection || !category || products.some((p) => isInActiveCollection(p))

  function handlePageChange(next: number) {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pageSize = isDesktop ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // toggleSize/toggleBrand/clearFilters themselves live in
  // CatalogFiltersContext now (so the filter survives this component's own
  // remounts) — this page's own concern is just resetting back to page 1
  // whenever the filter actually changes.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSizes, selectedBrands])

  function handleSearchTermChange(value: string) {
    setSearchTerm(value)
    setPage(1)
  }

  const activeChips = [
    ...selectedSizes.map((size) => ({ key: `size-${size}`, label: `Talla ${size}`, onRemove: () => toggleSize(size) })),
    ...selectedBrands.map((brand) => ({ key: `brand-${brand}`, label: brand, onRemove: () => toggleBrand(brand) })),
  ]
  const showHero = !category && !packagesOnly && !searchActive

  // The home page's "browse everything" section — a wildcard, always
  // showing literally every active product (no manual curation, so a new
  // product shows up here automatically) rather than a hand-picked list
  // like the other collection sections. Rendered wherever the 'all_products'
  // entry sits in pageLayout (see below) so the admin can reposition it
  // relative to banners/collections instead of it being fixed at the end.
  const allProductsSection =
    filteredProducts.length > 0 ? (
      <section className="section" key="all_products">
        <div className="section__header">
          <div>
            <h2>Todos los productos</h2>
            <p className="section__description">Explora el catálogo completo, sin agrupar.</p>
          </div>
        </div>
        <div className="product-grid">
          {filteredProducts.slice(0, allProductsVisible).map((p) => (
            <ProductCard
              key={p.id}
              product={toCardData(p)}
              rawProduct={p}
              autoSize={resolveAutoSize(filterSize, p, sizeByCategory)}
            />
          ))}
        </div>
        {filteredProducts.length > allProductsVisible && (
          <button type="button" className="see-more-btn" onClick={() => setAllProductsVisible((v) => v + SECTION_PREVIEW_CAP)}>
            Ver más
          </button>
        )}
      </section>
    ) : null

  const toolbar = (
    <div
      ref={toolbarRef}
      className="catalog-toolbar"
      style={showHero ? { marginBottom: -toolbarHeight } : undefined}
    >
      <div className="catalog-toolbar__row">
        <div className="catalog-toolbar__main-row">
          <div className="toolbar-glass toolbar-glass--categories">
            <CategoryPills
              categories={categories}
              activeSlug={category}
              onSelect={onSelectCategory}
              packagesActive={packagesOnly}
              onSelectPackages={onSelectPackages}
              highlightSlugs={highlightSlugs}
            />
          </div>
          <div className="toolbar-glass toolbar-glass--filter" data-tour="filters">
            <FilterMenu label="Talla" groups={sizeGroups} selected={selectedSizes} onToggle={toggleSize} />
            <FilterMenu label="Marca" options={availableBrands} selected={selectedBrands} onToggle={toggleBrand} />
          </div>
          <div
            className={`toolbar-glass toolbar-glass--search toolbar-glass--search-desktop${showHero ? ' toolbar-glass--search-onphoto' : ''}`}
          >
            <SearchIcon />
            <input
              value={searchTerm}
              onChange={(e) => handleSearchTermChange(e.target.value)}
              placeholder="Buscar productos…"
            />
            {searchTerm && (
              <button
                type="button"
                className="icon-btn toolbar-glass__clear"
                onClick={() => handleSearchTermChange('')}
                aria-label="Borrar búsqueda"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        {mobileSearchOpen && (
          <div
            className={`toolbar-glass toolbar-glass--search toolbar-glass--search-mobile${showHero ? ' toolbar-glass--search-onphoto' : ''}`}
          >
            <SearchIcon />
            <input
              value={searchTerm}
              onChange={(e) => handleSearchTermChange(e.target.value)}
              placeholder="Buscar productos…"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                className="icon-btn toolbar-glass__clear"
                onClick={() => handleSearchTermChange('')}
                aria-label="Borrar búsqueda"
              >
                <CloseIcon />
              </button>
            )}
            <button className="icon-btn" onClick={closeMobileSearch} aria-label="Cerrar búsqueda">
              <CloseIcon />
            </button>
          </div>
        )}
        {activeChips.length > 0 && (
          <div className="catalog-toolbar__chip-row">
            {activeChips.map((chip) => (
              <button key={chip.key} className="filter-chip" onClick={chip.onRemove}>
                {chip.label}
                <CloseIcon />
              </button>
            ))}
            <button className="filter-chip filter-chip--clear" onClick={clearFilters}>
              Limpiar
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {toolbar}
      {/* The toolbar's negative margin-bottom (above) collapses the space it
          would otherwise reserve, so the hero starts flush at the same y
          position instead of after it — the toolbar still renders on top
          (it's position:sticky with z-index, the hero isn't). Staying an
          ordinary in-flow sticky element (not nested in a short wrapper) is
          what keeps it sticking for the whole page scroll, not just past the
          hero's own height. */}
      {showHero && <Hero />}

      <div id="catalogo" className="catalog-content">
        {loading && <ProductGridSkeleton />}
        {error && <p className="state-msg state-msg--error">{error}</p>}

        {!loading &&
          !error &&
          (searchActive ? (
            <section className="section">
              <h2>Resultados para "{searchTerm.trim()}"</h2>
              {filteredProducts.length === 0 ? (
                <p className="state-msg">Ningún producto coincide con tu búsqueda.</p>
              ) : (
                <>
                  <div className="product-grid">
                    {pagedProducts.map((p) => (
                      <ProductCard key={p.id} product={toCardData(p)} rawProduct={p} autoSize={resolveAutoSize(filterSize, p, sizeByCategory)} />
                    ))}
                  </div>
                  <Pagination page={currentPage} pageCount={pageCount} onChange={handlePageChange} />
                </>
              )}
            </section>
          ) : packagesOnly ? (
            <>
              <div className="section__header">
                <div>
                  <h2>Paquetes</h2>
                </div>
              </div>
              {pageLayout?.map((entry) => {
                if (entry.type === 'banner') {
                  const b = packagesPromoBanners.find((x) => x.id === entry.id)
                  return b ? <PromoBanner key={`banner-${b.id}`} banner={b} fallbackImage={packagesTileImage} /> : null
                }
                if (entry.type === 'collection') {
                  const c = collections.find((x) => x.id === entry.id)
                  return c ? (
                    <CollectionSection
                      key={`collection-${c.id}`}
                      collection={c}
                      categories={categories}
                      wholesaleTiers={wholesaleTiers}
                      selectedSizes={selectedSizes}
                      selectedBrands={selectedBrands}
                    />
                  ) : null
                }
                return null
              })}
              {!pageLayout?.some((e) => e.type === 'collection') && (
                <p className="state-msg">Aún no hay paquetes configurados.</p>
              )}
            </>
          ) : !category ? (
            <>
              {pageLayout && pageLayout.length > 0 ? (
                <>
                  {homePromoBanners.length === 0 && (
                    <PromoBanner banner={null} fallbackImage={packagesTileImage} defaults={HOME_PROMO_DEFAULTS} />
                  )}
                  {pageLayout.map((entry) => {
                    if (entry.type === 'category_showcase') {
                      return (
                        <CategoryShowcase key="category_showcase" tiles={categoryTiles} packagesImage={packagesTileImage} packagesTile={packagesTile} />
                      )
                    }
                    if (entry.type === 'all_products') {
                      return allProductsSection
                    }
                    if (entry.type === 'banner') {
                      const b = homePromoBanners.find((x) => x.id === entry.id)
                      return b ? (
                        <PromoBanner key={`banner-${b.id}`} banner={b} fallbackImage={packagesTileImage} defaults={HOME_PROMO_DEFAULTS} />
                      ) : null
                    }
                    const c = collections.find((x) => x.id === entry.id && x.show_on_home)
                    return c ? (
                      <CollectionSection
                        key={`collection-${c.id}`}
                        collection={c}
                        categories={categories}
                        wholesaleTiers={wholesaleTiers}
                        selectedSizes={selectedSizes}
                        selectedBrands={selectedBrands}
                      />
                    ) : null
                  })}
                </>
              ) : (
                <>
                  {homePromoBanners.length > 0 ? (
                    homePromoBanners.map((b) => (
                      <PromoBanner key={b.id} banner={b} fallbackImage={packagesTileImage} defaults={HOME_PROMO_DEFAULTS} />
                    ))
                  ) : (
                    <PromoBanner banner={null} fallbackImage={packagesTileImage} defaults={HOME_PROMO_DEFAULTS} />
                  )}
                  <CategoryShowcase tiles={categoryTiles} packagesImage={packagesTileImage} packagesTile={packagesTile} />
                  {collections
                    .filter((c) => c.show_on_home)
                    .map((c) => (
                      <CollectionSection
                        key={c.id}
                        collection={c}
                        categories={categories}
                        wholesaleTiers={wholesaleTiers}
                        selectedSizes={selectedSizes}
                        selectedBrands={selectedBrands}
                      />
                    ))}
                  {allProductsSection}
                </>
              )}
            </>
          ) : (
            <section className="section">
              {categoryPromoBanners.map((b) => (
                <PromoBanner key={b.id} banner={b} fallbackImage={null} />
              ))}
              <h2>{categoryName}</h2>
              {activeComboPart && (
                <p className="section__promo">
                  Selecciona {activeComboPart.remaining} {activeComboPart.part.category_name}
                  {activeComboPart.part.is_gift ? ' de regalo' : ''}
                  {activeComboPart.picked > 0 ? ' más' : ''}
                </p>
              )}
              {!categoryAppliesToPackage ? (
                <p className="state-msg">
                  Esta sección no cumple con los requisitos del paquete {activeCollection?.name}.
                </p>
              ) : filteredProducts.length === 0 ? (
                <p className="state-msg">
                  {products.length === 0 ? 'Aún no hay productos en esta categoría.' : 'Ningún producto coincide con los filtros.'}
                </p>
              ) : (
                <>
                  <div className="product-grid">
                    {pagedProducts.map((p) => (
                      <ProductCard key={p.id} product={toCardData(p)} rawProduct={p} autoSize={resolveAutoSize(filterSize, p, sizeByCategory)} />
                    ))}
                  </div>
                  <Pagination page={currentPage} pageCount={pageCount} onChange={handlePageChange} />
                </>
              )}
            </section>
          ))}
      </div>
    </>
  )
}

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategory = searchParams.get('categoria')
  const packagesOnly = searchParams.get('paquetes') === '1'

  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    api
      .getCategories()
      // Categories with show_in_nav = 0 (e.g. Pants/Paq. 3 Boss — real
      // pricing groups for the Cotizador, but not real browsable product
      // lines yet) stay out of the pills/home tiles entirely — same for one
      // that's currently out of stock everywhere (has_stock = 0), even if
      // show_in_nav is still on; it reappears on its own once stock returns.
      .then((data) => setCategories(data.filter((c) => c.show_in_nav && c.has_stock)))
      .catch(() => {})
  }, [])

  function handleSelectCategory(slug: string | null) {
    setSearchParams(slug ? { categoria: slug } : {})
  }

  function handleSelectPackages() {
    setSearchParams({ paquetes: '1' })
  }

  const categoryName = useMemo(
    () => categories.find((c) => c.slug === activeCategory)?.name ?? 'Productos',
    [categories, activeCategory]
  )

  return (
    <div className="page page--catalog">
      <Header variant="home" />

      {!activeCategory && !packagesOnly && <SizePreferenceModal categories={categories} />}

      <ProductsSection
        key={packagesOnly ? 'paquetes' : (activeCategory ?? 'all')}
        category={activeCategory}
        categoryName={categoryName}
        categories={categories}
        onSelectCategory={handleSelectCategory}
        packagesOnly={packagesOnly}
        onSelectPackages={handleSelectPackages}
      />
    </div>
  )
}
