import { useMemo, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Collection, Product } from '../../api/types'
import { useCart } from '../../hooks/useCart'
import { useFavorites } from '../../hooks/useFavorites'
import { usePackageBuilder } from '../../hooks/usePackageBuilder'
import { useSizePreference } from '../../hooks/useSizePreference'
import { useToast } from '../../hooks/useToast'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { ProductPromo } from '../../utils/pricing'
import { CartIcon, CheckIcon, HeartIcon } from '../icons'
import { playFavoriteSound } from '../../utils/sound'
import { choicePromptMessage } from '../../utils/choicePrompt'

export interface ProductCardVariant {
  id: number
  size: string
  colorName: string
  colorHex: string
  stock: number
}

export interface ProductCardData {
  id: number
  slug: string
  name: string
  price: string | number
  promo?: ProductPromo | null
  image: string | null
  secondaryImage?: string | null
  /** First photo tagged for each color, if any — lets tapping a color swatch
   * preview that color without leaving the card. */
  imagesByColor?: Record<string, string>
  isNew?: boolean
  /** Computed from real sales — takes priority over isNew when both apply. */
  isBestseller?: boolean
  variants?: ProductCardVariant[]
}

const DOUBLE_TAP_WINDOW = 280

export default function ProductCard({
  product,
  rawProduct,
  autoSize,
  packageCollection,
}: {
  product: ProductCardData
  rawProduct?: Product
  /** The single size active in the top Talla filter, if exactly one is
   * checked — treated as an already-made choice, so quick-add only still
   * needs a color tap (when there's more than one) instead of also
   * requiring an explicit size chip click. */
  autoSize?: string | null
  /** Set only by a collection's own section (CollectionSection) for its own
   * package-type collection — no ambiguity about which package this is, so
   * the card can offer "Añadir a la selección" (and start that exact build
   * on click) even before "Elige tus productos" was pressed. Omitted
   * everywhere else (other sections, search, favorites), where a product
   * that happens to also belong to some package still just adds to cart. */
  packageCollection?: Collection
}) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const { addItem } = useCart()
  const { activeCollection, isInActiveCollection, canPick, pick, startBuildingAndPick, countFor } = usePackageBuilder()
  const { sizeByCategory } = useSizePreference()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const favorite = isFavorite(product.id)
  const [hovered, setHovered] = useState(false)
  const [added, setAdded] = useState(false)
  const [burst, setBurst] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [activeColorName, setActiveColorName] = useState<string | null>(null)
  const [sizeTouched, setSizeTouched] = useState(false)
  const [colorTouched, setColorTouched] = useState(false)
  const [shakeSize, setShakeSize] = useState(false)
  const [shakeColor, setShakeColor] = useState(false)
  const tapTimeoutRef = useRef<number | null>(null)
  const preselectedRef = useRef(false)

  function triggerShake(setShake: (v: boolean) => void) {
    setShake(false)
    window.requestAnimationFrame(() => setShake(true))
    window.setTimeout(() => setShake(false), 900)
  }

  const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price

  const availableSizes = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const v of product.variants ?? []) {
      // A size sold out in EVERY color is dropped entirely — kept if at
      // least one color still has it, so switching color can still reveal
      // it (the per-chip --out styling below still marks it out for
      // whichever color is currently active).
      const soldOutEverywhere = !product.variants?.some((v2) => v2.size === v.size && v2.stock > 0)
      if (!seen.has(v.size) && !soldOutEverywhere) {
        seen.add(v.size)
        list.push(v.size)
      }
    }
    return list
  }, [product.variants])

  const uniqueColors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const v of product.variants ?? []) {
      if (!seen.has(v.colorName)) seen.set(v.colorName, v.colorHex)
    }
    return [...seen.entries()].map(([name, hex]) => ({ name, hex }))
  }, [product.variants])

  /** Colors that actually exist for a given size — the swatch row narrows to
   * this once a size is chosen, instead of always showing every color the
   * product has in any size. */
  function colorsForSize(size: string) {
    const names = new Set(product.variants?.filter((v) => v.size === size).map((v) => v.colorName))
    return uniqueColors.filter((c) => names.has(c.name))
  }

  // Pre-selects a size (and, for it, a color) once the card first has any to
  // offer — a saved site-wide preference (see SizePreferenceModal) wins when
  // it applies to this product's category and this product actually has it
  // in stock; otherwise it just defaults to the first size/color, same as
  // ProductDetail's own default. Only the real-preference case marks
  // size/color as "touched" (skips the quick-add nag) — an arbitrary
  // first-of-the-list default still asks for an explicit confirm, same
  // anti-mistake friction as always. Runs once per card mount so it never
  // overrides a choice the shopper already made here.
  const preferredSize = rawProduct?.category_slug ? sizeByCategory[rawProduct.category_slug] : undefined
  useEffect(() => {
    if (preselectedRef.current || availableSizes.length === 0) return
    preselectedRef.current = true
    const hasRealPreference = !!preferredSize && availableSizes.includes(preferredSize)
    const initialSize = hasRealPreference ? (preferredSize as string) : availableSizes[0]
    setSelectedSize(initialSize)
    const validColors = colorsForSize(initialSize)
    setActiveColorName(validColors[0]?.name ?? null)
    if (hasRealPreference) {
      setSizeTouched(true)
      setColorTouched(true)
    }
    // colorsForSize reads product/uniqueColors, both stable per render of this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredSize, availableSizes])

  const building = !!activeCollection
  const inScope = building && !!rawProduct && isInActiveCollection(rawProduct)
  // Not mid-build, but this card lives inside its own package's section —
  // offer "Añadir a la selección" and have it start that exact build.
  const sectionCandidate = !inScope && !!packageCollection && !!rawProduct ? packageCollection : null
  const packageMode = inScope || !!sectionCandidate
  const filteredSize = autoSize && availableSizes.includes(autoSize) ? autoSize : null

  /** The real ProductVariant for pick()/canPick(), only available when
   * rawProduct was passed (i.e. this card can take part in a package). */
  function packageVariantFor(size: string) {
    const colorName = activeColorName ?? uniqueColors[0]?.name
    return rawProduct?.variants.find((v) => v.size === size && v.color_name === colorName)
  }

  function handleSizePick(e: MouseEvent, size: string) {
    e.preventDefault()
    e.stopPropagation()
    // Picking a size never adds/picks immediately, in any mode (package
    // building included) — it selects the size and, for it, a valid color
    // (kept if the one already active still applies, otherwise the first
    // available one) — the "add"/"añadir a la selección" button below is
    // what commits.
    setSelectedSize(size)
    setSizeTouched(true)
    const validColors = colorsForSize(size)
    setActiveColorName((prev) => (prev && validColors.some((c) => c.name === prev) ? prev : (validColors[0]?.name ?? null)))
    setColorTouched(true)
  }

  useEffect(() => {
    if (!added) return
    const timer = setTimeout(() => setAdded(false), 1500)
    return () => clearTimeout(timer)
  }, [added])

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current)
    }
  }, [])

  function doToggleFavorite() {
    const totalStock = product.variants?.reduce((sum, v) => sum + v.stock, 0)
    toggleFavorite({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price,
      image: product.image,
      isNew: product.isNew,
      wasOutOfStock: totalStock !== undefined && totalStock <= 0,
    })
  }

  function handleToggleFavorite(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    doToggleFavorite()
  }

  function handleQuickAdd(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const needsColor = uniqueColors.length > 1 && !colorTouched
    const needsSize = availableSizes.length > 1 && !sizeTouched && !filteredSize
    if (needsColor || needsSize) {
      if (needsColor) triggerShake(setShakeColor)
      if (needsSize) triggerShake(setShakeSize)
      const message = choicePromptMessage(needsColor, needsSize)
      if (message) showToast(message)
      return
    }
    const colorName = activeColorName ?? uniqueColors[0]?.name
    const effectiveSize = selectedSize ?? filteredSize
    if (inScope && rawProduct) {
      const variant = effectiveSize
        ? rawProduct.variants.find((v) => v.size === effectiveSize && v.color_name === colorName && v.stock > 0)
        : (rawProduct.variants.find((v) => v.color_name === colorName && v.stock > 0) ?? rawProduct.variants.find((v) => v.stock > 0))
      if (!variant) return
      pick(rawProduct, variant)
      setAdded(true)
      return
    }
    if (sectionCandidate && rawProduct) {
      const variant = effectiveSize
        ? rawProduct.variants.find((v) => v.size === effectiveSize && v.color_name === colorName && v.stock > 0)
        : (rawProduct.variants.find((v) => v.color_name === colorName && v.stock > 0) ?? rawProduct.variants.find((v) => v.stock > 0))
      if (!variant) return
      startBuildingAndPick(sectionCandidate, rawProduct, variant)
      setAdded(true)
      return
    }
    const variant = effectiveSize
      ? product.variants?.find((v) => v.size === effectiveSize && v.colorName === colorName && v.stock > 0)
      : (product.variants?.find((v) => v.colorName === colorName && v.stock > 0) ?? product.variants?.find((v) => v.stock > 0))
    if (!variant) return
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price,
      image: product.image,
      size: variant.size,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
    })
    setAdded(true)
  }

  function handleMediaClick(e: MouseEvent) {
    if (isDesktop) return
    e.preventDefault()
    e.stopPropagation()
    if (tapTimeoutRef.current) {
      window.clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = null
      if (!favorite) doToggleFavorite()
      playFavoriteSound()
      setBurst(true)
      window.setTimeout(() => setBurst(false), 700)
    } else {
      tapTimeoutRef.current = window.setTimeout(() => {
        tapTimeoutRef.current = null
        navigate(`/producto/${product.slug}`)
      }, DOUBLE_TAP_WINDOW)
    }
  }

  function handleColorClick(e: MouseEvent, colorName: string) {
    e.preventDefault()
    e.stopPropagation()
    // Once a size is chosen there must always be a color selected for it —
    // only allow toggling back to "none" before any size has been picked.
    setActiveColorName((prev) => (prev === colorName && !selectedSize ? null : colorName))
    setColorTouched(true)
  }

  const canQuickAdd = inScope
    ? !!rawProduct?.variants.some((v) => canPick(rawProduct, v))
    : sectionCandidate
      ? !!rawProduct?.variants.some((v) => v.stock > 0)
      : !!product.variants?.some((v) => v.stock > 0)
  // Used for the AGOTADO ribbon on cards that still render this product
  // (favorites, cart) even though every size/color has sold out — the
  // catalog grid itself never gets this far, since fully sold-out products
  // are already filtered out of `filteredProducts` before reaching here.
  const isFullyOutOfStock = !!product.variants && product.variants.every((v) => v.stock <= 0)
  const activeColorImage = activeColorName ? product.imagesByColor?.[activeColorName] : undefined
  const displayImage = activeColorImage ?? product.image
  const showSecondary = hovered && !activeColorImage && !!product.secondaryImage
  // Once a size is chosen (by tap or by the site-wide preferred-size
  // preselect), the swatch row narrows to only the colors that size
  // actually has — otherwise every color the product has shows, same as before.
  const effectiveSizeForColors = selectedSize ?? filteredSize
  const visibleColors = effectiveSizeForColors ? colorsForSize(effectiveSizeForColors) : uniqueColors

  return (
    <Link
      to={`/producto/${product.slug}`}
      state={packageCollection ? { fromPackageCollection: packageCollection } : undefined}
      className="product-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="product-card__media" onClick={handleMediaClick}>
        {displayImage ? (
          <img
            src={displayImage}
            alt={product.name}
            loading="lazy"
            className={`product-card__img ${showSecondary ? 'product-card__img--hidden' : ''}`}
          />
        ) : (
          <div className="product-card__placeholder" />
        )}
        {product.secondaryImage && (
          <img
            src={product.secondaryImage}
            alt=""
            loading="lazy"
            className={`product-card__img product-card__img--secondary ${showSecondary ? 'product-card__img--visible' : ''}`}
          />
        )}
        {isFullyOutOfStock ? (
          <span className="badge badge--outofstock">AGOTADO</span>
        ) : product.isBestseller ? (
          <span className="badge badge--bestseller">MÁS VENDIDO</span>
        ) : (
          product.isNew && <span className="badge badge--new">NUEVO</span>
        )}

        {/* Desktop: heart stays a normal always-visible toggle. */}
        <button
          className="product-card__fav product-card__fav--desktop"
          onClick={handleToggleFavorite}
          aria-label="Favorito"
          aria-pressed={favorite}
        >
          <HeartIcon filled={favorite} className={favorite ? 'icon--red' : undefined} />
        </button>

        {/* Mobile: no persistent circle until favorited — a subtle hint invites the double-tap gesture instead.
            Once favorited it becomes a real tappable button again, so a single tap can remove it. */}
        {favorite ? (
          <button
            className="product-card__fav product-card__fav--mobile"
            onClick={handleToggleFavorite}
            aria-label="Quitar de favoritos"
            aria-pressed={favorite}
          >
            <HeartIcon filled className="icon--red" />
          </button>
        ) : (
          <span className="product-card__fav-hint" aria-hidden="true">
            <HeartIcon />
            <span>Doble toque</span>
          </span>
        )}
        {burst && (
          <span className="product-card__burst" aria-hidden="true">
            <HeartIcon filled className="icon--red" />
          </span>
        )}

        {canQuickAdd && (
          <button
            className={`product-card__add ${added ? 'product-card__add--done' : ''}`}
            onClick={handleQuickAdd}
            aria-label={packageMode ? 'Añadir a la selección' : 'Añadir al carrito'}
          >
            {added ? <CheckIcon /> : <CartIcon />}
          </button>
        )}

        {canQuickAdd && (
          <button
            className={`product-card__hover-add ${added ? 'product-card__hover-add--done' : ''}`}
            onClick={handleQuickAdd}
          >
            {added ? <CheckIcon /> : <CartIcon />}
            {added ? 'Agregado' : packageMode ? 'Agregar a la selección' : 'Agregar al carrito'}
          </button>
        )}
      </div>
      <div className="product-card__body">
        <h3>{product.name}</h3>
        {(availableSizes.length > 0 || uniqueColors.length > 0) && (
          <div className="product-card__variants">
            {availableSizes.length > 0 && (
              <div className={`product-card__sizes ${shakeSize ? 'product-card__sizes--shake' : ''}`}>
                {availableSizes.map((size) => {
                  const packageVariant = rawProduct ? packageVariantFor(size) : undefined
                  // A size chip is only truly out of stock if EVERY color
                  // lacks it — picking it auto-switches to whichever color
                  // still has it (see handleSizePick), in every mode now.
                  const outOfStock = !product.variants?.some((v) => v.size === size && v.stock > 0)
                  const count = inScope && packageVariant ? countFor(packageVariant.id) : 0
                  // In an active build, also disabled if NO color of this
                  // size is currently pickable toward the collection (a
                  // quota already met, etc.) — checked across every color,
                  // not just whichever one happens to be active right now.
                  const disabled =
                    outOfStock ||
                    (inScope &&
                      count === 0 &&
                      !!rawProduct &&
                      !rawProduct.variants.some((v) => v.size === size && v.stock > 0 && canPick(rawProduct, v)))
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`product-card__size-chip product-card__size-chip--pickable ${count > 0 ? 'product-card__size-chip--selected' : ''} ${outOfStock ? 'product-card__size-chip--out' : ''} ${size === selectedSize && count === 0 ? 'product-card__size-chip--chosen' : ''} ${size === filteredSize && count === 0 ? 'product-card__size-chip--auto' : ''}`}
                      onClick={(e) => handleSizePick(e, size)}
                      disabled={disabled}
                    >
                      {size}
                      {count > 0 && <span className="product-card__size-chip-count">{count}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {visibleColors.length > 0 && (
              <div className={`product-card__colors ${shakeColor ? 'product-card__colors--shake' : ''}`}>
                {visibleColors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`product-card__color-dot ${activeColorName === c.name ? 'product-card__color-dot--active' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    onClick={(e) => handleColorClick(e, c.name)}
                    aria-label={c.name}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
