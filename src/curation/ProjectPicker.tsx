import { useCallback, useEffect, useState } from 'react'
import { useCuration } from './useCuration'
import { navigate } from './router'
import { NewProjectForm } from './NewProjectForm'
import { api, type Project } from './api'

export function ProjectPicker() {
  const { userId, username, setUser, logout } = useCuration()
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasDemo, setHasDemo] = useState(false)

  const refresh = useCallback(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    api.getDemoProject().then((d) => setHasDemo(!!d)).catch(() => {})
  }, [])

  useEffect(() => {
    if (userId == null) return
    refresh()
  }, [userId, refresh])

  const handleLogin = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await setUser(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Login screen
  if (userId == null) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-80 space-y-4">
          <div>
            <h1 className="text-lg font-semibold">ORF Curation</h1>
            <p className="text-sm text-muted-foreground">Enter a username to start curating.</p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="username"
            className="w-full h-9 px-3 rounded border border-border bg-background text-sm"
            autoFocus
          />
          <button onClick={handleLogin} disabled={busy || !name.trim()}
            className="w-full h-9 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy ? 'Signing in…' : 'Continue'}
          </button>
          {hasDemo && (
            <p className="text-center text-xs text-muted-foreground">
              Just exploring? <a href="#/demo" className="text-primary hover:underline">View the demo →</a>
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  // Project list
  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <h1 className="text-sm font-semibold">ORF Curation · Projects</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <a href="#/browser" className="hover:text-foreground">Open full browser</a>
          <span>{username}</span>
          <button onClick={() => { logout(); navigate('/') }} className="hover:text-foreground">Sign out</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="max-w-2xl">
          <NewProjectForm onCreated={refresh} />
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet — create one above.</p>
        ) : (
          <ul className="grid gap-3 max-w-2xl">
            {projects.map((p) => (
              <li key={p.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => navigate(`/curate/${p.id}`)}
                  className="flex-1 text-left p-4 rounded border border-border hover:bg-accent transition-colors">
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.orf_count} ORFs</span>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                </button>
                <button
                  title="Delete project"
                  onClick={async () => {
                    if (!confirm(`Delete project "${p.name}" and all its votes?`)) return
                    try { await api.deleteProject(p.id); refresh() } catch (e) { setError(String(e)) }
                  }}
                  className="px-3 rounded border border-border text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
