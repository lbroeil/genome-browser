import { useEffect, useState } from 'react'

/** Navigate the tiny hash router. */
export function navigate(path: string): void {
  window.location.hash = path
}

/** Subscribe to the current hash route (without the leading '#'). */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#/, '') || '/'
}
