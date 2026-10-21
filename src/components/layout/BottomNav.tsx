import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import { AccountIcon, HeartIcon, SearchIcon, ShopIcon } from '../icons'

export default function BottomNav() {
  const { customer } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const searchOpen = location.pathname === '/' && searchParams.get('buscar') === '1'

  function handleSearchClick() {
    navigate(searchOpen ? '/' : '/?buscar=1')
  }

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className="bottom-nav__item">
        <ShopIcon />
        <span>Shop</span>
      </NavLink>
      <button type="button" className="bottom-nav__item" onClick={handleSearchClick}>
        <SearchIcon />
        <span>Buscar</span>
      </button>
      <NavLink to="/favoritos" className="bottom-nav__item">
        <HeartIcon />
        <span>Favoritos</span>
      </NavLink>
      <NavLink to="/cuenta" className="bottom-nav__item" data-tour="account-nav">
        <span className="bottom-nav__icon-wrap">
          <AccountIcon />
          {customer && <span className="bottom-nav__dot" />}
        </span>
        <span>Cuenta</span>
      </NavLink>
    </nav>
  )
}
