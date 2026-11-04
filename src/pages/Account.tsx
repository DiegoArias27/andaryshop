import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/layout/Header'
import GoogleSignInButton from '../components/account/GoogleSignInButton'
import { api } from '../api/client'
import type { Category } from '../api/types'
import { useCustomerAuth } from '../hooks/useCustomerAuth'
import { useCart } from '../hooks/useCart'
import { useFavorites } from '../hooks/useFavorites'
import { useSizePreference } from '../hooks/useSizePreference'
import { useTheme } from '../hooks/useTheme'
import type { ThemeMode } from '../context/theme-context'
import { BackIcon, HeartIcon, CartIcon, SunIcon, MoonIcon, SystemIcon } from '../components/icons'
import LoadingState from '../components/ui/LoadingState'
import TutorialChoiceModal from '../components/tour/TutorialChoiceModal'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0] ?? '?']
  return chars.join('').toUpperCase()
}

function formatMemberSince(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
  } catch {
    return null
  }
}

function Profile() {
  const { customer, logout } = useCustomerAuth()
  const { totalItems } = useCart()
  const { favorites } = useFavorites()
  if (!customer) return null

  const memberSince = formatMemberSince(customer.createdAt)

  return (
    <div className="profile-card">
      <div className="profile-header">
        <div className="profile-avatar">{initials(customer.name)}</div>
        <div>
          <h2 className="profile-name">{customer.name}</h2>
          {memberSince && <p className="profile-since">Cliente desde {memberSince}</p>}
        </div>
      </div>

      {customer.email && (
        <div className="profile-contact">
          <div className="profile-contact__row">
            <span className="profile-contact__label">Correo</span>
            <span>{customer.email}</span>
          </div>
        </div>
      )}

      <div className="profile-links">
        <Link to="/favoritos" className="profile-link">
          <HeartIcon />
          <span>Mis favoritos</span>
          <span className="profile-link__count">{favorites.length}</span>
        </Link>
        <Link to="/carrito" className="profile-link">
          <CartIcon />
          <span>Mi carrito</span>
          <span className="profile-link__count">{totalItems}</span>
        </Link>
      </div>

      <AppearanceSection />
      <SizePreferenceSection />
      <TourResetSection />

      <button className="btn btn--ghost btn--block" onClick={logout}>
        Cerrar sesión
      </button>
    </div>
  )
}

function AuthGate() {
  return (
    <div className="auth-card">
      <h2 className="auth-card__title">Bienvenido</h2>
      <p className="auth-card__subtitle">Inicia sesión con tu cuenta de Google para guardar tu carrito y favoritos.</p>
      <GoogleSignInButton />
      <AppearanceSection />
      <SizePreferenceSection />
      <TourResetSection />
    </div>
  )
}

/** Per-category preferred size — used for quick-add's auto-selected size and
 * to pre-fill the catalog's Talla filter, so the shopper doesn't have to
 * choose it every time. Used to live only in a first-visit modal (gone now,
 * replaced by a Cotizador/tutorial promo there); this is its only input now,
 * saved to this device and, once logged in, synced to the account. */
function SizePreferenceSection() {
  const { sizeByCategory, setSizeForCategory } = useSizePreference()
  const [categories, setCategories] = useState<Category[]>([])
  const [sizesByCategory, setSizesByCategory] = useState<Record<string, string[]> | null>(null)

  useEffect(() => {
    Promise.all([api.getCategories(), api.getProducts()])
      .then(([categoriesData, products]) => {
        setCategories(categoriesData)
        const seen: Record<string, Set<string>> = {}
        for (const p of products) {
          if (!p.category_slug) continue
          const set = seen[p.category_slug] ?? (seen[p.category_slug] = new Set())
          for (const v of p.variants) set.add(v.size)
        }
        const result: Record<string, string[]> = {}
        for (const [slug, sizes] of Object.entries(seen)) result[slug] = [...sizes].sort()
        setSizesByCategory(result)
      })
      .catch(() => setSizesByCategory({}))
  }, [])

  if (!sizesByCategory) return null
  const categoriesWithSizes = categories.filter((c) => (sizesByCategory[c.slug]?.length ?? 0) > 0)
  if (categoriesWithSizes.length === 0) return null

  return (
    <div className="appearance-card">
      <h3 className="appearance-card__title">Tu talla por categoría</h3>
      <p className="size-modal__hint">
        Así no tienes que elegirla cada vez — se guarda en este dispositivo y, si inicias sesión, en tu cuenta.
      </p>
      <div className="size-modal__categories">
        {categoriesWithSizes.map((c) => (
          <div key={c.id} className="size-modal__category">
            <span className="size-modal__category-name">{c.name}</span>
            <div className="size-modal__sizes">
              {sizesByCategory[c.slug].map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`size-modal__chip ${sizeByCategory[c.slug] === size ? 'size-modal__chip--active' : ''}`}
                  onClick={() => setSizeForCategory(c.slug, size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TourResetSection() {
  const [showChoice, setShowChoice] = useState(false)

  return (
    <div className="appearance-card">
      <h3 className="appearance-card__title">¿Necesitas ayuda?</h3>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => setShowChoice(true)}>
        Ver el tutorial de nuevo
      </button>
      {showChoice && <TutorialChoiceModal onClose={() => setShowChoice(false)} />}
    </div>
  )
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { mode: 'light', label: 'Claro', icon: SunIcon },
  { mode: 'dark', label: 'Oscuro', icon: MoonIcon },
  { mode: 'system', label: 'Sistema', icon: SystemIcon },
]

function AppearanceSection() {
  const { mode, setMode } = useTheme()

  return (
    <div className="appearance-card">
      <h3 className="appearance-card__title">Apariencia</h3>
      <div className="appearance-options">
        {THEME_OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => (
          <button
            key={optionMode}
            type="button"
            className={mode === optionMode ? 'appearance-option appearance-option--active' : 'appearance-option'}
            onClick={() => setMode(optionMode)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Account() {
  const { customer, loading } = useCustomerAuth()

  return (
    <div className="page page--account">
      <Header variant="home" />
      <div className="catalog-content">
        <div className="page-title-row">
          <Link to="/" className="icon-btn page-title-row__back" aria-label="Volver al catálogo">
            <BackIcon />
          </Link>
          <h1>Mi cuenta</h1>
        </div>

        {loading ? <LoadingState /> : customer ? <Profile /> : <AuthGate />}
      </div>
    </div>
  )
}
