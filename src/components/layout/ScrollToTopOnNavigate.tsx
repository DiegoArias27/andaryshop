import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export default function ScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    // A back/forward (POP) navigation — e.g. leaving a product's detail
    // page the same way you arrived — should land back wherever the
    // catalog was scrolled to, same as any other site's back button.
    // Forcing it to the top here fought that every time. Only an actual
    // forward navigation (PUSH/REPLACE, clicking somewhere new) resets it.
    if (navigationType === 'POP') return
    window.scrollTo(0, 0)
  }, [pathname, navigationType])

  return null
}
