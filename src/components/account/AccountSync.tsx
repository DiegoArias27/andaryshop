import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import { useCart } from '../../hooks/useCart'
import { useFavorites } from '../../hooks/useFavorites'
import { useSizePreference } from '../../hooks/useSizePreference'
import { useQuotes } from '../../hooks/useQuotes'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import { AccountSyncContext } from '../../context/account-sync-context'
import type { CartItem } from '../../context/cart-context'
import type { FavoriteProduct } from '../../context/favorites-context'
import type { SizePreferences } from '../../context/size-preference-context'
import type { SavedQuote } from '../../context/quotes-context'
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters } from '../../context/catalog-filters-context'

const OWNER_KEY = 'andary-account-owner'

function mergeCarts(guest: CartItem[], account: CartItem[]): CartItem[] {
  const merged = [...account]
  for (const item of guest) {
    const idx = merged.findIndex(
      (m) => m.productId === item.productId && m.size === item.size && m.colorName === item.colorName
    )
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + item.quantity }
    } else {
      merged.push(item)
    }
  }
  return merged
}

function mergeFavorites(guest: FavoriteProduct[], account: FavoriteProduct[]): FavoriteProduct[] {
  const merged = [...account]
  for (const fav of guest) {
    if (!merged.some((m) => m.id === fav.id)) merged.push(fav)
  }
  return merged
}

// Account wins per category when both set one — the guest side only fills
// in categories the account hasn't chosen a size for yet.
function mergeSizePreferences(guest: SizePreferences, account: SizePreferences): SizePreferences {
  return { ...guest, ...account }
}

function mergeQuotes(guest: SavedQuote[], account: SavedQuote[]): SavedQuote[] {
  return [...account, ...guest]
}

// Whichever side was actually touched by the shopper wins; the account wins
// if both were (same convention as size preferences).
function mergeCatalogFilters(guest: CatalogFilters, account: CatalogFilters): CatalogFilters {
  if (account.sizesTouched || account.sizes.length > 0 || account.brands.length > 0) return account
  return guest
}

/**
 * Bridges the customer's account with the local cart/favorites state, and
 * exposes an AccountSyncContext so UI that sets state liable to being
 * overwritten by the initial hydration (e.g. the size-preference modal) can
 * wait for it. On login, merges whatever was added as a guest into the
 * account's saved data; while logged in, keeps every change pushed to the
 * account; on logout, wipes the local cache so the next person on this
 * device doesn't see the previous customer's cart/favorites.
 */
export default function AccountSync({ children }: { children: ReactNode }) {
  const { customer, loading } = useCustomerAuth()
  const { items, replaceCart } = useCart()
  const { favorites, replaceFavorites } = useFavorites()
  const { sizeByCategory, replaceSizePreferences } = useSizePreference()
  const { quotes, replaceQuotes } = useQuotes()
  const { filters: catalogFilters, replaceCatalogFilters } = useCatalogFilters()

  const syncedCustomerId = useRef<number | null>(null)
  const itemsRef = useRef(items)
  const favoritesRef = useRef(favorites)
  const sizeByCategoryRef = useRef(sizeByCategory)
  const quotesRef = useRef(quotes)
  const catalogFiltersRef = useRef(catalogFilters)
  const [dataSynced, setDataSynced] = useState(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])

  useEffect(() => {
    sizeByCategoryRef.current = sizeByCategory
  }, [sizeByCategory])

  useEffect(() => {
    quotesRef.current = quotes
  }, [quotes])

  useEffect(() => {
    catalogFiltersRef.current = catalogFilters
  }, [catalogFilters])

  useEffect(() => {
    if (loading) return

    if (!customer) {
      if (syncedCustomerId.current !== null) {
        replaceCart([])
        replaceFavorites([])
        replaceSizePreferences({})
        replaceQuotes([])
        replaceCatalogFilters(DEFAULT_CATALOG_FILTERS)
        localStorage.removeItem(OWNER_KEY)
        syncedCustomerId.current = null
      }
      return
    }

    if (syncedCustomerId.current === customer.id) return

    setDataSynced(false)
    const previousOwner = localStorage.getItem(OWNER_KEY)
    api
      .getCustomerData()
      .then((data) => {
        if (previousOwner === String(customer.id)) {
          // Local cache already belongs to this account (e.g. page reload) — trust the server.
          replaceCart(data.cart)
          replaceFavorites(data.favorites)
          replaceSizePreferences(data.sizePreferences ?? {})
          replaceQuotes(data.quotes ?? [])
          replaceCatalogFilters(data.catalogFilters ?? DEFAULT_CATALOG_FILTERS)
        } else {
          // Genuine guest data collected before logging in — merge it into the account.
          const mergedCart = mergeCarts(itemsRef.current, data.cart)
          const mergedFavorites = mergeFavorites(favoritesRef.current, data.favorites)
          const mergedSizePreferences = mergeSizePreferences(sizeByCategoryRef.current, data.sizePreferences ?? {})
          const mergedQuotes = mergeQuotes(quotesRef.current, data.quotes ?? [])
          const mergedCatalogFilters = mergeCatalogFilters(
            catalogFiltersRef.current,
            data.catalogFilters ?? DEFAULT_CATALOG_FILTERS
          )
          replaceCart(mergedCart)
          replaceFavorites(mergedFavorites)
          replaceSizePreferences(mergedSizePreferences)
          replaceQuotes(mergedQuotes)
          replaceCatalogFilters(mergedCatalogFilters)
        }
        localStorage.setItem(OWNER_KEY, String(customer.id))
      })
      .catch(() => {})
      .finally(() => {
        syncedCustomerId.current = customer.id
        setDataSynced(true)
      })
  }, [customer, loading, replaceCart, replaceFavorites, replaceSizePreferences, replaceQuotes, replaceCatalogFilters])

  useEffect(() => {
    if (!customer || syncedCustomerId.current !== customer.id) return
    api
      .saveCustomerData({ cart: items, favorites, sizePreferences: sizeByCategory, quotes, catalogFilters })
      .catch(() => {})
  }, [items, favorites, sizeByCategory, quotes, catalogFilters, customer])

  const syncing = loading || (!!customer && !dataSynced)

  return <AccountSyncContext.Provider value={{ syncing }}>{children}</AccountSyncContext.Provider>
}
