import { Link, useNavigate } from 'react-router-dom'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import logo from '../../assets/AndaryShop.jpg'
import { AccountIcon, BackIcon, HeartIcon } from '../icons'

interface HeaderProps {
  variant?: 'home' | 'detail'
}

const LIGHT_COUNT = 16

/** A thin string-lights strip along the header's bottom edge — the one bit
 * of Christmas decor that's always in view, kept deliberately small (5px
 * dots, soft glow) instead of a banner so it reads as a detail, not a
 * promo. Fixed literal colors rather than theme tokens, same reasoning as
 * Snowfall: they should stay warm/festive, not flip with dark mode. */
function HeaderLights() {
  return (
    <div className="header__lights" aria-hidden="true">
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <span key={i} className="header__light" style={{ animationDelay: `${(i % 4) * 0.3}s` }} />
      ))}
    </div>
  )
}

function AccountLink() {
  const { customer } = useCustomerAuth()
  return (
    <Link to="/cuenta" className="icon-btn header__account-btn" aria-label="Mi cuenta" data-tour="account-nav">
      <AccountIcon />
      {customer && <span className="header__account-dot" />}
    </Link>
  )
}

export default function Header({ variant = 'home' }: HeaderProps) {
  const navigate = useNavigate()

  if (variant === 'detail') {
    return (
      <header className="header header--detail">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Volver">
          <BackIcon />
        </button>
        <Link to="/" className="header__logo">
          <img src={logo} alt="Andary Shop" className="header__mark" />
          ANDARY SHOP
        </Link>

        <div className="header__actions">
          <AccountLink />
          <button className="icon-btn header__fav-btn" onClick={() => navigate('/favoritos')} aria-label="Favoritos">
            <HeartIcon />
          </button>
        </div>
        <HeaderLights />
      </header>
    )
  }

  return (
    <header className="header">
      <Link to="/" className="header__logo header__logo--home">
        <img src={logo} alt="Andary Shop" className="header__mark" />
        ANDARY SHOP
      </Link>

      <div className="header__actions header__actions--collapsible">
        <AccountLink />
        <button className="icon-btn header__fav-btn" onClick={() => navigate('/favoritos')} aria-label="Favoritos">
          <HeartIcon />
        </button>
      </div>
      <HeaderLights />
    </header>
  )
}
