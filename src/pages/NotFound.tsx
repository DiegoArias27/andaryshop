import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page state-msg-page">
      <p>Página no encontrada.</p>
      <Link to="/" className="btn btn--primary">
        Volver al inicio
      </Link>
    </div>
  )
}
