import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { CustomerAuthProvider } from './context/CustomerAuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { PackageBuilderProvider } from './context/PackageBuilderContext'
import { SizePreferenceProvider } from './context/SizePreferenceContext'
import { QuotesProvider } from './context/QuotesContext'
import { CatalogFiltersProvider } from './context/CatalogFiltersContext'
import { ToastProvider } from './context/ToastContext'
import AccountSync from './components/account/AccountSync'
import BottomNav from './components/layout/BottomNav'
import Footer from './components/layout/Footer'
import ScrollToTopButton from './components/layout/ScrollToTopButton'
import ScrollToTopOnNavigate from './components/layout/ScrollToTopOnNavigate'
import CartBubble from './components/cart/CartBubble'
import CartDrawer from './components/cart/CartDrawer'
import CotizadorBubble from './components/product/CotizadorBubble'
import PackagePickerBar from './components/product/PackagePickerBar'
import OnboardingTour from './components/tour/OnboardingTour'
import Catalog from './pages/Catalog'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Favorites from './pages/Favorites'
import Account from './pages/Account'
import Cotizador from './pages/Cotizador'
import NotFound from './pages/NotFound'

function Layout() {
  const location = useLocation()
  const hideBottomNav = location.pathname.startsWith('/producto/')
  // The package picker bar is about building a selection while browsing the
  // catalog — showing it over the account page (login/orders/profile) makes
  // no sense there and just floats an orphaned "cancelar selección" pill.
  const hidePackagePicker = location.pathname.startsWith('/cuenta') || location.pathname.startsWith('/cotizador')

  return (
    <div className="app-shell">
      <ScrollToTopOnNavigate />
      <main className={hideBottomNav ? 'app-main app-main--full' : 'app-main'}>
        <div className="route-content">
          <Routes>
            <Route path="/" element={<Catalog />} />
            <Route path="/producto/:slug" element={<ProductDetail />} />
            <Route path="/carrito" element={<Cart />} />
            <Route path="/favoritos" element={<Favorites />} />
            <Route path="/cuenta" element={<Account />} />
            <Route path="/cotizador" element={<Cotizador />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <Footer />
      </main>
      <ScrollToTopButton />
      <CartBubble />
      <CotizadorBubble />
      <CartDrawer />
      {!hidePackagePicker && <PackagePickerBar />}
      {!hideBottomNav && <BottomNav />}
      <OnboardingTour />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <FavoritesProvider>
              <SizePreferenceProvider>
                <QuotesProvider>
                  <CatalogFiltersProvider>
                    <PackageBuilderProvider>
                      <AccountSync>
                        <BrowserRouter>
                          <Layout />
                        </BrowserRouter>
                      </AccountSync>
                    </PackageBuilderProvider>
                  </CatalogFiltersProvider>
                </QuotesProvider>
              </SizePreferenceProvider>
            </FavoritesProvider>
          </CartProvider>
        </CustomerAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
