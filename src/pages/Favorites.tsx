import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../api/types'
import { useFavorites } from '../hooks/useFavorites'
import { useLiveProducts } from '../hooks/useLiveProducts'
import { totalStock } from '../utils/stock'
import Header from '../components/layout/Header'
import ProductCard, { type ProductCardData } from '../components/product/ProductCard'
import { toCardData } from '../utils/productCard'
import { BackIcon } from '../components/icons'

export default function Favorites() {
  const { favorites, markRestocked } = useFavorites()
  const liveProducts = useLiveProducts()
  const [snapshotOf, setSnapshotOf] = useState<Product[] | null>(null)
  const [restockedIds, setRestockedIds] = useState<Set<number>>(new Set())

  const liveById = useMemo(() => new Map(liveProducts.map((p) => [p.id, p])), [liveProducts])

  // Once live stock data is in, snapshot which favorites (favorited while
  // out of stock) have since restocked — computed during render, React's
  // documented way to derive state from a data change, rather than in an
  // effect. Persisting the "seen" flag is the actual side effect, below.
  if (liveProducts !== snapshotOf && liveProducts.length > 0) {
    setSnapshotOf(liveProducts)
    const ids = new Set<number>()
    for (const fav of favorites) {
      if (!fav.wasOutOfStock) continue
      const live = liveById.get(fav.id)
      if (live && totalStock(live) > 0) ids.add(fav.id)
    }
    if (ids.size > 0) setRestockedIds(ids)
  }

  useEffect(() => {
    restockedIds.forEach((id) => markRestocked(id))
  }, [restockedIds, markRestocked])

  const cards: { card: ProductCardData; rawProduct?: Product; backInStock: boolean }[] = favorites.map((fav) => {
    const live = liveById.get(fav.id)
    const card: ProductCardData = live
      ? toCardData(live)
      : { id: fav.id, slug: fav.slug, name: fav.name, price: fav.price, image: fav.image, isNew: fav.isNew }
    return { card, rawProduct: live, backInStock: restockedIds.has(fav.id) }
  })

  return (
    <div className="page page--favorites">
      <Header variant="home" />
      <div className="catalog-content">
        <div className="page-title-row">
          <Link to="/" className="icon-btn page-title-row__back" aria-label="Volver al catálogo">
            <BackIcon />
          </Link>
          <h1>Favoritos</h1>
        </div>
        {favorites.length === 0 ? (
          <div className="empty-state">
            <p>Aún no tienes favoritos.</p>
            <Link to="/" className="btn btn--primary">
              Explorar catálogo
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {cards.map(({ card, rawProduct, backInStock }) => (
              <div key={card.id} className="favorite-card-wrap">
                {backInStock && <span className="badge badge--restock">¡Ya disponible!</span>}
                <ProductCard product={card} rawProduct={rawProduct} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
