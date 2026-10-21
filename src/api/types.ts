export interface Category {
  id: number
  name: string
  slug: string
  /** Optional admin-set overrides for CategoryShowcase's tile — null falls
   * back to an auto-picked product photo / a generic tagline. */
  image_url: string | null
  tagline: string | null
  /** Where image_url is anchored within its tile (CSS background-position,
   * percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  /** null = background-size: cover (fills the tile). Set = an explicit
   * background-size percent instead (see admin/src/api/types.ts). */
  image_zoom: number | null
  /** null = the tile's own default dark gradient over the photo; a 0-150
   * number scales that gradient's opacity — see admin/src/api/types.ts. */
  scrim_opacity: number | null
  sort_order: number
  /** 0 = kept out of customer-facing category browsing (home tiles, the
   * catalog's filter pills) — still a real category for pricing purposes
   * (Mayoreo tiers, the Cotizador tool), just not one with real browsable
   * products yet. */
  show_in_nav: number
  /** 0 = no active product in this category currently has any stock —
   * computed live on every fetch, never stored. Combined with show_in_nav,
   * this is what actually decides whether a category appears anywhere
   * customer-facing (see effectively-visible checks in Catalog.tsx and
   * Cotizador.tsx) — a category can be un-hidden (show_in_nav=1) yet still
   * invisible while it has zero stock, and comes back on its own once stock
   * returns, no admin action needed either way. */
  has_stock: number
}

/** Overrides for the home page's fixed "Paquetes" tile in CategoryShowcase
 * — same idea as Category's own image_url/tagline, for that one synthetic
 * tile. Null fields keep the tile's original auto-picked photo / fixed
 * tagline. */
export interface PackagesTile {
  image_url: string | null
  tagline: string | null
  image_focus_x: number
  image_focus_y: number
  image_zoom: number | null
  scrim_opacity: number | null
}

export interface Brand {
  id: number
  name: string
  slug: string
}

export interface ProductVariant {
  id: number
  product_id: number
  size: string
  color_name: string
  color_hex: string
  barcode: string
  stock: number
  sort_order: number
}

export interface ProductImage {
  id: number
  product_id: number
  image_url: string
  /** Small catalog/list-grid version of image_url (~480px) — null for a
   * photo uploaded before this existed; fall back to image_url. */
  thumb_url: string | null
  color_name: string | null
  sort_order: number
}

export type DiscountType = 'percent' | 'fixed_price' | 'amount_off'
export type CollectionPricingMode = 'none' | 'unit' | 'bundle' | 'wholesale' | 'combo'

/** One category quota within a 'combo' pricing_mode collection, e.g.
 * "2 Playeras" or "1 Gorra de regalo". A non-null product_id pins the part
 * to that exact product instead of letting the customer pick any product
 * from category_id. */
export interface CollectionBundlePart {
  id: number
  category_id: number
  category_name: string
  category_slug: string
  /** Deprecated — no longer set from the admin form. See is_specific. */
  product_id: number | null
  product_name?: string | null
  /** true: only products curated into the collection (for category_id) count,
   * up to required_qty. false: any product in category_id counts dynamically,
   * no curation needed. */
  is_specific: number
  required_qty: number
  /** Only meaningful for pricing_mode 'bundle': makes this part its own
   * independent "required_qty units of category_id for $price" tier,
   * instead of pooling toward the collection's flat bundle_qty/bundle_price. */
  price: string | null
  is_gift: number
  /** Only set for pricing_mode 'combo': which tier (variant) this part
   * belongs to — see CollectionComboTier. Null for 'bundle'/'unit'. */
  combo_tier_id: number | null
}

/** A priced variant of a 'combo' collection, e.g. "2 Playeras + 2 Gorras —
 * $1380" and "3 Playeras + 3 Gorras — $1970" are two tiers. Every 'combo'
 * collection has at least one; with exactly one, the customer picks products
 * directly (no tier-card screen); with more than one, they choose a tier
 * first, like wholesale's quantity ranges. */
export interface CollectionComboTier {
  id: number
  price: string
  sort_order: number
}

export interface ProductCollectionMembership {
  id: number
  name: string
  slug: string
  pricing_mode: CollectionPricingMode
  unit_price: string | null
  unit_min_qty: number | null
  bundle_qty: number | null
  bundle_price: string | null
  discount_price: string | null
}

