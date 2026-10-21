import Spinner from './Spinner'

/** A spinner + label for smaller/secondary loading states — page-level
 * content that benefits from a preview shape uses a skeleton instead. */
export default function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading-state">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
