import { useCallback, type ReactNode } from 'react'
import { useSessionStorage } from '../hooks/useSessionStorage'
import { QuotesContext, type SavedQuote } from './quotes-context'

/** Guest-side quotes live only for this browser tab's session (see
 * useSessionStorage) — an account's quotes instead persist on the server
 * until deleted or fulfilled (see AccountSync). */
export function QuotesProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useSessionStorage<SavedQuote[]>('andary-quotes', [])

  const saveQuote = useCallback(
    (quantities: Record<string, number>) => {
      const quote: SavedQuote = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), quantities }
      setQuotes((prev) => [...prev, quote])
    },
    [setQuotes]
  )

  const deleteQuote = useCallback(
    (id: string) => {
      setQuotes((prev) => prev.filter((q) => q.id !== id))
    },
    [setQuotes]
  )

  const replaceQuotes = useCallback((next: SavedQuote[]) => setQuotes(next), [setQuotes])

  return (
    <QuotesContext.Provider value={{ quotes, saveQuote, deleteQuote, replaceQuotes }}>
      {children}
    </QuotesContext.Provider>
  )
}
