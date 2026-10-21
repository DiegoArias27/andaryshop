import { useEffect, useRef, useState } from 'react'

interface FilterGroup {
  label: string
  options: string[]
}

interface FilterMenuProps {
  label: string
  /** Flat list of checkboxes — used for simple filters (e.g. Marca). */
  options?: string[]
  /** Sections of checkboxes with their own sub-heading (e.g. Talla split by
   * category) — takes priority over `options` when both are given. */
  groups?: FilterGroup[]
  selected: string[]
  onToggle: (value: string) => void
}

export default function FilterMenu({ label, options, groups, selected, onToggle }: FilterMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const hasGroups = !!groups && groups.length > 0
  if (!hasGroups && (!options || options.length === 0)) return null

  return (
    <div className="filter-menu" ref={wrapRef}>
      <button type="button" className="filter-btn" onClick={() => setOpen((v) => !v)}>
        {label}
        {selected.length > 0 && <span className="filter-btn__badge">{selected.length}</span>}
      </button>
      {open && (
        <div className="filter-menu__panel">
          {hasGroups
            ? groups!.map((group) => (
                <div key={group.label} className="filter-menu__group">
                  <span className="filter-menu__group-label">{group.label}</span>
                  {group.options.map((opt) => (
                    <label key={opt} className="filter-check">
                      <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ))
            : options!.map((opt) => (
                <label key={opt} className="filter-check">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
                  <span>{opt}</span>
                </label>
              ))}
        </div>
      )}
    </div>
  )
}
