import { useRef, useState } from 'react'
import { api } from './api'

type SessionMode = 'none' | 'server' | 'upload'

/**
 * A styled file picker: a "Choose file…" button, the selected filename, and a
 * clear (×) button. The native <input type=file> is hidden and driven via a ref
 * (its value can only be cleared, not set, so clearing resets the input too).
 */
function FilePicker({
  label, hint, accept, file, onPick,
}: {
  label: string
  hint?: string
  accept?: string
  file: File | null
  onPick: (f: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const clear = () => { if (ref.current) ref.current.value = ''; onPick(null) }

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => ref.current?.click()}
          className="h-8 px-3 rounded border border-border bg-background text-xs hover:bg-accent shrink-0">
          Choose file…
        </button>
        <span className={`flex-1 truncate text-xs ${file ? 'text-foreground' : 'text-muted-foreground'}`}>
          {file ? file.name : 'No file selected'}
        </span>
        {file && (
          <button type="button" onClick={clear} aria-label="Remove file"
            className="h-6 w-6 shrink-0 rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
            ×
          </button>
        )}
        <input ref={ref} type="file" accept={accept} className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Admin form to create a curation project: upload an ORF list (CSV/TSV/XLSX/BED)
 * and choose a base genome-browser session — none, the server's shared track set,
 * or an uploaded .gbsession (saved from the full browser at #/browser).
 */
export function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [coords, setCoords] = useState<'one-based' | 'bed'>('one-based')
  const [orfFile, setOrfFile] = useState<File | null>(null)
  const [sessionMode, setSessionMode] = useState<SessionMode>('server')
  const [sessionFile, setSessionFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName(''); setDescription(''); setCoords('one-based')
    setOrfFile(null); setSessionMode('server'); setSessionFile(null); setError(null)
  }

  const submit = async () => {
    setError(null)
    if (!name.trim()) { setError('Project name is required'); return }
    if (!orfFile) { setError('An ORF list file is required'); return }
    if (sessionMode === 'upload' && !sessionFile) { setError('Choose a .gbsession file or pick another base-session option'); return }

    const form = new FormData()
    form.append('name', name.trim())
    if (description.trim()) form.append('description', description.trim())
    form.append('coords', coords)
    form.append('orf_list', orfFile)
    if (sessionMode === 'server') form.append('use_server_tracks', 'true')
    else if (sessionMode === 'upload' && sessionFile) form.append('base_session_file', sessionFile)

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

      <div className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
          className="w-full h-8 px-2 rounded border border-border bg-background text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          className="w-full h-8 px-2 rounded border border-border bg-background text-sm" />

        <FilePicker
          label="ORF list (CSV / TSV / XLSX / BED / BED12 / GTF / GFF3 — format is auto-detected)"
          file={orfFile}
          onPick={setOrfFile}
        />

        <label className="block text-xs text-muted-foreground">
          Coordinate system of a tabular ORF list
          <select value={coords} onChange={(e) => setCoords(e.target.value as 'one-based' | 'bed')}
            className="mt-1 block h-8 px-2 rounded border border-border bg-background text-xs">
            <option value="one-based">1-based inclusive (typical ORF-caller output)</option>
            <option value="bed">0-based half-open (BED)</option>
          </select>
        </label>

        <div>
          <p className="text-xs text-muted-foreground">Base session (shared tracks shown during curation)</p>
          <select value={sessionMode} onChange={(e) => setSessionMode(e.target.value as SessionMode)}
            className="mt-1 block h-8 px-2 rounded border border-border bg-background text-xs">
            <option value="server">Server track set (all P-site bigWigs in /data)</option>
            <option value="none">None</option>
            <option value="upload">Upload a .gbsession file…</option>
          </select>
          {sessionMode === 'upload' && (
            <div className="mt-2">
              <FilePicker
                label="Session file"
                hint="A .gbsession saved from the full browser (#/browser) with HTTP track URLs."
                accept=".gbsession,.json"
                file={sessionFile}
                onPick={setSessionFile}
              />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button onClick={submit} disabled={busy}
        className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
        {busy ? 'Creating…' : 'Create project'}
      </button>
    </div>
  )
}
