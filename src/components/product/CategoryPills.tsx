import { useEffect, useRef } from 'react'
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

  // Picking a category/Paquetes remounts this whole component (its parent
  // keys ProductsSection by the active category — see Catalog.tsx), which
  // snapped the row's scroll back to the very start even when the pill you
  // just picked was further along — scroll it back into view every time
  // the active one changes instead of leaving that to chance.
  //
  // Done by hand (scrollLeft on this row specifically) rather than calling
  // the active pill's own .scrollIntoView() — that call can decide to
  // scroll ANY scrollable ancestor, including the whole page, and right
  // after a remount (before the sticky toolbar above has "caught up") it
  // was doing exactly that, yanking the page back up whenever the newly
  // active pill needed horizontal scrolling (Playeras, Paquetes — not
  // Inicio, which never needs to scroll).
  useEffect(() => {
    const container = scrollRef.current
    const active = container?.querySelector<HTMLElement>('.pill--active')
    if (!container || !active) return
    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const delta = activeRect.left - containerRect.left - (containerRect.width - activeRect.width) / 2
    container.scrollBy({ left: delta, behavior: 'smooth' })
  }, [activeSlug, packagesActive])

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
    </div>
  )
}
