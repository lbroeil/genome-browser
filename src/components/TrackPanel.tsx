import { useState, useRef, useCallback } from 'react'
import { useTrackStore } from '@/store/trackStore'
import { TrackView } from './TrackView'

export function TrackPanel() {
  const tracks = useTrackStore((s) => s.tracks)
  const reorderTracks = useTrackStore((s) => s.reorderTracks)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragCounterRef = useRef(0)

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [])

  const handleDragEnter = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setDropIndex(index)
  }, [])

  const handleDragLeave = useCallback((_index: number) => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDropIndex(null)
  }, [])

  const handleDrop = useCallback((toIndex: number, e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    const fromIndex = dragIndex
    setDragIndex(null)
    setDropIndex(null)
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderTracks(fromIndex, toIndex)
    }
  }, [dragIndex, reorderTracks])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
    dragCounterRef.current = 0
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
    <div className="flex-1 overflow-y-auto">
      {tracks.map((track, index) => (
        <div
          key={track.id}
          onDragOver={(e) => handleDragOver(index, e)}
          onDragEnter={(e) => handleDragEnter(index, e)}
          onDragLeave={() => handleDragLeave(index)}
          onDrop={(e) => handleDrop(index, e)}
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
            onDragHandleStart={(e) => handleDragStart(index, e)}
            onDragHandleEnd={handleDragEnd}
          />
        </div>
      ))}
    </div>
  )
}
