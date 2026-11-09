import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Collection, Product, ProductVariant } from '../api/types'
import { colorThumb, productThumb } from '../utils/images'
import Header from '../components/layout/Header'
import ZoomImage from '../components/product/ZoomImage'
import MobileCarousel from '../components/product/MobileCarousel'
import { useCart } from '../hooks/useCart'
import { usePackageBuilder } from '../hooks/usePackageBuilder'
import { useFavorites } from '../hooks/useFavorites'
import { useSizePreference } from '../hooks/useSizePreference'
import { usePulseDirection } from '../hooks/usePulseDirection'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { getPromo } from '../utils/pricing'
import { buildWhatsappNotifyUrl, buildWhatsappOrderUrl, goToWhatsapp, openWhatsappTab, recordOrder } from '../utils/whatsapp'
import { CheckIcon, HeartIcon, MinusIcon, PlusIcon, TagIcon, WhatsappIcon } from '../components/icons'
import NotFound from './NotFound'

export interface EditCartItemState {
  editItem: {
    size: string
    colorName: string
    quantity: number
  }
}

/** Navigated to from a PackagePickerBar thumbnail — edits that one already-
 * picked unit's size/color instead of adding a new one. */
export interface EditSelectionState {
  editSelection: {
    variantId: number
    size: string
    colorName: string
  }
}

/** Carried by a ProductCard rendered inside a package collection's own
 * section (see ProductCard's packageCollection prop) — lets this page offer
 * "Añadir a la selección" for that exact collection even before a build is
 * active, without guessing which package the customer meant. */
export interface FromPackageCollectionState {
  fromPackageCollection: Collection
}

/** Carried by a ProductCard with a color actively selected (see its own
 * state prop) — lets the color the shopper already picked there keep
 * showing here instead of this page recomputing its own default and
 * silently landing on a different one. */
export interface PreselectedColorState {
  preselectedColor: string
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) return <NotFound />
  // Remounting on slug change resets all state naturally instead of manually
  // clearing it inside an effect.
  return <ProductDetail key={slug} slug={slug} />
}

