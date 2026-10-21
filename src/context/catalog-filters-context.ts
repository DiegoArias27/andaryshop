import { createContext } from 'react'

export interface CatalogFilters {
  sizes: string[]
  brands: string[]
  /** Once true, `sizes` no longer auto-follows the site-wide "para mayor
   * experiencia" size preference — the shopper made an explicit Talla
   * choice here, so it sticks even if that preference changes later. */
  sizesTouched: boolean
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = { sizes: [], brands: [], sizesTouched: false }

export interface CatalogFiltersContextValue {
  filters: CatalogFilters
  selectedSizes: string[]
  selectedBrands: string[]
  toggleSize: (size: string) => void
  toggleBrand: (brand: string) => void
  clearFilters: () => void
  /** Replaces the whole filter state at once — used to hydrate from/reset an account's saved state. */
  replaceCatalogFilters: (filters: CatalogFilters) => void
}

export const CatalogFiltersContext = createContext<CatalogFiltersContextValue | null>(null)
