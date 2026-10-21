import { useContext } from 'react'
import { CatalogFiltersContext } from '../context/catalog-filters-context'

export function useCatalogFilters() {
  const ctx = useContext(CatalogFiltersContext)
  if (!ctx) throw new Error('useCatalogFilters must be used within a CatalogFiltersProvider')
  return ctx
}
