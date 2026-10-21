import { createContext } from 'react'

export interface SavedQuote {
  id: string
  createdAt: string
  /** { [quoteTypeSlug]: quantity } — recalculated live against the current
   * wholesale tiers whenever it's shown, never a frozen price. */
  quantities: Record<string, number>
}

export interface QuotesContextValue {
  quotes: SavedQuote[]
  saveQuote: (quantities: Record<string, number>) => void
  deleteQuote: (id: string) => void
  /** Replaces the whole saved-quotes list at once — used to hydrate from/reset an account's saved state. */
  replaceQuotes: (quotes: SavedQuote[]) => void
}

export const QuotesContext = createContext<QuotesContextValue | null>(null)
