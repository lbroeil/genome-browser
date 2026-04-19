import { useTrackStore } from '@/store/trackStore'
import { TrackView } from './TrackView'

export function TrackPanel() {
  const tracks = useTrackStore((s) => s.tracks)

  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center">
          <p className="mb-2">No tracks loaded</p>
          <p className="text-xs">Use the file loader above to add genomic data files</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {tracks.map((track, index) => (
        <TrackView key={track.id} track={track} index={index} totalTracks={tracks.length} />
      ))}
    </div>
  )
}
