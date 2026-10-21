import { createContext } from 'react'

export interface FavoriteProduct {
  id: number
  slug: string
  name: string
  price: number
  image: string | null
  isNew?: boolean
  /** True when the product had zero stock at the moment it was favorited —
   * lets the Favorites page show a one-time "¡Ya disponible!" badge once it
   * restocks, without needing any backend notification system. */
  wasOutOfStock?: boolean
}

export interface FavoritesContextValue {
  favorites: FavoriteProduct[]
  isFavorite: (id: number) => boolean
  toggleFavorite: (product: FavoriteProduct) => void
  /** Replaces the whole favorites list at once — used to hydrate from/reset an account's saved state. */
  replaceFavorites: (favorites: FavoriteProduct[]) => void
  /** Clears the wasOutOfStock flag once the "back in stock" badge has been shown. */
  markRestocked: (id: number) => void
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null)
