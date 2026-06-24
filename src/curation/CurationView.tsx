import { useEffect, useState, useCallback } from 'react'
import { NavigationBar } from '@/components/NavigationBar'
import { GenomeView } from '@/components/GenomeView'
import { FileLoader } from '@/components/FileLoader'
import { useCuration } from './useCuration'
import { CurationControls, type ViewMode } from './CurationControls'
import { HelpOverlay, hasSeenHelp } from './HelpOverlay'
import { useStartCodonMarkStore } from '@/store/startCodonMarkStore'
import { navigate } from './router'
import type { Decision, CuratedOrf } from './api'

// Metadata keys worth surfacing in the curation panel, if present.
const META_KEYS: [string, string][] = [
  ['start_codon', 'Start codon'],
  ['stop_codon', 'Stop codon'],
  ['aa_length', 'Length (aa)'],
  ['orf_biotypes_all', 'Biotypes'],
  ['phylocsf', 'PhyloCSF'],
  ['max_ppm_all', 'Max PPM'],
]

function formatCoords(orf: CuratedOrf): string {
  if (!orf.chromosome || orf.start == null || orf.stop == null) return '—'
  return `${orf.chromosome}:${(orf.start + 1).toLocaleString()}–${orf.stop.toLocaleString()}`
}

/** Prominent, color-coded strand indicator — negative strand is easy to miss. */
function StrandBadge({ strand }: { strand: string | null }) {
  if (strand === '-') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40">
        − reverse strand
      </span>
    )
  }
  if (strand === '+') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40">
        + forward strand
      </span>
    )
  }
  return <span className="px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground">strand ?</span>
}

