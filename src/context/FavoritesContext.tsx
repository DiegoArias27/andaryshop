import { useCallback, type ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { FavoritesContext, type FavoriteProduct } from './favorites-context'

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useLocalStorage<FavoriteProduct[]>('andary-favorites', [])

  function isFavorite(id: number) {
    return favorites.some((f) => f.id === id)
  }

  function toggleFavorite(product: FavoriteProduct) {
    setFavorites((prev) =>
      prev.some((f) => f.id === product.id)
        ? prev.filter((f) => f.id !== product.id)
        : [...prev, product]
    )
  }

  const replaceFavorites = useCallback((next: FavoriteProduct[]) => setFavorites(next), [setFavorites])

  const markRestocked = useCallback(
    (id: number) => {
      setFavorites((prev) => prev.map((f) => (f.id === id ? { ...f, wasOutOfStock: false } : f)))
    },
    [setFavorites]
  )

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite, replaceFavorites, markRestocked }}>
      {children}
    </FavoritesContext.Provider>
  )
}