export interface Product {
  id: number
  category_id: number | null
  brand_id: number | null
  name: string
  slug: string
  description: string | null
  price: string
  main_image_url: string | null
  /** Small catalog/list-grid version of main_image_url (~480px) — null for a
   * product created before this existed; fall back to main_image_url. Only
   * for card/list contexts (catalog grid, cart, favorites) — the product
   * detail page's own big photo still uses main_image_url/images[].image_url. */
  main_thumb_url: string | null
  is_new: number
  is_featured: number
  is_active: number
  /** Computed fresh from real confirmed sales — never a stored/manual flag. */
  is_bestseller: boolean
  discount_type: DiscountType | null
  discount_value: string | null
  category_name?: string | null
  category_slug?: string | null
  brand_name?: string | null
  brand_slug?: string | null
  images: ProductImage[]
  variants: ProductVariant[]
  /** Only present on products embedded inside a Collection: per-product
   * discount price that applies only within that collection. */
  collection_discount_price?: string | null
  /** Active collections this product belongs to (with their pricing config). */
  collections: ProductCollectionMembership[]
}

export interface Collection {
  id: number
  name: string
  slug: string
  description: string | null
  pricing_mode: CollectionPricingMode
  unit_price: string | null
  unit_min_qty: number | null
  bundle_qty: number | null
  bundle_price: string | null
  wholesale_category_id: number | null
  wholesale_any_product: number
  /** Only meaningful for pricing_mode 'none' with curated products — shows
   * an "Añadir todo al carrito" button that adds every curated product at
   * once instead of one by one. */
  allow_add_all_to_cart: number
  promo_text: string | null
  banner_image_url: string | null
  /** Custom banner layout from the visual editor — null uses the plain
   * fixed rendering (banner_image_url + promo_text) instead. */
  layout_json: BannerElement[] | null
  /** Where banner_image_url is anchored within its box (CSS
   * background-position, percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  is_active: number
  /** Independent of is_active — a collection can be active (buyable) without
   * taking up its own section on the home page. */
  show_on_home: number
  /** Shows a "Tiempo limitado" tag — see limited_time_ends_at for when a
   * live countdown replaces the plain tag. */
  limited_time: number
  limited_time_starts_at: string | null
  limited_time_ends_at: string | null
  sort_order: number
  products: Product[]
  bundle_parts: CollectionBundlePart[]
  combo_tiers: CollectionComboTier[]
  /** Tier key ('bundle:<partId>' | 'combo:<tierId>' | 'wholesale:<tierId>')
   * most picked in real confirmed sales — null until any sale resolved a
   * tier for this collection. Drives the real "Más elegido" ribbon. */
  most_chosen_tier_key: string | null
}

export type BannerDevice = 'mobile' | 'tablet' | 'desktop'

/** One element's position and size for one specific device breakpoint. See
 * admin/src/api/types.ts for the authoritative doc. */
export interface BannerDeviceLayout {
  xPct: number
  yPct: number
  fontSize: number
  padding?: number
  borderRadius?: number
  borderWidth?: number
  /** For 'image' the box size; for text/button/badge/title/subtitle an
   * explicit box width (unset auto-sizes to the text) — see
   * admin/src/api/types.ts. */
  width?: number
  height?: number
}

/** One positioned, styled text element in a hero slide's custom banner
 * layout (from the admin's visual banner editor). See
 * admin/src/api/types.ts for the authoritative doc. */
export interface BannerElement {
  id: string
  kind: 'badge' | 'title' | 'subtitle' | 'button' | 'text' | 'plaque' | 'image'
  text: string
  /** Only meaningful for kind 'plaque': the big price line, e.g. "$1,360". */
  priceText?: string
  /** Only meaningful for kind 'plaque': the small line under the price, e.g.
   * "(Cada prenda a $340 c/u)". */
  captionText?: string
  /** Only meaningful for kind 'image' — see admin/src/api/types.ts. */
  imageUrl?: string | null
  color: string
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  /** Drop shadow behind the text, 0 (or unset) = none, up to 5 = strongest.
   * `boolean` is only ever read, not written — legacy shape from before this
   * was a level (true ≈ level 3). */
  textShadow?: number | boolean
  backgroundColor?: string | null
  borderColor?: string | null
  /** iOS-style frosted glass fill — see admin/src/api/types.ts. */
  glass?: boolean
  align?: 'left' | 'center'
  linkType?: 'catalog' | 'collection' | 'category' | 'packages' | 'url'
  collectionSlug?: string | null
  categorySlug?: string | null
  url?: string | null
  linked?: boolean
  layouts?: {
    desktop: BannerDeviceLayout
    tablet: BannerDeviceLayout
    mobile: BannerDeviceLayout
  }
  /** @deprecated pre-per-device fields — see resolveDeviceLayout(). */
  xPct?: number
  yPct?: number
  fontSize?: number
  padding?: number
  borderRadius?: number
  borderWidth?: number
}

