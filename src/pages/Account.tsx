import { Link } from 'react-router-dom'
import Header from '../components/layout/Header'
import GoogleSignInButton from '../components/account/GoogleSignInButton'
import { useCustomerAuth } from '../hooks/useCustomerAuth'
import { useCart } from '../hooks/useCart'
import { useFavorites } from '../hooks/useFavorites'
import { useTheme } from '../hooks/useTheme'
import type { ThemeMode } from '../context/theme-context'
import { BackIcon, HeartIcon, CartIcon, SunIcon, MoonIcon, SystemIcon } from '../components/icons'
import LoadingState from '../components/ui/LoadingState'

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
      <TourResetSection />
    </div>
  )
}

function TourResetSection() {
  function handleReset() {
    localStorage.removeItem('andary-tour-seen')
    // A full reload (not react-router navigate) — OnboardingTour has been
    // mounted since the app started and already read `andary-tour-seen`
    // into its own state once; only a fresh mount picks up the cleared flag.
    window.location.href = '/'
  }

  return (
    <div className="appearance-card">
      <h3 className="appearance-card__title">¿Necesitas ayuda?</h3>
      <button type="button" className="btn btn--ghost btn--block" onClick={handleReset}>
        Ver el tutorial de nuevo
      </button>
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
