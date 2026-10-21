import { createContext } from 'react'

export interface Customer {
  id: number
  name: string
  email: string | null
  phone: string | null
  /** "Cliente frecuente" discount, applied automatically to the cart total. */
  discountAmount: number
  createdAt: string
}

export interface CustomerAuthContextValue {
  customer: Customer | null
  loading: boolean
  loginWithGoogle: (idToken: string) => Promise<void>
  logout: () => void
}

export const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null)
