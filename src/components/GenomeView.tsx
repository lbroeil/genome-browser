import { GenomeRuler } from './GenomeRuler'
import { TrackPanel } from './TrackPanel'
import { useCrosshairStore } from '@/store/crosshairStore'

/**
 * The embeddable genome view: the coordinate ruler + the track panel,
 * with crosshair handling. Driven entirely by the Zustand stores
 * (genomeStore / trackStore / transcriptViewStore), so it can be mounted
 * standalone — by the full Browser shell or by the curation view — and
 * controlled programmatically via the stores.
 */
export function GenomeView() {
  const crosshairEnabled = useCrosshairStore((s) => s.enabled)

  return (
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
  )
}
