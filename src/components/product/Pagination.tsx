import { BackIcon } from '../icons'

interface PaginationProps {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

export default function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null

  return (
    <nav className="pagination" aria-label="Paginación">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
      >
        <BackIcon />
      </button>
      <span className="pagination__info">
        Página {page} de {pageCount}
      </span>
      <button
        type="button"
        className="pagination__btn pagination__btn--next"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Página siguiente"
      >
        <BackIcon />
      </button>
    </nav>
  )
}
