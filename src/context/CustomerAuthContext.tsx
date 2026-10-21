import { useEffect, useState, type ReactNode } from 'react'
import { api, CUSTOMER_TOKEN_KEY } from '../api/client'
import { CustomerAuthContext, type Customer } from './customer-auth-context'

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(() => !!localStorage.getItem(CUSTOMER_TOKEN_KEY))

  useEffect(() => {
    if (!localStorage.getItem(CUSTOMER_TOKEN_KEY)) return
    api
      .getCurrentCustomer()
      .then((data) => setCustomer(data.customer))
      .catch(() => localStorage.removeItem(CUSTOMER_TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  async function loginWithGoogle(idToken: string) {
    const result = await api.loginCustomerWithGoogle(idToken)
    localStorage.setItem(CUSTOMER_TOKEN_KEY, result.token)
    setCustomer(result.customer)
  }

  function logout() {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    setCustomer(null)
  }

  return (
    <CustomerAuthContext.Provider value={{ customer, loading, loginWithGoogle, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  )
}
