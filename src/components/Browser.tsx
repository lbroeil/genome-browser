import { useState, useEffect, useRef, useCallback } from 'react'
import { NavigationBar } from './NavigationBar'
import { GenomeRuler } from './GenomeRuler'
import { FileLoader } from './FileLoader'
import { TrackPanel } from './TrackPanel'
import { ExportDialog } from './ExportDialog'
import { useTrackStore } from '@/store/trackStore'
import { useGenomeStore } from '@/store/genomeStore'
import { useCrosshairStore } from '@/store/crosshairStore'
import { UcscSequenceAdapter } from '@/adapters/UcscSequenceAdapter'
import { BookmarkPanel } from './BookmarkPanel'
import { serializeSession, restoreSession, saveSessionToFile, loadSessionFromFile } from '@/utils/session'
import { isTauri } from '@/adapters/TauriFile'
import { indexAdapterForSearch, useSearchStore } from '@/store/searchStore'

export function Browser() {
  const [showExport, setShowExport] = useState(false)
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([])
  const tracks = useTrackStore((s) => s.tracks)
  const addTrack = useTrackStore((s) => s.addTrack)
  const crosshairEnabled = useCrosshairStore((s) => s.enabled)
  const toggleCrosshair = useCrosshairStore((s) => s.toggle)
  const sessionInputRef = useRef<HTMLInputElement>(null)

  // Add built-in hg38 sequence + translation track on first mount
  useEffect(() => {
    if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return

    const adapter = new UcscSequenceAdapter()
    adapter.initialize().then(() => {
      // Re-check after async init — React StrictMode runs effects twice,
      // so both can pass the sync check before either finishes
      if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return
      addTrack({
        id: 'hg38-sequence',
        name: 'hg38 Sequence / Translation',
        type: 'sequence',
        adapter,
        height: 160,
        color: '#6366f1',
        visible: true,
        settings: {},
      })
    })
  }, [addTrack])

  const handleSaveSession = useCallback(async () => {
    const { chromosome, start, end } = useGenomeStore.getState()
    const allTracks = useTrackStore.getState().tracks
    const json = serializeSession(allTracks, { chromosome, start, end })

    if (isTauri()) {
      try {
        await saveSessionToFile(json)
      } catch (err) {
        setSessionWarnings([`Failed to save: ${err instanceof Error ? err.message : String(err)}`])
        setTimeout(() => setSessionWarnings([]), 5000)
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session_${chromosome}_${start}-${end}.gbsession`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [])

  const handleLoadSession = useCallback(async (e?: React.ChangeEvent<HTMLInputElement>) => {
    try {
      let json: string | null = null

      if (isTauri()) {
        json = await loadSessionFromFile()
      } else {
        const file = e?.target.files?.[0]
        if (!file) return
        if (e) e.target.value = ''
        json = await file.text()
      }

      if (!json) return

      const result = await restoreSession(json)

      const store = useTrackStore.getState()
      for (const t of store.tracks) {
        store.removeTrack(t.id)
      }

      useGenomeStore.getState().setRegion(result.viewport)
      useSearchStore.getState().clearFeatures()

      for (const track of result.tracks) {
        useTrackStore.getState().addTrack(track)
        indexAdapterForSearch(track.adapter, track.type)
      }

      if (result.errors.length > 0) {
        setSessionWarnings(result.errors)
        setTimeout(() => setSessionWarnings([]), 8000)
      }
    } catch (err) {
      setSessionWarnings([`Failed to load session: ${err instanceof Error ? err.message : String(err)}`])
      setTimeout(() => setSessionWarnings([]), 5000)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <h1 className="text-sm font-semibold tracking-tight">genome-browser</h1>
        <div className="flex items-center gap-2">
          <BookmarkPanel />
          <button
            onClick={toggleCrosshair}
            className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
              crosshairEnabled
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
            title="Toggle vertical crosshair line (helps align P-sites with codons)"
          >
            Crosshair
          </button>
          <button
            onClick={isTauri() ? () => handleLoadSession() : () => sessionInputRef.current?.click()}
            className="h-7 px-3 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
          >
            Load Session
          </button>
          <input
            ref={sessionInputRef}
            type="file"
            accept=".json,.gbsession"
            onChange={handleLoadSession}
            className="hidden"
          />
          {tracks.length > 0 && (
            <>
              <button
                onClick={handleSaveSession}
                className="h-7 px-3 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
              >
                Save Session
              </button>
              <button
                onClick={() => setShowExport(true)}
                className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Export
              </button>
            </>
          )}
        </div>
      </header>

      {/* Session restore warnings */}
      {sessionWarnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
          {sessionWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>
          ))}
        </div>
      )}

      <NavigationBar />
      <FileLoader />
      <div
        className="flex flex-col flex-1 min-h-0"
        onMouseMove={crosshairEnabled ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          useCrosshairStore.getState().setX(e.clientX - rect.left)
        } : undefined}
        onMouseLeave={crosshairEnabled ? () => useCrosshairStore.getState().setX(null) : undefined}
      >
        <GenomeRuler />
        <TrackPanel />
      </div>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  )
}
