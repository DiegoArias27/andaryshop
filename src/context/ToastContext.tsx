import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext } from './toast-context'
import { playToastSound } from '../utils/sound'

interface ToastEntry {
  id: number
  message: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((message: string) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message }])
    playToastSound()
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4200)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
