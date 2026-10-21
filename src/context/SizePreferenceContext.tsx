import { useCallback, type ReactNode } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { SizePreferenceContext, type SizePreferences } from './size-preference-context'

export function SizePreferenceProvider({ children }: { children: ReactNode }) {
  const [sizeByCategory, setSizeByCategory] = useLocalStorage<SizePreferences>('andary-size-preferences', {})

  const setSizeForCategory = useCallback(
    (categorySlug: string, size: string) => {
      setSizeByCategory((prev) => ({ ...prev, [categorySlug]: size }))
    },
    [setSizeByCategory]
  )

  const replaceSizePreferences = useCallback((next: SizePreferences) => setSizeByCategory(next), [setSizeByCategory])

  return (
    <SizePreferenceContext.Provider value={{ sizeByCategory, setSizeForCategory, replaceSizePreferences }}>
      {children}
    </SizePreferenceContext.Provider>
  )
}
