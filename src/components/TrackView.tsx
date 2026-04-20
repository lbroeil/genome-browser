import { useRef, useEffect, useCallback, useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useThemeColors } from '@/hooks/useThemeColors'
import { mapChromosomeName } from '@/utils/coordinates'
import { useTrackStore, type TrackConfig } from '@/store/trackStore'
import { pixelToBp } from '@/utils/coordinates'
import { renderCoverageCanvas, type CoverageDisplayMode } from '@/renderers/canvas/CanvasCoverageRenderer'
import { renderAnnotationCanvas, type AnnotationDisplayMode } from '@/renderers/canvas/CanvasAnnotationRenderer'
import { renderAlignmentCanvas } from '@/renderers/canvas/CanvasAlignmentRenderer'
import { renderVariantCanvas } from '@/renderers/canvas/CanvasVariantRenderer'
import { renderSequenceCanvas, getSequenceTrackHeight, type TranslationStrand } from '@/renderers/canvas/CanvasSequenceRenderer'
import type { GenomicFeature, CoverageBin } from '@/adapters/types'

interface TrackViewProps {
  track: TrackConfig
  index: number
  totalTracks: number
}

export function TrackView({ track, index, totalTracks }: TrackViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { chromosome, start, end, pan, zoom, setRegion } = useGenomeStore()
  const { removeTrack, updateTrack, reorderTracks } = useTrackStore()
  const colors = useThemeColors()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(track.name)
  const [data, setData] = useState<GenomicFeature[] | null>(null)
  const [coverageData, setCoverageData] = useState<CoverageBin[] | null>(null)
  const [sequenceData, setSequenceData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDragging = useRef(false)
  const lastX = useRef(0)
  const isSelecting = useRef(false)
  const selectionStartX = useRef(0)
  const [selection, setSelection] = useState<{ left: number; width: number } | null>(null)

  const region = { chromosome, start, end }

  // Fetch data when viewport changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchData = async () => {
      try {
        // Map chromosome name to adapter's format (handles chr1 vs 1 mismatch)
        const refNames = await track.adapter.getRefNames()
        const mappedChr = mapChromosomeName(region.chromosome, refNames)
        if (!mappedChr) {
          if (!cancelled) { setData(null); setCoverageData(null); setLoading(false) }
          return
        }
        const queryRegion = { ...region, chromosome: mappedChr }

        if (track.type === 'sequence' && track.adapter.getSequence) {
          const viewportBp = queryRegion.end - queryRegion.start
          if (viewportBp <= 600) {
            const seq = await track.adapter.getSequence(queryRegion)
            if (!cancelled) {
              setSequenceData(seq)
              setData(null)
              setCoverageData(null)
            }
          } else {
            if (!cancelled) {
              setSequenceData('')
              setData(null)
              setCoverageData(null)
            }
          }
        } else if (track.type === 'coverage' && track.adapter.getCoverage) {
          const container = containerRef.current
          const viewportBp = queryRegion.end - queryRegion.start
          const covMode = (track.settings.displayMode as string) ?? 'area'
          // For frame mode, request 1bp resolution when zoomed in close enough
          const bins = covMode === 'frame' && viewportBp <= 5000
            ? viewportBp
            : container ? Math.round(container.getBoundingClientRect().width) : 800
          const coverage = await track.adapter.getCoverage(queryRegion, bins)
          if (!cancelled) {
            setCoverageData(coverage)
            setData(null)
          }
        } else if (track.type === 'alignment') {
          const container = containerRef.current
          const bins = container ? Math.round(container.getBoundingClientRect().width) : 800
          const [features, coverage] = await Promise.all([
            track.adapter.getFeatures(queryRegion),
            track.adapter.getCoverage?.(queryRegion, bins) ?? Promise.resolve([]),
          ])
          if (!cancelled) {
            setData(features)
            setCoverageData(coverage)
          }
        } else {
          const features = await track.adapter.getFeatures(queryRegion)
          if (!cancelled) {
            setData(features)
            setCoverageData(null)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [chromosome, start, end, track.adapter, track.type, track.settings])

  // Auto-resize sequence track based on zoom level and strand setting
  const seqStrand = (track.settings.translationStrand as TranslationStrand) ?? 'forward'
  useEffect(() => {
    if (track.type !== 'sequence') return
    const idealHeight = getSequenceTrackHeight(end - start, seqStrand)
    if (idealHeight !== track.height) {
      updateTrack(track.id, { height: idealHeight })
    }
  }, [track.type, track.id, track.height, start, end, seqStrand, updateTrack])

  // Render to canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = rect.width
    canvas.width = width * dpr
    canvas.height = track.height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${track.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, track.height)

    if (track.type === 'sequence' && sequenceData !== null) {
      const strand = (track.settings.translationStrand as TranslationStrand) ?? 'forward'
      renderSequenceCanvas(ctx, sequenceData, region, width, track.height, strand)
    } else if (track.type === 'coverage' && coverageData) {
      renderCoverageCanvas(ctx, coverageData, region, width, track.height, track.color,
        (track.settings.displayMode as CoverageDisplayMode) ?? 'area')
    } else if (track.type === 'alignment' && data) {
      renderAlignmentCanvas(ctx, data, coverageData ?? [], region, width, track.height, track.color)
    } else if (track.type === 'variant' && data) {
      renderVariantCanvas(ctx, data, region, width, track.height, track.color)
    } else if ((track.type === 'annotation' || track.type === 'gene_model') && data) {
      const strandColors = track.settings.forwardColor && track.settings.reverseColor
        ? { forward: track.settings.forwardColor as string, reverse: track.settings.reverseColor as string }
        : undefined
      renderAnnotationCanvas(ctx, data, region, width, track.height, track.color, colors.foreground,
        (track.settings.displayMode as AnnotationDisplayMode) ?? 'collapsed', strandColors)
    }
  }, [data, coverageData, sequenceData, track.height, track.color, track.type, track.settings, chromosome, start, end, colors.foreground])

  useEffect(() => {
    render()
  }, [render])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => render())
    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  // Ctrl/Cmd+scroll to zoom (non-passive listener to allow preventDefault)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const s = useGenomeStore.getState()
      const centerBp = pixelToBp(mouseX, { chromosome: s.chromosome, start: s.start, end: s.end }, rect.width)
      if (e.deltaY < 0) s.zoom(0.7, centerBp)
      else s.zoom(1.4, centerBp)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      isSelecting.current = true
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      selectionStartX.current = e.clientX - rect.left
      setSelection({ left: selectionStartX.current, width: 0 })
    } else {
      isDragging.current = true
      lastX.current = e.clientX
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting.current) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const currentX = e.clientX - rect.left
      const left = Math.min(selectionStartX.current, currentX)
      const width = Math.abs(currentX - selectionStartX.current)
      setSelection({ left, width })
      return
    }
    if (!isDragging.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const deltaPx = e.clientX - lastX.current
    const deltaBp = -(deltaPx / rect.width) * (end - start)
    pan(Math.round(deltaBp))
    lastX.current = e.clientX
  }

  const handleMouseUp = () => {
    if (isSelecting.current) {
      isSelecting.current = false
      if (selection && selection.width > 5) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const startBp = pixelToBp(selection.left, region, rect.width)
          const endBp = pixelToBp(selection.left + selection.width, region, rect.width)
          setRegion({ chromosome, start: Math.round(startBp), end: Math.round(endBp) })
        }
      }
      setSelection(null)
      return
    }
    isDragging.current = false
  }

  if (!track.visible) return null

  return (
    <div className="border-b border-border">
      {/* Track header */}
      <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 text-xs">
        {/* Move up/down */}
        <div className="flex flex-col -my-0.5">
          <button
            onClick={() => reorderTracks(index, index - 1)}
            disabled={index === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-25 leading-none text-[10px]"
            title="Move up"
          >▲</button>
          <button
            onClick={() => reorderTracks(index, index + 1)}
            disabled={index === totalTracks - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-25 leading-none text-[10px]"
            title="Move down"
          >▼</button>
        </div>

        {/* Editable track name */}
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => { updateTrack(track.id, { name: nameInput }); setEditingName(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { updateTrack(track.id, { name: nameInput }); setEditingName(false) }
              if (e.key === 'Escape') { setNameInput(track.name); setEditingName(false) }
            }}
            className="font-medium flex-1 min-w-0 h-5 px-1 rounded border border-input bg-background text-xs"
          />
        ) : (
          <span
            className="font-medium truncate flex-1 cursor-pointer"
            onDoubleClick={() => { setNameInput(track.name); setEditingName(true) }}
            title="Double-click to rename"
          >{track.name}</span>
        )}

        <span className="text-muted-foreground">{track.type}</span>
        {track.type === 'coverage' && (
          <select
            value={(track.settings.displayMode as string) ?? 'area'}
            onChange={(e) => updateTrack(track.id, { settings: { ...track.settings, displayMode: e.target.value } })}
            className="h-5 px-1 rounded border border-input bg-background text-xs"
            title="Display mode"
          >
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="frame">Frame (Ribo-seq)</option>
          </select>
        )}
        {(track.type === 'gene_model' || track.type === 'annotation') && (
          <>
            <select
              value={(track.settings.displayMode as string) ?? 'collapsed'}
              onChange={(e) => updateTrack(track.id, { settings: { ...track.settings, displayMode: e.target.value } })}
              className="h-5 px-1 rounded border border-input bg-background text-xs"
              title="Display mode"
            >
              <option value="collapsed">Collapsed</option>
              <option value="expanded">Expanded</option>
              <option value="frame">Frame (ORF)</option>
            </select>
            <div className="flex items-center gap-0.5" title="Strand colors (+ / -)">
              <input
                type="color"
                value={(track.settings.forwardColor as string) ?? '#4f46e5'}
                onChange={(e) => updateTrack(track.id, { settings: { ...track.settings, forwardColor: e.target.value } })}
                className="w-4 h-4 rounded cursor-pointer border-0"
                title="Forward strand color (+)"
              />
              <input
                type="color"
                value={(track.settings.reverseColor as string) ?? '#e11d48'}
                onChange={(e) => updateTrack(track.id, { settings: { ...track.settings, reverseColor: e.target.value } })}
                className="w-4 h-4 rounded cursor-pointer border-0"
                title="Reverse strand color (-)"
              />
            </div>
          </>
        )}
        {track.type === 'sequence' && (
          <select
            value={(track.settings.translationStrand as string) ?? 'forward'}
            onChange={(e) => updateTrack(track.id, { settings: { ...track.settings, translationStrand: e.target.value } })}
            className="h-5 px-1 rounded border border-input bg-background text-xs"
            title="Translation strand"
          >
            <option value="forward">+ Strand</option>
            <option value="reverse">&minus; Strand</option>
            <option value="both">Both</option>
          </select>
        )}
        <input
          type="number"
          value={track.height}
          onChange={(e) => updateTrack(track.id, { height: parseInt(e.target.value) || 100 })}
          className="w-14 h-5 px-1 rounded border border-input bg-background text-xs text-center"
          min={30}
          max={500}
          title="Track height"
        />
        {track.type !== 'annotation' && track.type !== 'gene_model' && track.type !== 'sequence' && (
          <input
            type="color"
            value={track.color}
            onChange={(e) => updateTrack(track.id, { color: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border-0"
            title="Track color"
          />
        )}
        <button
          onClick={() => removeTrack(track.id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Remove track"
        >
          ×
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="w-full relative cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} />
        {selection && selection.width > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary/60 pointer-events-none z-10"
            style={{ left: selection.left, width: selection.width }}
          />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
