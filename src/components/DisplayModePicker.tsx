import { useState, useEffect, useCallback } from 'react'
import type { TrackType } from '@/store/trackStore'

export interface PendingDisplayTrack {
  id: string
  name: string
  type: TrackType
}

interface Props {
  tracks: PendingDisplayTrack[]
  onDone: (modes: Record<string, string>) => void
}

function getOptions(type: TrackType): { value: string; label: string }[] {
  if (type === 'coverage') {
    return [
      { value: 'area', label: 'Area' },
      { value: 'bar', label: 'Bar' },
      { value: 'frame', label: 'Frame (Ribo-seq)' },
    ]
  }
  if (type === 'annotation' || type === 'gene_model') {
    return [
      { value: 'expanded', label: 'Expanded' },
      { value: 'collapsed', label: 'Collapsed' },
      { value: 'frame', label: 'Frame (ORF)' },
    ]
  }
  return []
}

function getDefault(type: TrackType): string {
  if (type === 'coverage') return 'area'
  return 'expanded'
}

export function DisplayModePicker({ tracks, onDone }: Props) {
  const [modes, setModes] = useState<Record<string, string>>({})

  useEffect(() => {
    const defaults: Record<string, string> = {}
    for (const t of tracks) {
      defaults[t.id] = getDefault(t.type)
    }
    setModes(defaults)
  }, [tracks])

  const handleDone = useCallback(() => {
    onDone(modes)
  }, [modes, onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        handleDone()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleDone])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-4 max-w-sm w-full shadow-lg border border-border">
        <h3 className="text-sm font-semibold mb-3">Display Mode</h3>
        <div className="space-y-2">
          {tracks.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="text-xs truncate flex-1 text-foreground">{t.name}</span>
              <select
                value={modes[t.id] ?? getDefault(t.type)}
                onChange={(e) => setModes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                className="h-6 px-1 rounded border border-input bg-background text-xs min-w-[140px]"
              >
                {getOptions(t.type).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={handleDone}
            className="h-7 px-4 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
