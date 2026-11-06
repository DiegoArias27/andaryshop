import { useEffect, useRef, useState } from 'react'
import type { Category } from '../../api/types'

interface CategoryPillsProps {
  categories: Category[]
  activeSlug: string | null
  onSelect: (slug: string | null) => void
  /** Whether the "Paquetes" filtered view (see packagesOnly in Catalog.tsx)
   * is the active one right now. */
  packagesActive?: boolean
  onSelectPackages?: () => void
  /** Category slugs to flag as relevant to the package currently being
   * assembled — set while a build is active, so the customer knows where
   * to look without needing to guess. */
  highlightSlugs?: Set<string>
}

export default function CategoryPills({
  categories,
  activeSlug,
  onSelect,
  packagesActive,
  onSelectPackages,
  highlightSlugs,
}: CategoryPillsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Only shown while the row can actually still scroll further right — not
  // a permanent decoration — so it never lies about there being more once
  // you've reached the last pill.
  const [canScrollMore, setCanScrollMore] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function check() {
      setCanScrollMore(el!.scrollWidth - el!.clientWidth - el!.scrollLeft > 4)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const resizeObserver = new ResizeObserver(check)
    resizeObserver.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      resizeObserver.disconnect()
    }
  }, [categories.length, onSelectPackages])

  return (
    <div className="category-pills-wrap">
      <div className="category-pills" data-tour="categories" ref={scrollRef}>
        <button className={`pill ${activeSlug === null && !packagesActive ? 'pill--active' : ''}`} onClick={() => onSelect(null)}>
          Inicio
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`pill ${activeSlug === category.slug ? 'pill--active' : ''} ${
              highlightSlugs?.has(category.slug) ? 'pill--highlight' : ''
            }`}
            onClick={() => onSelect(category.slug)}
          >
            {category.name}
          </button>
        ))}
        {onSelectPackages && (
          <button
            className={`pill ${packagesActive ? 'pill--active' : ''}`}
            onClick={onSelectPackages}
            data-tour="packages-pill"
          >
            Paquetes
          </button>
        )}
      </div>
      {canScrollMore && <div className="category-pills__fade" aria-hidden="true" />}
    </div>
  )
}
