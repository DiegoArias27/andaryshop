import { useContext } from 'react'
import { SizePreferenceContext } from '../context/size-preference-context'

export function useSizePreference() {
  const ctx = useContext(SizePreferenceContext)
  if (!ctx) throw new Error('useSizePreference must be used within a SizePreferenceProvider')
  return ctx
}
