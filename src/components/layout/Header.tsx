import { Link, useNavigate } from 'react-router-dom'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import logo from '../../assets/AndaryShop.jpg'
import { AccountIcon, BackIcon, HeartIcon } from '../icons'

interface HeaderProps {
  variant?: 'home' | 'detail'
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
    </header>
  )
}
