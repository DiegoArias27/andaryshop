import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'
import { AccountIcon, HeartIcon, SearchIcon, ShopIcon } from '../icons'
import { showAndFocusMobileSearchInput } from '../../utils/mobileSearchFocus'

export default function BottomNav() {
  const { customer } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const searchOpen = location.pathname === '/' && searchParams.get('buscar') === '1'

  function handleSearchClick() {
    if (searchOpen) {
      navigate('/')
      return
    }
    // iOS only opens the keyboard for a focus() still inside this click —
    // if the search box is already on screen (we're already on the
    // catalog), grab it and focus it right now instead of waiting for the
    // navigate() below to reopen it asynchronously. See mobileSearchFocus.ts.
    showAndFocusMobileSearchInput()
    navigate('/?buscar=1')
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
