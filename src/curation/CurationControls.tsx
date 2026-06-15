import {
  viewWholeOrf, viewStartCodon, viewStopCodon, enterTranscriptView,
  hasSplicedStructure, zoomIn, zoomOut,
} from './navigation'
import { useCuration } from './useCuration'
import { useCrosshairStore } from '@/store/crosshairStore'
import type { CuratedOrf } from './api'

export type ViewMode = 'whole' | 'start' | 'stop' | 'transcript'

const btn = 'h-7 px-3 rounded text-xs font-medium transition-colors'
const active = 'bg-primary text-primary-foreground'
const idle = 'bg-secondary text-secondary-foreground hover:bg-accent'

export function CurationControls({
  orf, viewMode, onViewChange,
}: {
  orf: CuratedOrf
  viewMode: ViewMode
  onViewChange: (mode: ViewMode) => void
}) {
  const spliced = hasSplicedStructure(orf)
  const strandFilter = useCuration((s) => s.strandFilter)
  const setStrandFilter = useCuration((s) => s.setStrandFilter)
  const crosshairEnabled = useCrosshairStore((s) => s.enabled)
  const toggleCrosshair = useCrosshairStore((s) => s.toggle)

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/50 text-xs">
      <span className="text-muted-foreground mr-1">View:</span>
      <button className={`${btn} ${viewMode === 'whole' ? active : idle}`}
        onClick={() => { viewWholeOrf(orf); onViewChange('whole') }}>
        Whole ORF
      </button>
      <button className={`${btn} ${viewMode === 'start' ? active : idle}`}
        onClick={() => { viewStartCodon(orf); onViewChange('start') }}>
        Start codon
      </button>
      <button className={`${btn} ${viewMode === 'stop' ? active : idle}`}
        onClick={() => { viewStopCodon(orf); onViewChange('stop') }}>
        Stop codon
      </button>
      <button
        className={`${btn} ${viewMode === 'transcript' ? active : idle} ${spliced ? '' : 'opacity-40 cursor-not-allowed'}`}
        disabled={!spliced}
        title={spliced ? 'Spliced transcript view with CDS frame bar' : 'ORF is single-exon — no transcript view'}
        onClick={() => { enterTranscriptView(orf); onViewChange('transcript') }}>
        Transcript view
      </button>

      <div className="flex-1" />

      <button className={`${btn} ${crosshairEnabled ? active : idle}`} onClick={() => toggleCrosshair()}
        title="Toggle a vertical crosshair line to align P-sites with the exact codon / amino acid in the hg38 track">
        Crosshair
      </button>

      <label className="flex items-center gap-1.5 mx-1 text-muted-foreground cursor-pointer select-none"
        title="Show only the P-site tracks matching this ORF's strand">
        <input type="checkbox" checked={strandFilter} onChange={(e) => setStrandFilter(e.target.checked)} />
        Strand filter {orf.strand ? `(${orf.strand})` : ''}
      </label>

      <button className={`${btn} ${idle}`} onClick={() => zoomOut()} title="Zoom out">−</button>
      <button className={`${btn} ${idle}`} onClick={() => zoomIn()} title="Zoom in">+</button>
    </div>
  )
}
