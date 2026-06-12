import { useState, useEffect, useRef, useCallback } from 'react'
import { NavigationBar } from './NavigationBar'
import { FileLoader } from './FileLoader'
import { GenomeView } from './GenomeView'
import { ExportDialog } from './ExportDialog'
import { useTrackStore } from '@/store/trackStore'
import { useGenomeStore } from '@/store/genomeStore'
import { useCrosshairStore } from '@/store/crosshairStore'
import { BookmarkPanel } from './BookmarkPanel'
import { serializeSession, restoreSession, applyRestoredSession, saveSessionToFile, loadSessionFromFile } from '@/utils/session'
import { isTauri } from '@/adapters/TauriFile'
import { useEnsureSequenceTrack } from '@/hooks/useEnsureSequenceTrack'

export function Browser() {
  const [showExport, setShowExport] = useState(false)
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([])
  const tracks = useTrackStore((s) => s.tracks)
  const crosshairEnabled = useCrosshairStore((s) => s.enabled)
  const toggleCrosshair = useCrosshairStore((s) => s.toggle)
  const sessionInputRef = useRef<HTMLInputElement>(null)

  // Add built-in hg38 sequence + translation track on first mount
  useEnsureSequenceTrack()

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
      const errors = applyRestoredSession(result)

      if (errors.length > 0) {
        setSessionWarnings(errors)
        setTimeout(() => setSessionWarnings([]), 8000)
      }
    } catch (err) {
      setSessionWarnings([`Failed to load session: ${err instanceof Error ? err.message : String(err)}`])
      setTimeout(() => setSessionWarnings([]), 5000)
    }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    const unlisteners: (() => void)[] = []
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('menu-save-session', () => handleSaveSession()).then((fn) => unlisteners.push(fn))
      listen('menu-load-session', () => handleLoadSession()).then((fn) => unlisteners.push(fn))
    })
    return () => unlisteners.forEach((fn) => fn())
  }, [handleSaveSession, handleLoadSession])

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
      <GenomeView />

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  )
}
