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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(CUSTOMER_TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed with status ${res.status}`)
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