/** See admin/src/api/types.ts for the authoritative doc — kept in sync here
 * since the frontend reads the same saved data directly. */
export function resolveDeviceLayout(el: BannerElement, device: BannerDevice): BannerDeviceLayout {
  if (el.layouts) return el.layouts[device] ?? el.layouts.desktop
  return {
    xPct: el.xPct ?? 50,
    yPct: el.yPct ?? 50,
    fontSize: el.fontSize ?? 16,
    padding: el.padding,
    borderRadius: el.borderRadius,
    borderWidth: el.borderWidth,
  }
}

export type BannerKind = 'hero' | 'promo'
export type BannerPlacement = 'home_hero' | 'home_promo' | 'packages' | 'category'

/** A promotional banner anywhere in the storefront. `kind: 'hero'` is a rich,
 * freely-positioned banner (layout_json) — only ever used for the home
 * page's main carousel (placement: 'home_hero'). `kind: 'promo'` is the
 * simpler image+title+subtitle+badge strip (like the old standalone "Arma
 * tu paquete" banner) and can be placed on the home promo strip, the
 * Paquetes page, or one specific category's page. */
export interface Banner {
  id: number
  kind: BannerKind
  placement: BannerPlacement
  /** Only set when placement = 'category'. */
  placement_category_id: number | null
  placement_category_slug?: string | null
  placement_category_name?: string | null
  image_url: string
  badge_text: string | null
  title: string | null
  subtitle: string | null
  cta_text: string | null
  cta_link: string | null
  collection_id: number | null
  collection_slug?: string | null
  collection_name?: string | null
  is_active: number
  sort_order: number
  /** Custom banner layout from the visual editor — null uses the plain
   * fixed rendering of the fields above instead. */
  layout_json: BannerElement[] | null
  /** Where image_url is anchored within its box (CSS background-position,
   * percent — 50/50 is centered). */
  image_focus_x: number
  image_focus_y: number
  /** NULL = background-size: cover; set = an explicit percent, shrinking the
   * photo to show it in full instead of always cropping to fill the box. */
  image_zoom: number | null
  /** NULL = the placement's own default dark gradient over the photo; set =
   * a 0-150 percent multiplier scaling that gradient's opacity. */
  scrim_opacity: number | null
  /** Optional separate photo shown only below the tablet breakpoint — see
   * admin/src/api/types.ts for the full doc. NULL falls back to image_url. */
  image_url_mobile: string | null
}

/** One slot in a page's own curated section order — 'home' mixes
 * home_promo banners, the "Comprar por categoría" tile grid, and whichever
 * collections the admin picked; 'packages' mixes packages-placement banners
 * and whichever collections the admin picked for that page. Both replace
 * what used to be separate, overlapping controls (a collection's own
 * "mostrar en inicio" toggle, its own drag order, a banner's own per-
 * placement order) with one curated list per page. Already resolved (stale
 * ids dropped) by the backend — render these in order, as-is. */
export type PageLayoutPage = 'home' | 'packages'

export type PageLayoutEntry =
  | { type: 'category_showcase' }
  | { type: 'all_products' }
  | { type: 'banner'; id: number; label: string }
  | { type: 'collection'; id: number; label: string }

export interface WholesaleTier {
  id: number
  category_id: number | null
  category_name?: string | null
  min_qty: number
  max_qty: number | null
  price_per_unit: string
  sort_order: number
  /** Manually pins the "Más elegido" ribbon for this tier — see
   * Catalog.tsx's isTierFeatured(). Takes priority over the sales-data-
   * derived collections.most_chosen_tier_key pick. */
  is_featured: number
}
