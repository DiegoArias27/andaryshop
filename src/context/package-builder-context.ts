import { createContext } from 'react'
import type { Collection, CollectionBundlePart, CollectionComboTier, Product, ProductVariant, WholesaleTier } from '../api/types'

export interface SelectedUnit {
  productId: number
  variantId: number
  slug: string
  name: string
  price: number
  image: string | null
  size: string
  colorName: string
  colorHex: string
  /** Which bundle_part this unit fills (combo always; unit/bundle only when
   * that collection has parts configured); null otherwise. */
  partId: number | null
}

/** How much of one 'combo' bundle_part has been picked so far. */
export interface ComboPartProgress {
  part: CollectionBundlePart
  picked: number
  remaining: number
}

export interface PackageBuilderContextValue {
  /** The collection currently being assembled, or null when no picker is active.
   * Lives here (not local component state) so it survives navigating away to a
   * product detail page mid-pick. */
  activeCollection: Collection | null
  /** Set only when the build was scoped to one specific priced bundle tier
   * (a "Gorras — 2 unidades por $800" tier-card) rather than the whole
   * collection — restricts picking to that part's category/curation and its
   * own required_qty instead of the collection's other parts. */
  activePart: CollectionBundlePart | null
  /** Set only when a 'combo' build was scoped to one specific tier-card (a
   * priced variant like "2 Playeras + 2 Gorras — $1380") — restricts picking
   * to that tier's parts. Stays null for a single-tier combo (no tier-card
   * step needed there), which is scoped to that one tier automatically. */
  activeComboTier: CollectionComboTier | null
  /** Set only when a 'wholesale' build was started from one specific range
   * card (e.g. "4 a 5 piezas — $350 c/u") instead of the collection's generic
   * "Seleccionar productos" entry point — the progress bar/label then treats
   * that tier's own min_qty as the starting point instead of counting up
   * from the very first (lowest) tier, since the customer already committed
   * to at least that bracket by picking its card. */
  activeWholesaleTier: WholesaleTier | null
  selected: SelectedUnit[]
  /** 0 means "no fixed target" (wholesale mode) — picking is open-ended and
   * finishes with a manual "Agregar al carrito" instead of auto-completing. */
  target: number
  /** `part` scopes a 'bundle' build to one specific priced tier; `comboTier`
   * scopes a 'combo' build to one specific tier; `wholesaleTier` scopes a
   * 'wholesale' build to start counting from one specific range card — see
   * `activePart`, `activeComboTier` and `activeWholesaleTier`. At most one
   * applies, depending on the collection's pricing_mode. */
  startBuilding: (
    collection: Collection,
    part?: CollectionBundlePart | null,
    comboTier?: CollectionComboTier | null,
    wholesaleTier?: WholesaleTier | null
  ) => void
  /** Starts a build for `collection` and immediately picks `count` units of
   * this exact product/variant, in one atomic step — used only where the
   * caller already knows this product belongs to `collection` (e.g. a card
   * rendered inside that collection's own section), never from a site-wide
   * "which package could this start" lookup. `part`/`comboTier` scope it to
   * one specific tier, same as `startBuilding`. */
  startBuildingAndPick: (
    collection: Collection,
    product: Product,
    variant: ProductVariant,
    count?: number,
    part?: CollectionBundlePart | null,
    comboTier?: CollectionComboTier | null
  ) => void
  pick: (product: Product, variant: ProductVariant) => void
  removeOne: (variantId: number) => void
  finish: () => void
  cancel: () => void
  countFor: (variantId: number) => number
  eligiblePartFor: (product: Product) => CollectionBundlePart | null
  /** Empty outside combo mode. One entry per bundle_part, in order, with how
   * many units of it are still needed — used to guide the customer category
   * by category ("Selecciona 2 Gorras", "Te falta 1 Playera", ...). */
  comboPartProgress: ComboPartProgress[]
  /** Whether this product counts toward the active collection at all —
   * either explicitly curated in its products list, (wholesale mode with
   * wholesale_any_product) matching its wildcard category scope, or (any
   * mode with bundle_parts configured) matching one of those parts. */
  isInActiveCollection: (product: Product) => boolean
  /** Every active package-type collection this product belongs to (curated,
   * wildcard, or parts membership) — purely informational, doesn't start or
   * change a build by itself. Used to show a "Disponible en el paquete: X"
   * mention (one per match) that jumps to that collection's section, so a
   * product still reads as "part of a package" even when no build is
   * active — without silently hijacking its normal "Añadir al carrito". */
  packagesFor: (product: Product) => Collection[]
  /** True if clicking this product/variant chip would add a unit right now —
   * covers stock and the collection's own flat target cap. In combo mode
   * also requires an unfilled part; in unit/bundle mode with parts
   * configured, a part flagged "gift" is one of those flat-target slots too
   * (priced at 0 in the cart) but capped at 1, while a non-gift part is an
   * uncapped eligibility filter. */
  canPick: (product: Product, variant: ProductVariant) => boolean
  /** Fetched once here (not just wherever a collection section happens to
   * render) so PackagePickerBar can show wholesale's own tier progress
   * ("Faltan N para $X c/u") while the floating bar is up, regardless of
   * which page the customer navigated to mid-pick. */
  wholesaleTiers: WholesaleTier[]
}

export const PackageBuilderContext = createContext<PackageBuilderContextValue | null>(null)
