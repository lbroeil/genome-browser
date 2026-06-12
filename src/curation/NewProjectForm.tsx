import { useRef, useState } from 'react'
import { api } from './api'

/**
 * Admin form to create a curation project: upload an ORF list (CSV/TSV/XLSX/BED)
 * and an optional base genome-browser session (.gbsession with HTTP track URLs,
 * e.g. saved from the full browser at #/browser).
 */
export function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [coords, setCoords] = useState<'one-based' | 'bed'>('one-based')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const orfRef = useRef<HTMLInputElement>(null)
  const sessionRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setName(''); setDescription(''); setCoords('one-based'); setError(null)
    if (orfRef.current) orfRef.current.value = ''
    if (sessionRef.current) sessionRef.current.value = ''
  }

  const submit = async () => {
    setError(null)
    const orfFile = orfRef.current?.files?.[0]
    if (!name.trim()) { setError('Project name is required'); return }
    if (!orfFile) { setError('An ORF list file is required'); return }

    const form = new FormData()
    form.append('name', name.trim())
    if (description.trim()) form.append('description', description.trim())
    form.append('coords', coords)
    form.append('orf_list', orfFile)
    const sessionFile = sessionRef.current?.files?.[0]
    if (sessionFile) form.append('base_session_file', sessionFile)

    setBusy(true)
    try {
      await api.createProject(form)
      reset()
      setOpen(false)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="h-8 px-3 rounded border border-dashed border-border text-xs text-muted-foreground hover:bg-accent">
        ＋ New project
      </button>
    )
  }

  return (
    <div className="max-w-xl p-4 rounded border border-border space-y-3 bg-card/50">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium">New curation project</h2>
        <button onClick={() => { setOpen(false); reset() }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>

      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
          className="w-full h-8 px-2 rounded border border-border bg-background text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          className="w-full h-8 px-2 rounded border border-border bg-background text-sm" />

        <label className="block text-xs text-muted-foreground">
          ORF list (CSV / TSV / XLSX / BED12)
          <input ref={orfRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.bed,.bed12"
            className="mt-1 block w-full text-xs" />
        </label>

        <label className="block text-xs text-muted-foreground">
          Coordinate system of a tabular ORF list
          <select value={coords} onChange={(e) => setCoords(e.target.value as 'one-based' | 'bed')}
            className="mt-1 block h-8 px-2 rounded border border-border bg-background text-xs">
            <option value="one-based">1-based inclusive (typical ORF-caller output)</option>
            <option value="bed">0-based half-open (BED)</option>
          </select>
        </label>

        <label className="block text-xs text-muted-foreground">
          Base session (.gbsession, optional — shared tracks via HTTP URLs)
          <input ref={sessionRef} type="file" accept=".gbsession,.json"
            className="mt-1 block w-full text-xs" />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button onClick={submit} disabled={busy}
        className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
        {busy ? 'Creating…' : 'Create project'}
      </button>
    </div>
  )
}