export function CurationView({ projectId }: { projectId: number }) {
  const {
    userId, username, project, current, progressCurrent, progressTotal, done,
    loading, error, loadProject, vote, rewind, votedHistory,
  } = useCuration()
  const [notes, setNotes] = useState('')
  const [flagStart, setFlagStart] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('whole')
  const [showLoader, setShowLoader] = useState(false)
  const [showHelp, setShowHelp] = useState(!hasSeenHelp())
  const markEnabled = useStartCodonMarkStore((s) => s.enabled)
  const markedPosition = useStartCodonMarkStore((s) => s.position)
  const setMarkEnabled = useStartCodonMarkStore((s) => s.setEnabled)
  const resetMark = useStartCodonMarkStore((s) => s.reset)

  // Require a user; otherwise bounce to the picker.
  useEffect(() => {
    if (userId == null) navigate('/')
  }, [userId])

  // Load the project once we have a user.
  useEffect(() => {
    if (userId != null) void loadProject(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId])

  // Reset per-ORF UI state when the current ORF changes.
  useEffect(() => {
    setNotes('')
    setFlagStart(false)
    setUncertain(false)
    setViewMode('whole')
    resetMark()
  }, [current?.id])

  const submit = useCallback((decision: Decision) => {
    void vote(decision, notes, viewMode, flagStart, uncertain ? 'uncertain' : 'confident', markedPosition)
  }, [vote, notes, viewMode, flagStart, uncertain, markedPosition])

  // Keyboard shortcuts: A/← bad, S/↓ skip, D/→ good. Ignore while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (!current) return
      if (e.key === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); submit('bad') }
      else if (e.key === 'd' || e.key === 'ArrowRight') { e.preventDefault(); submit('good') }
      else if (e.key === 's' || e.key === 'ArrowDown') { e.preventDefault(); submit('skip') }
      else if (e.key === 'z' || e.key === 'Backspace') { e.preventDefault(); void rewind() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, submit, rewind])

  const pct = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-xs text-muted-foreground hover:text-foreground">← Projects</button>
          <h1 className="text-sm font-semibold tracking-tight">
            Curation · {project?.name ?? '…'}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button onClick={() => setShowLoader((v) => !v)} className="hover:text-foreground">
            {showLoader ? 'Hide add-tracks' : '＋ Add my tracks'}
          </button>
          <button onClick={() => navigate(`/stats/${projectId}`)} className="hover:text-foreground">Stats</button>
          <button onClick={() => setShowHelp(true)} className="hover:text-foreground" title="Curation guide">?</button>
          <span>{username}</span>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left: curation panel */}
        <aside className="w-80 shrink-0 border-r border-border flex flex-col bg-card/30">
          {/* Progress */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{progressCurrent} / {progressTotal}</span>
            </div>
            <div className="h-1.5 bg-secondary rounded overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {loading && <div className="p-4 text-sm text-muted-foreground">Loading project…</div>}

          {!loading && done && (
            <div className="p-4 text-sm">
              <p className="font-medium mb-2">All ORFs reviewed 🎉</p>
              <button onClick={() => navigate(`/stats/${projectId}`)}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium">
                View results
              </button>
            </div>
          )}

          {!loading && current && (
            <>
              {/* ORF metadata */}
              <div className="px-4 py-3 border-b border-border space-y-1">
                <p className="text-base font-semibold break-all">{current.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <StrandBadge strand={current.strand} />
                  <span className="px-2 py-0.5 rounded bg-secondary text-xs">{current.orf_type}</span>
                  {current.gene_name && <span className="text-xs text-muted-foreground">{current.gene_name}</span>}
                </div>
                <p className="text-xs text-muted-foreground font-mono pt-1">{formatCoords(current)}</p>
                {current.metadata_json && (
                  <dl className="pt-2 space-y-0.5">
                    {META_KEYS.filter(([k]) => current.metadata_json?.[k]).map(([k, label]) => (
                      <div key={k} className="flex justify-between gap-2 text-xs">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono truncate max-w-[10rem]" title={String(current.metadata_json?.[k])}>
                          {String(current.metadata_json?.[k])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* Notes */}
              <div className="px-4 py-3">
                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. clear 3-nt periodicity, strong start…"
                  className="mt-1 w-full text-xs rounded border border-border bg-background p-2 resize-none"
                />
              </div>

              {/* Confidence & flags */}
              <div className="px-4 pb-1 space-y-1.5">
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="mt-0.5" checked={uncertain}
                    onChange={(e) => setUncertain(e.target.checked)} />
                  <span><span className="text-foreground">Uncertain</span> — I'm not confident in my decision</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="mt-0.5" checked={flagStart}
                    onChange={(e) => { setFlagStart(e.target.checked); setMarkEnabled(e.target.checked) }} />
                  <span>Real ORF, but <span className="text-foreground">start codon may be wrong</span> (recorded with a Good vote)</span>
                </label>
                {flagStart && (
                  <p className="text-[10px] ml-5 text-amber-600">
                    {markedPosition != null
                      ? `Suggested start codon: ${(markedPosition + 1).toLocaleString()}–${(markedPosition + 3).toLocaleString()} (click track to change)`
                      : 'Click on the track to mark the suggested start codon'}
                  </p>
                )}
              </div>

              {/* Undo */}
              {votedHistory.length > 0 && (
                <div className="px-4 mt-auto">
                  <button onClick={() => void rewind()}
                    className="w-full h-7 rounded border border-border bg-secondary/50 hover:bg-accent text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                    <span>Undo</span>
                    <span className="opacity-60">— voted {votedHistory[votedHistory.length - 1].decision}</span>
                    <span className="opacity-40 ml-1">Z</span>
                  </button>
                </div>
              )}

              {/* Vote buttons */}
              <div className={`${votedHistory.length > 0 ? '' : 'mt-auto'} px-4 py-3 border-t border-border grid grid-cols-3 gap-2`}>
                <button onClick={() => submit('bad')}
                  className="h-12 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">
                  Bad<span className="block text-[10px] font-normal opacity-80">A / ←</span>
                </button>
                <button onClick={() => submit('skip')}
                  className="h-12 rounded bg-secondary hover:bg-accent text-secondary-foreground text-sm font-semibold">
                  Skip<span className="block text-[10px] font-normal opacity-80">S / ↓</span>
                </button>
                <button onClick={() => submit('good')}
                  className="h-12 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-semibold">
                  Good<span className="block text-[10px] font-normal opacity-80">D / →</span>
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Right: live browser */}
        <main className="flex flex-col flex-1 min-h-0">
          <NavigationBar />
          {showLoader && <FileLoader />}
          {current && <CurationControls orf={current} viewMode={viewMode} onViewChange={setViewMode} />}
          <GenomeView />
        </main>
      </div>
      <HelpOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  )
}
