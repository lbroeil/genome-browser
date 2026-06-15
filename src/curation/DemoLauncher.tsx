import { useEffect, useState } from 'react'
import { useCuration } from './useCuration'
import { navigate } from './router'
import { api } from './api'

const GUEST_KEY = 'curation_guest'

/**
 * Public demo entry point (#/demo): sign the visitor in as a throwaway guest and
 * drop them straight into the configured demo project. Each new visitor gets a
 * fresh guest identity, so they each see the full ORF queue (and don't exhaust
 * each other's). A returning visitor keeps their guest name across refreshes.
 */
export function DemoLauncher() {
  const setUser = useCuration((s) => s.setUser)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const demo = await api.getDemoProject()
        if (!demo) {
          setError('No demo project is set up yet. Create a project named "Demo" first.')
          return
        }
        const name = localStorage.getItem(GUEST_KEY)
          ?? `guest-${Math.random().toString(36).slice(2, 8)}`
        localStorage.setItem(GUEST_KEY, name)
        await setUser(name)
        navigate(`/curate/${demo.id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [setUser])

  return (
    <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
      {error
        ? <div className="text-center space-y-2"><p>{error}</p><a href="#/" className="text-primary">Home</a></div>
        : 'Loading demo…'}
    </div>
  )
}
