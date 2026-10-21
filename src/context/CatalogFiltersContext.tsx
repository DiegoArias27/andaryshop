import { useCallback, useEffect, type ReactNode } from 'react'
import { useSessionStorage } from '../hooks/useSessionStorage'
import { useSizePreference } from '../hooks/useSizePreference'
import { CatalogFiltersContext, DEFAULT_CATALOG_FILTERS, type CatalogFilters } from './catalog-filters-context'

/** The catalog's Talla/Marca filter — lifted out of Catalog.tsx so it
 * survives the page's own remounts (route changes, and ProductsSection's own
 * `key` swap on category change) instead of resetting every time. Guest-side
 * storage is sessionStorage (see useSessionStorage) — gone once the tab/
 * browser closes; an account's choice instead persists indefinitely via
 * AccountSync, same pattern as saved Cotizador quotes. */
export function CatalogFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useSessionStorage<CatalogFilters>('andary-catalog-filters', DEFAULT_CATALOG_FILTERS)
  const { sizeByCategory, replaceSizePreferences } = useSizePreference()

  // Whatever was saved in the "para mayor experiencia" size modal is applied
  // here too, by default — a real, adjustable filter, not just a quick-add
  // hint — until the shopper actually touches the Talla filter themselves.
  useEffect(() => {
    if (filters.sizesTouched) return
    setFilters((prev) => (prev.sizesTouched ? prev : { ...prev, sizes: Object.values(sizeByCategory) }))
  }, [sizeByCategory, filters.sizesTouched, setFilters])

  const toggleSize = useCallback(
    (size: string) => {
      setFilters((prev) => {
        const removing = prev.sizes.includes(size)
        if (removing) {
          // Otherwise this size comes right back next time — sizeByCategory
          // (the saved "para mayor experiencia" preference) is what a fresh
          // filter hydrates from, and just filtering this list never touches it.
          const remaining = Object.fromEntries(Object.entries(sizeByCategory).filter(([, s]) => s !== size))
          if (Object.keys(remaining).length !== Object.keys(sizeByCategory).length) {
            replaceSizePreferences(remaining)
          }
        }
        return { ...prev, sizesTouched: true, sizes: removing ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size] }
      })
    },
    [setFilters, sizeByCategory, replaceSizePreferences]
  )

  const toggleBrand = useCallback(
    (brand: string) => {
      setFilters((prev) => ({
        ...prev,
        brands: prev.brands.includes(brand) ? prev.brands.filter((b) => b !== brand) : [...prev.brands, brand],
      }))
    },
    [setFilters]
  )

  const clearFilters = useCallback(() => {
    setFilters({ sizes: [], brands: [], sizesTouched: true })
    // Same reasoning as toggleSize — otherwise the saved sizes reappear later.
    if (Object.keys(sizeByCategory).length > 0) replaceSizePreferences({})
  }, [setFilters, sizeByCategory, replaceSizePreferences])

  const replaceCatalogFilters = useCallback((next: CatalogFilters) => setFilters(next), [setFilters])

  return (
    <CatalogFiltersContext.Provider
      value={{
        filters,
        selectedSizes: filters.sizes,
        selectedBrands: filters.brands,
        toggleSize,
        toggleBrand,
        clearFilters,
        replaceCatalogFilters,
      }}
    >
      {children}
    </CatalogFiltersContext.Provider>
  )
}
