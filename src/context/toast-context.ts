import { createContext } from 'react'

export interface ToastContextValue {
  /** Shows a brief message at the top of the screen (e.g. "Elige un color")
   * — pairs with the shake/illuminate highlight so the customer gets a
   * plain-text nudge too, not just a visual cue. */
  showToast: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