function ProductDetail({ slug }: { slug: string }) {
  const { addItem, removeItem, updateQuantity } = useCart()
  const { activeCollection, isInActiveCollection, packagesFor, canPick, pick, startBuildingAndPick, removeOne } =
    usePackageBuilder()
  const { isFavorite, toggleFavorite } = useFavorites()
  const { sizeByCategory } = useSizePreference()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const navigate = useNavigate()
  const location = useLocation()
  const editItem = (location.state as EditCartItemState | null)?.editItem ?? null
  const editSelection = (location.state as EditSelectionState | null)?.editSelection ?? null
  const fromPackageCollection = (location.state as FromPackageCollectionState | null)?.fromPackageCollection ?? null
  const preselectedColor = (location.state as PreselectedColorState | null)?.preselectedColor ?? null

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const quantityPulse = usePulseDirection(quantity)
  // Editing an existing cart line (editItem): quantity +/- here felt like a
  // live control (it visibly updates right away), but it only actually
  // reached the cart once CONFIRMAR CAMBIOS was pressed afterward — easy to
  // miss since nothing about the stepper itself hints a separate save step
  // is still needed. Syncing it straight to the cart line removes that
  // step entirely; CONFIRMAR CAMBIOS stays for an actual size/color swap.
  useEffect(() => {
    // quantity can be 0 momentarily while the input is cleared to retype a
    // new number (see its onChange below) — syncing that would delete the
    // cart line outright (updateQuantity treats <= 0 as a removal) before
    // the new digits ever land.
    if (!editItem || !product || quantity <= 0) return
    updateQuantity(product.id, editItem.size, editItem.colorName, quantity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, product])
  const [lastAddedVariantId, setLastAddedVariantId] = useState<number | null>(null)
  const [activeImage, setActiveImage] = useState(0)
  const [sizeTouched, setSizeTouched] = useState(false)
  const [colorTouched, setColorTouched] = useState(false)
  const [shakeSize, setShakeSize] = useState(false)
  const [shakeColor, setShakeColor] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ignore = false

    api
      .getProductBySlug(slug)
      .then((data) => {
        if (ignore) return
        setProduct(data)
        const matchingVariant = editItem
          ? data.variants.find((v) => v.size === editItem.size && v.color_name === editItem.colorName)
          : editSelection
            ? data.variants.find((v) => v.size === editSelection.size && v.color_name === editSelection.colorName)
            : null
        // A fresh visit should never default into a sold-out combo — prefer
        // whatever's actually in stock, only falling back to a 0-stock
        // variant if literally everything is out (better than nothing
        // selected). Editing an existing cart line (matchingVariant) is the
        // one case that intentionally keeps whatever the customer already
        // has, sold out or not — see the "Agotado" message below.
        const firstVariant = matchingVariant ?? data.variants.find((v) => v.stock > 0) ?? data.variants[0]
        // A saved per-category size preference (see SizePreferenceModal)
        // counts as the size already being chosen — pins the size to it and
        // auto-picks the first in-stock color FOR that size (not whatever
        // color firstVariant happened to be), only still asking for a color
        // when this product doesn't carry that size at all in stock.
        const preferredSize = data.category_slug ? sizeByCategory[data.category_slug] : undefined
        const preferredSizeHasStock =
          !matchingVariant && !!preferredSize && data.variants.some((v) => v.size === preferredSize && v.stock > 0)
        // Whatever color was already active on the ProductCard this was
        // opened from (see PreselectedColorState) — outranks the generic
        // defaults below, same idea as the size preference, so the photo
        // showing here matches the one the shopper was just looking at.
        const preselectedColorHasStock =
          !matchingVariant &&
          !preferredSizeHasStock &&
          !!preselectedColor &&
          data.variants.some((v) => v.color_name === preselectedColor && v.stock > 0)
        const initialSize = preferredSizeHasStock
          ? (preferredSize as string)
          : preselectedColorHasStock
            ? (data.variants.find((v) => v.color_name === preselectedColor && v.stock > 0)?.size ?? null)
            : (firstVariant?.size ?? null)
        const initialColor = preferredSizeHasStock
          ? (data.variants.find((v) => v.size === initialSize && v.stock > 0)?.color_name ?? null)
          : preselectedColorHasStock
            ? preselectedColor
            : (firstVariant?.color_name ?? null)
        setSelectedColor(initialColor)
        setSelectedSize(initialSize)
        setQuantity(editItem?.quantity ?? 1)
        setSizeTouched(!!matchingVariant || preferredSizeHasStock || preselectedColorHasStock)
        setColorTouched(!!matchingVariant || preferredSizeHasStock || preselectedColorHasStock)
        setLoading(false)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      ignore = true
    }
    // sizeByCategory is only consulted for the initial pre-fill, not re-applied
    // if the preference changes while already viewing this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, editItem, editSelection])

  const gallery = useMemo(() => {
    if (!product) return []
    // main_image_url always mirrors the lowest-sort_order gallery photo, so
    // product.images already contains it — no need to prepend it separately.
    const colorImages = product.images.filter((img) => img.color_name === selectedColor)
    const pool = colorImages.length > 0 ? colorImages : product.images.filter((img) => img.color_name === null)
    const urls = pool.map((img) => img.image_url)
    return urls.length > 0 ? urls : product.main_image_url ? [product.main_image_url] : []
  }, [product, selectedColor])

  // activeImage is a thumbnail INDEX, not tied to which color it was picked
  // under — switching color left it pointing at whatever index it was last
  // at in the PREVIOUS color's gallery, which could land on a different,
  // unrelated photo (or the wrong one entirely) once the new color's own
  // gallery resolves. Jumping back to this color's main photo every time
  // the gallery itself changes is what "selecting a color" should show.
  useEffect(() => {
    setActiveImage(0)
  }, [gallery])

  // On mobile the photo alone can fill most of the first screen, so TALLA/
  // COLOR — the very first thing there's actually something to do here —
  // never showed without scrolling down by hand first. Nudges down to them
  // once the product is ready, not all the way (block: 'center' keeps the
  // bottom of the photo in view too, so the page doesn't just jump straight
  // past it). Runs once per product, not on every re-render.
  useEffect(() => {
    if (isDesktop || !product) return
    const frame = requestAnimationFrame(() => {
      optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, isDesktop])

  const colors = useMemo(() => {
    if (!product) return []
    const seen = new Map<string, ProductVariant>()
    product.variants.forEach((v) => {
      if (!seen.has(v.color_name)) seen.set(v.color_name, v)
    })
    return [...seen.values()]
  }, [product])

  const sizes = useMemo(() => {
    if (!product) return []
    const seen = new Set<string>()
    const list: string[] = []
    for (const v of product.variants) {
      if (!seen.has(v.size)) {
        seen.add(v.size)
        list.push(v.size)
      }
    }
    return list
  }, [product])

  // What actually gets offered as a choice — a size sold out in every color
  // only stays in this list while it's the one already selected (editing a
  // cart line, or a remembered preference that has since sold out), so "pick
  // a size" logic isn't thrown off by options nobody can actually pick.
  const visibleSizes = useMemo(
    () => sizes.filter((size) => product?.variants.some((v) => v.size === size && v.stock > 0) || size === selectedSize),
    [sizes, product, selectedSize]
  )

  // Colors narrow to whatever the selected size actually has — same
  // "keep the already-picked one visible even sold out" allowance as sizes.
  // Nothing selected yet (shouldn't normally happen once loaded) just shows
  // every color the product has.
  const visibleColorsForSize = useMemo(() => {
    if (!product || !selectedSize) return colors
    return colors.filter(
      (c) =>
        product.variants.some((v) => v.size === selectedSize && v.color_name === c.color_name && v.stock > 0) ||
        c.color_name === selectedColor
    )
  }, [colors, product, selectedSize, selectedColor])

  const activeVariant = useMemo(
    () => product?.variants.find((v) => v.size === selectedSize && v.color_name === selectedColor) ?? null,
    [product, selectedSize, selectedColor]
  )

  const added = activeVariant !== null && lastAddedVariantId === activeVariant.id

  /** Shakes (and illuminates) whichever of SIZE/COLOR still needs an
   * explicit tap — the "elige una talla/color" mention renders inline inside
   * that same red box (see the option-group JSX below) for as long as it's
   * shaking, instead of a separate toast. Returns true if it prompted for
   * something (caller should stop there instead of proceeding). */
  function promptForChoice(): boolean {
    const needsColorPrompt = visibleColorsForSize.length > 1 && !colorTouched
    const needsSizePrompt = visibleSizes.length > 1 && !sizeTouched
    if (!needsColorPrompt && !needsSizePrompt) return false
    if (needsSizePrompt) {
      setShakeSize(false)
      window.requestAnimationFrame(() => setShakeSize(true))
      window.setTimeout(() => setShakeSize(false), 900)
    }
    if (needsColorPrompt) {
      setShakeColor(false)
      window.requestAnimationFrame(() => setShakeColor(true))
      window.setTimeout(() => setShakeColor(false), 900)
    }
    return true
  }

  // Landing here mid-package-build (or straight from a package collection's
  // own section) should ask for the size/color right away instead of
  // waiting for a failed tap on "AÑADIR A LA SELECCIÓN" first.
  useEffect(() => {
    if (!product || editSelection) return
    const eligible = activeCollection
      ? isInActiveCollection(product)
      : !!fromPackageCollection && packagesFor(product).some((c) => c.id === fromPackageCollection.id)
    if (!eligible) return
    promptForChoice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, activeCollection])

  // On mobile the gallery sits above TALLA/COLOR, tall enough that picking a
  // COLOR (the only one of the two that actually changes the photo — see
  // the gallery useMemo above) doesn't show the result without scrolling
  // back up by hand. Size on its own never changes the photo, so it stays
  // put — scrolling there would just be a jarring jump with nothing new to
  // actually see at the top.
  function scrollToGalleryTop() {
    if (isDesktop) return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSelectColor(colorName: string) {
    // Colors shown are already narrowed to the selected size (see
    // visibleColorsForSize), so picking one never needs to touch the size.
    setSelectedColor(colorName)
    setColorTouched(true)
    scrollToGalleryTop()
  }

  function handleSelectSize(size: string) {
    setSelectedSize(size)
    setSizeTouched(true)
    // A size must always leave a color selected — keep the current one if
    // it's still valid for this size, otherwise auto-pick the first
    // available (in-stock first) color for it. Always editable afterward.
    setSelectedColor((prev) => {
      const validForSize = (name: string | null) =>
        !!name && !!product?.variants.some((v) => v.size === size && v.color_name === name)
      if (validForSize(prev)) return prev
      const firstInStock = product?.variants.find((v) => v.size === size && v.stock > 0)?.color_name
      const firstAny = product?.variants.find((v) => v.size === size)?.color_name
      return firstInStock ?? firstAny ?? null
    })
    setColorTouched(true)
  }

  function handleAddToCart() {
    if (!product || !activeVariant) return
    if (promptForChoice()) return
    const isOut = activeVariant.stock <= 0
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: parseFloat(product.price),
        image: colorThumb(product, activeVariant.color_name),
        size: activeVariant.size,
        colorName: activeVariant.color_name,
        colorHex: activeVariant.color_hex,
        preorder: isOut,
      },
      isOut ? 1 : Math.max(1, quantity)
    )
    setLastAddedVariantId(activeVariant.id)
  }

  function handleConfirmChanges() {
    if (!product || !activeVariant || !editItem) return
    const isOut = activeVariant.stock <= 0
    removeItem(product.id, editItem.size, editItem.colorName)
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: parseFloat(product.price),
        image: colorThumb(product, activeVariant.color_name),
        size: activeVariant.size,
        colorName: activeVariant.color_name,
        colorHex: activeVariant.color_hex,
        preorder: isOut,
      },
      isOut ? 1 : Math.max(1, quantity)
    )
    navigate('/carrito')
  }

  async function handleQuickOrder() {
    if (!product || !activeVariant) return
    const isOut = activeVariant.stock <= 0

    const item = {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: parseFloat(product.price),
      image: colorThumb(product, activeVariant.color_name),
      size: activeVariant.size,
      colorName: activeVariant.color_name,
      colorHex: activeVariant.color_hex,
      quantity: Math.max(1, quantity),
      preorder: isOut,
    }
    // Opened synchronously so it isn't blocked by the popup blocker — its
    // location is filled in once the folio comes back.
    const whatsappTab = openWhatsappTab()
    const folio = await recordOrder([{ item, unitPrice: parseFloat(product.price) }], '')

    if (isOut) {
      goToWhatsapp(
        whatsappTab,
        buildWhatsappNotifyUrl(
          { name: product.name, size: activeVariant.size, colorName: activeVariant.color_name, slug: product.slug },
          folio
        )
      )
      return
    }

    goToWhatsapp(whatsappTab, buildWhatsappOrderUrl([item], '', folio))
  }

  function handlePickForPackage() {
    if (!product || !activeVariant) return
    if (promptForChoice()) return
    if (activeCollection) {
      for (let i = 0; i < Math.max(1, quantity); i++) pick(product, activeVariant)
      return
    }
    if (sectionCandidate) startBuildingAndPick(sectionCandidate, product, activeVariant, Math.max(1, quantity))
  }

  function handleConfirmSelectionEdit() {
    if (!product || !activeVariant || !editSelection) return
    removeOne(editSelection.variantId)
    pick(product, activeVariant)
    navigate(-1)
  }

  function handleToggleFavorite() {
    if (!product) return
    const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0)
    toggleFavorite({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: parseFloat(product.price),
      image: productThumb(product),
      isNew: !!product.is_new,
      wasOutOfStock: totalStock <= 0,
    })
  }

  if (loading) {
    return (
      <div className="page page--detail">
        <Header variant="detail" />
        <div className="detail-layout">
          <div className="detail-gallery">
            <div className="skeleton detail-skeleton__media" />
          </div>
          <div className="detail-body">
            <div className="skeleton detail-skeleton__line detail-skeleton__line--title" />
            <div className="skeleton detail-skeleton__line detail-skeleton__line--price" />
            <div className="skeleton detail-skeleton__line" />
            <div className="skeleton detail-skeleton__line detail-skeleton__line--short" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="page page--detail">
        <Header variant="detail" />
        <div className="auth-card" style={{ marginTop: 24 }}>
          <h2 className="auth-card__title">Producto no disponible</h2>
          <p className="auth-card__subtitle">{error || 'No encontramos este producto.'}</p>
          <Link to="/" className="btn btn--primary">
            Volver al catálogo
          </Link>
        </div>
      </div>
    )
  }

  const favorite = isFavorite(product.id)
  const outOfStock = !activeVariant || activeVariant.stock <= 0
  const currentImage = gallery[activeImage % gallery.length] ?? gallery[0] ?? null
  const promo = getPromo(product)
  // Swap the purchase buttons for the package picker's own "add" action
  // whenever this product is already part of an in-progress build, or was
  // reached straight from that package's own section (see
  // FromPackageCollectionState) — never from a generic, ambiguous lookup.
  const alreadyBuilding = !!activeCollection && isInActiveCollection(product)
  const sectionCandidate =
    !activeCollection && fromPackageCollection && packagesFor(product).some((c) => c.id === fromPackageCollection.id)
      ? fromPackageCollection
      : null
  const buildingForThisProduct = alreadyBuilding || !!sectionCandidate
  const canAddToPackage =
    buildingForThisProduct &&
    !!activeVariant &&
    (alreadyBuilding ? canPick(product, activeVariant) : activeVariant.stock > 0)
  // Every package this product belongs to, mentioned regardless of whether
  // a build is active — tapping one jumps to that collection's own section
  // instead of starting or switching a build (only that collection's own
  // "Elige tus productos" does that).
  const packageMatches = packagesFor(product)

  // Home and Paquetes each have their own independent curated layout (see
  // "Orden de Inicio"/"Orden de Paquetes" in admin) — a collection's own
  // show_on_home flag only seeds that list the first time it's ever
  // touched; the admin can freely add/remove collections from either page
  // afterward without it changing, so it can't be trusted as "this is
  // where the collection actually renders" on its own. Asking the Paquetes
  // layout itself whether this collection is in it is the only way to
  // know for sure — falling back to Home (the more common case) if not.
  async function collectionPath(slug: string, collectionId: number) {
    try {
      const packagesLayout = await api.getPageLayout('packages')
      if (packagesLayout.some((e) => e.type === 'collection' && e.id === collectionId)) {
        return `/?paquetes=1#collection-${slug}`
      }
    } catch {
      // Fall through to the Home guess below.
    }
    return `/#collection-${slug}`
  }

  async function handlePromoClick(e: MouseEvent) {
    if (!promo || promo.type !== 'bundle') return
    e.preventDefault()
    const collection = packageMatches.find((c) => c.slug === promo.collectionSlug)
    if (!collection) {
      navigate(`/#collection-${promo.collectionSlug}`)
      return
    }
    navigate(await collectionPath(collection.slug, collection.id))
  }

  async function handlePackageBadgeClick(e: MouseEvent, collection: Collection) {
    e.preventDefault()
    navigate(await collectionPath(collection.slug, collection.id))
  }

  return (
    <div className="page page--detail">
      <Header variant="detail" />

      <div className="detail-layout">
      <div className="detail-gallery">
        {isDesktop ? (
          <>
            <div className="detail-media">
              {currentImage ? (
                <ZoomImage src={currentImage} alt={product.name} />
              ) : (
                <div className="detail-media__placeholder" />
              )}
            </div>

            {gallery.length > 1 && (
              <div className="detail-thumbs">
                {gallery.map((url, index) => (
                  <button
                    key={url + index}
                    className={`detail-thumb ${activeImage === index ? 'detail-thumb--active' : ''}`}
                    onMouseEnter={() => setActiveImage(index)}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Foto ${index + 1}`}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <MobileCarousel images={gallery} alt={product.name} />
        )}
      </div>

      <div className="detail-body">
        {editItem && <span className="badge badge--blink">EDITANDO ARTÍCULO DEL CARRITO</span>}
        {editSelection && <span className="badge badge--blink">EDITANDO ARTÍCULO DE LA SELECCIÓN</span>}
        {product.is_bestseller ? (
          <span className="badge badge--bestseller">MÁS VENDIDO</span>
        ) : (
          !!product.is_new && <span className="badge badge--muted">NUEVO MODELO</span>
        )}
        <h1>{product.name}</h1>
        {promo && promo.type === 'bundle' ? (
          <button className="detail-promo-link" onClick={handlePromoClick}>
            <TagIcon /> Descuento disponible en {promo.collectionName}
          </button>
        ) : (
          packageMatches.length > 0 && (
            <div className="detail-package-hint">
              <span className="detail-package-hint-label">
                <TagIcon /> Disponible en {packageMatches.length === 1 ? 'el paquete' : 'los paquetes'}
              </span>
              <div className="detail-package-chips">
                {packageMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="detail-package-chip"
                    onClick={(e) => handlePackageBadgeClick(e, c)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {product.description && <p className="detail-desc">{product.description}</p>}

        <hr />

        <div ref={optionsRef}>
        {visibleSizes.length > 0 && (
          <div className={`option-group ${shakeSize ? 'option-group--shake' : ''}`}>
            <span className="option-group__label">TALLA</span>
            {shakeSize && <p className="option-group__nudge">Elige una talla</p>}
            <div className="sizes">
              {/* A size sold out in every color drops off the list entirely
                  for anyone landing fresh — it only stays visible here while
                  it's the ALREADY-selected size (editing a cart line, or a
                  remembered preference that has since sold out), so that one
                  customer still sees the "Agotado" state below instead of
                  their choice silently vanishing, without ever offering that
                  size to a new visitor who hasn't picked it. Picking a size
                  never depends on the currently active color — it's the
                  other way around now (see handleSelectSize). */}
              {visibleSizes.map((size) => (
                <button
                  key={size}
                  className={`size-btn ${selectedSize === size ? 'size-btn--active' : ''} ${
                    !product.variants.some((v) => v.size === size && v.stock > 0) ? 'size-btn--disabled' : ''
                  }`}
                  onClick={() => handleSelectSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {visibleColorsForSize.length > 0 && (
          <div className={`option-group ${shakeColor ? 'option-group--shake' : ''}`}>
            <span className="option-group__label">COLOR</span>
            {shakeColor && <p className="option-group__nudge">Elige un color</p>}
            <div className="swatches">
              {visibleColorsForSize.map((c) => (
                <button
                  key={c.color_name}
                  className={`swatch ${selectedColor === c.color_name ? 'swatch--active' : ''}`}
                  style={{ backgroundColor: c.color_hex }}
                  onClick={() => handleSelectColor(c.color_name)}
                  aria-label={c.color_name}
                  aria-pressed={selectedColor === c.color_name}
                />
              ))}
            </div>
            {selectedColor && <p className="option-group__value">{selectedColor}</p>}
          </div>
        )}
        </div>

        {activeVariant && activeVariant.stock === 0 && (
          <p className="stock-status stock-status--out">
            Agotado — puedes añadirlo al carrito para preguntar la fecha de reabastecimiento.
          </p>
        )}
        {activeVariant && activeVariant.stock > 0 && activeVariant.stock <= 5 && (
          <p className="stock-status stock-status--low">¡Solo quedan {activeVariant.stock} unidades!</p>
        )}

        <div className="option-group">
          <span className="option-group__label">CANTIDAD</span>
          <div className={`qty-stepper ${quantityPulse ? `qty-pulse--${quantityPulse}` : ''}`}>
            <button
              onClick={() => setQuantity((q) => Math.max(1, (q || 1) - 1))}
              aria-label="Restar"
              disabled={outOfStock || (quantity !== 0 && quantity <= 1)}
            >
              <MinusIcon />
            </button>
            <input
              type="number" inputMode="numeric"
              min={1}
              max={activeVariant?.stock ?? undefined}
              value={outOfStock ? 1 : quantity === 0 ? '' : quantity}
              placeholder="1"
              disabled={outOfStock}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  setQuantity(0)
                  return
                }
                const n = Number(raw)
                if (!Number.isFinite(n)) return
                const max = activeVariant?.stock ?? n
                setQuantity(Math.max(0, Math.min(max, Math.round(n))))
              }}
              onBlur={() => setQuantity((q) => Math.max(1, q))}
            />
            <button
              onClick={() => setQuantity((q) => Math.min(activeVariant?.stock ?? 1, (q || 1) + 1))}
              aria-label="Sumar"
              disabled={outOfStock || !activeVariant || quantity >= activeVariant.stock}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="detail-footer">
        {editSelection ? (
          <button className="btn btn--primary" onClick={handleConfirmSelectionEdit} disabled={!activeVariant}>
            CONFIRMAR CAMBIOS
          </button>
        ) : buildingForThisProduct ? (
          <button className="btn btn--primary" onClick={handlePickForPackage} disabled={!canAddToPackage}>
            AÑADIR A LA SELECCIÓN
          </button>
        ) : editItem ? (
          <button className="btn btn--primary" onClick={handleConfirmChanges}>
            CONFIRMAR CAMBIOS
          </button>
        ) : (
          <button className={`btn btn--primary ${outOfStock ? 'btn--outofstock' : ''}`} onClick={handleAddToCart}>
            {outOfStock ? (
              added ? (
                <>
                  <CheckIcon /> TE AVISAREMOS
                </>
              ) : (
                'AGOTADO · AVISARME'
              )
            ) : added ? (
              <>
                <CheckIcon /> AGREGADO
              </>
            ) : (
              'AÑADIR AL CARRITO'
            )}
          </button>
        )}
        {!buildingForThisProduct && (
          <button className="btn btn--whatsapp btn--sm" onClick={handleQuickOrder}>
            <WhatsappIcon /> <span className="btn--whatsapp__label">{outOfStock ? 'AVISARME' : 'PEDIR'}</span>
          </button>
        )}
        <button
          className={`icon-btn icon-btn--bordered ${favorite ? 'icon-btn--active' : ''}`}
          onClick={handleToggleFavorite}
          aria-label="Favorito"
        >
          <HeartIcon filled={favorite} className={favorite ? 'icon--red' : undefined} />
        </button>
      </div>
      </div>
    </div>
  )
}
