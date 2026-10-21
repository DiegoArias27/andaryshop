import { useContext } from 'react'
import { PackageBuilderContext } from '../context/package-builder-context'

export function usePackageBuilder() {
  const ctx = useContext(PackageBuilderContext)
  if (!ctx) throw new Error('usePackageBuilder must be used within a PackageBuilderProvider')
  return ctx
}
