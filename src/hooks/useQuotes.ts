import { useContext } from 'react'
import { QuotesContext } from '../context/quotes-context'

export function useQuotes() {
  const ctx = useContext(QuotesContext)
  if (!ctx) throw new Error('useQuotes must be used within a QuotesProvider')
  return ctx
}
