import type {
  Banner,
  BannerPlacement,
  Brand,
  Category,
  Collection,
  PackagesTile,
  PageLayoutEntry,
  PageLayoutPage,
  Product,
  WholesaleTier,
} from './types'
import type { Customer } from '../context/customer-auth-context'
import type { CartItem } from '../context/cart-context'
import type { FavoriteProduct } from '../context/favorites-context'
import type { SavedQuote } from '../context/quotes-context'
import type { CatalogFilters } from '../context/catalog-filters-context'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const CUSTOMER_TOKEN_KEY = 'andary-customer-token'

// The backend already writes most customer-reachable error strings in
// Spanish (e.g. "Stock insuficiente — …"), which pass straight through
// as-is below. This only covers the handful that are still raw English
// (generic CRUD scaffolding, shared with admin-only endpoints, or a
// catch-all like "Internal server error") — anything a shopper could
// otherwise see verbatim on a screen like ProductDetail's error state.
const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  'Product not found': 'No encontramos este producto — puede que ya no esté disponible.',
  'Customer not found': 'No encontramos tu cuenta — intenta iniciar sesión de nuevo.',
  'idToken is required': 'No se pudo completar el inicio de sesión con Google. Intenta de nuevo.',
  'items is required': 'Tu carrito está vacío.',
  'Missing or invalid Authorization header': 'Tu sesión expiró — inicia sesión de nuevo.',
  'Invalid or expired token': 'Tu sesión expiró — inicia sesión de nuevo.',
  'Route not found': 'No pudimos conectar con el servidor. Intenta de nuevo en unos segundos.',
  'Duplicate entry': 'Ya existe un registro con esos datos.',
  'Internal server error': 'Algo salió mal de nuestro lado. Intenta de nuevo en unos segundos.',
}

function friendlyStatusMessage(status: number): string {
  if (status === 401) return 'Tu sesión expiró — inicia sesión de nuevo.'
  if (status === 404) return 'No encontramos lo que buscabas.'
  if (status === 429) return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  if (status >= 500) return 'Algo salió mal de nuestro lado. Intenta de nuevo en unos segundos.'
  return 'Ocurrió un error. Intenta de nuevo.'
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(CUSTOMER_TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('No hay conexión a internet. Revisa tu conexión e intenta de nuevo.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const rawMessage = body.error as string | undefined
    throw new Error((rawMessage && FRIENDLY_ERROR_MESSAGES[rawMessage]) || rawMessage || friendlyStatusMessage(res.status))
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export interface ProductQuery {
  category?: string
  brand?: string
  search?: string
  isNew?: boolean
  isFeatured?: boolean
}

export const api = {
  getCategories: () => request<Category[]>('/categories'),
  getPackagesTile: () => request<PackagesTile>('/packages-tile'),
  getBrands: () => request<Brand[]>('/brands'),

  getProducts: (query: ProductQuery = {}) => {
    const params = new URLSearchParams()
    if (query.category) params.set('category', query.category)
    if (query.brand) params.set('brand', query.brand)
    if (query.search) params.set('search', query.search)
    if (query.isNew) params.set('isNew', 'true')
    if (query.isFeatured) params.set('isFeatured', 'true')
    const qs = params.toString()
    return request<Product[]>(`/products${qs ? `?${qs}` : ''}`)
  },

  getProductBySlug: (slug: string) => request<Product>(`/products/slug/${encodeURIComponent(slug)}`),

  getCollections: () => request<Collection[]>('/collections'),
  getBanners: (query: { placement?: BannerPlacement; categorySlug?: string } = {}) => {
    const params = new URLSearchParams()
    if (query.placement) params.set('placement', query.placement)
    if (query.categorySlug) params.set('categorySlug', query.categorySlug)
    const qs = params.toString()
    return request<Banner[]>(`/banners${qs ? `?${qs}` : ''}`)
  },
  getWholesaleTiers: () => request<WholesaleTier[]>('/wholesale-tiers'),
  getPageLayout: (page: PageLayoutPage) => request<PageLayoutEntry[]>(`/page-layouts/${page}`),

  // Recorded automatically whenever "Enviar pedido por WhatsApp" is
  // clicked (guest or logged in) — see admin's Pedidos page.
  createOrder: (data: {
    items: {
      productId: number
      size: string
      colorName: string
      name: string
      image: string | null
      unitPrice: number
      quantity: number
      isPreorder?: boolean
      isGift?: boolean
      collectionId?: number
      collectionName?: string
      tierKey?: string | null
    }[]
    notes?: string
  }) => request<{ id: number }>('/orders', { method: 'POST', body: JSON.stringify(data) }),

  loginCustomerWithGoogle: (idToken: string) =>
    request<{ token: string; customer: Customer }>('/customers/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  getCurrentCustomer: () => request<{ customer: Customer }>('/customers/me'),

  getCustomerData: () =>
    request<{
      cart: CartItem[]
      favorites: FavoriteProduct[]
      sizePreferences: Record<string, string>
      quotes: SavedQuote[]
      catalogFilters: CatalogFilters
    }>('/customers/data'),
  saveCustomerData: (data: {
    cart: CartItem[]
    favorites: FavoriteProduct[]
    sizePreferences: Record<string, string>
    quotes: SavedQuote[]
    catalogFilters: CatalogFilters
  }) =>
    request<{
      cart: CartItem[]
      favorites: FavoriteProduct[]
      sizePreferences: Record<string, string>
      quotes: SavedQuote[]
      catalogFilters: CatalogFilters
    }>('/customers/data', {
      method: 'PUT',
      body: JSON.stringify(data),
      // Survives a reload/navigation that happens right after — e.g.
      // clicking "Limpiar" and immediately reloading — so the save isn't
      // dropped mid-flight, which would otherwise let the next load's
      // "trust the server" fetch pull back the stale pre-clear value.
      keepalive: true,
    }),
}

export { CUSTOMER_TOKEN_KEY }
