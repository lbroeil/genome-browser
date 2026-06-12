import { useState, useRef, useCallback, useEffect } from 'react'
import { useTrackStore } from '@/store/trackStore'
import { TrackView } from './TrackView'

export function TrackPanel() {
  const tracks = useTrackStore((s) => s.tracks)
  const reorderTracks = useTrackStore((s) => s.reorderTracks)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRefsMap = useRef<Map<number, HTMLDivElement>>(new Map())

  const getDropTarget = useCallback((clientY: number): number | null => {
    const entries = Array.from(trackRefsMap.current.entries()).sort((a, b) => a[0] - b[0])
    for (const [idx, el] of entries) {
      const rect = el.getBoundingClientRect()
      if (clientY < rect.bottom) return idx
    }
    return entries.length > 0 ? entries[entries.length - 1][0] : null
  }, [])

  const handleDragHandleDown = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault()
    setDragIndex(index)
  }, [])

  useEffect(() => {
    if (dragIndex === null) return

    const onMove = (e: MouseEvent) => {
      const target = getDropTarget(e.clientY)
      setDropIndex(target)
    }

    const onUp = () => {
      setDragIndex((prevDrag) => {
        setDropIndex((prevDrop) => {
          if (prevDrag !== null && prevDrop !== null && prevDrag !== prevDrop) {
            reorderTracks(prevDrag, prevDrop)
          }
          return null
        })
        return null
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragIndex, reorderTracks, getDropTarget])

  const setTrackRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) trackRefsMap.current.set(index, el)
    else trackRefsMap.current.delete(index)
  }, [])

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
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          ref={(el) => setTrackRef(index, el)}
          className={`${dragIndex === index ? 'opacity-40' : ''} ${
            dropIndex === index && dragIndex !== null && dragIndex !== index
              ? 'border-t-2 border-primary'
              : ''
          }`}
        >
          <TrackView
            track={track}
            index={index}
            totalTracks={tracks.length}
            onDragHandleDown={(e) => handleDragHandleDown(index, e)}
          />
        </div>
      ))}
    </div>
  )
}
