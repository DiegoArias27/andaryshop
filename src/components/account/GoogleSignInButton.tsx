import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCustomerAuth } from '../../hooks/useCustomerAuth'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export default function GoogleSignInButton() {
  const { loginWithGoogle } = useCustomerAuth()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return

    function renderButton() {
      if (!window.google || !containerRef.current) return
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID as string,
        callback: (response) => {
          loginWithGoogle(response.credential)
            .then(() => navigate('/'))
            .catch((err) => {
              setError(err instanceof Error ? err.message : 'Error al iniciar sesión con Google')
            })
        },
      })
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      })
    }

    if (window.google) {
      renderButton()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = renderButton
    document.head.appendChild(script)
  }, [loginWithGoogle, navigate])

  if (!CLIENT_ID) return null

  return (
    <div className="google-signin">
      <div ref={containerRef} />
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
