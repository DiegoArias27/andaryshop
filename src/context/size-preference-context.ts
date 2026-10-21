import { createContext } from 'react'

/** categorySlug -> preferred size, chosen once in the "para mayor
 * experiencia" modal so quick-add/package picks can skip asking again. */
export type SizePreferences = Record<string, string>

export interface SizePreferenceContextValue {
  sizeByCategory: SizePreferences
  setSizeForCategory: (categorySlug: string, size: string) => void
  /** Replaces the whole map at once — used to hydrate from/reset an account's saved state. */
  replaceSizePreferences: (prefs: SizePreferences) => void
}

export const SizePreferenceContext = createContext<SizePreferenceContextValue | null>(null)
