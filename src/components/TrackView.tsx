import { useRef, useEffect, useCallback, useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useThemeColors } from '@/hooks/useThemeColors'
import { mapChromosomeName } from '@/utils/coordinates'
import { useTrackStore, type TrackConfig } from '@/store/trackStore'
import { pixelToBp, bpToPixel } from '@/utils/coordinates'
import { useTranscriptViewStore } from '@/store/transcriptViewStore'
import { renderCoverageCanvas, type CoverageDisplayMode } from '@/renderers/canvas/CanvasCoverageRenderer'
import { renderAnnotationCanvas, getAnnotationTrackHeight, type AnnotationDisplayMode } from '@/renderers/canvas/CanvasAnnotationRenderer'
import { renderAlignmentCanvas } from '@/renderers/canvas/CanvasAlignmentRenderer'
import { renderVariantCanvas } from '@/renderers/canvas/CanvasVariantRenderer'
import { renderSequenceCanvas, getSequenceTrackHeight, type TranslationStrand } from '@/renderers/canvas/CanvasSequenceRenderer'
import { fetchTranscriptCoverage, fetchTranscriptSequence, remapFeaturesToTranscript } from '@/utils/transcriptData'
import { TranscriptCoordinateMapper } from '@/utils/TranscriptCoordinateMapper'
import { useCrosshairStore } from '@/store/crosshairStore'
import type { GenomicFeature, CoverageBin } from '@/adapters/types'

interface TrackViewProps {
  track: TrackConfig
  index: number
  totalTracks: number
  onDragHandleDown?: (e: React.MouseEvent) => void
}

export function TrackView({ track, index, totalTracks, onDragHandleDown }: TrackViewProps) {
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
  const clickStartPos = useRef<{ x: number; y: number } | null>(null)

  const region = { chromosome, start, end }

  // Transcript view state
  const txActive = useTranscriptViewStore((s) => s.active)
  const txMapper = useTranscriptViewStore((s) => s.mapper)
  const txStart = useTranscriptViewStore((s) => s.txStart)
  const txEnd = useTranscriptViewStore((s) => s.txEnd)

  // The "effective region" used for rendering — genomic or transcript coordinates
  const effectiveRegion = txActive && txMapper
    ? { chromosome: 'tx', start: txStart, end: txEnd }
    : region

  // Fetch data when viewport changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchData = async () => {
      try {
        if (txActive && txMapper) {
          // --- Transcript view mode ---
          const container = containerRef.current
          const pixelWidth = container ? Math.round(container.getBoundingClientRect().width) : 800

          if (track.type === 'coverage' && track.adapter.getCoverage) {
            const txSpan = txEnd - txStart
            const bins = txSpan <= 5000 ? txSpan : pixelWidth
            const coverage = await fetchTranscriptCoverage(track.adapter, txMapper, txStart, txEnd, bins)
            if (!cancelled) {
              setCoverageData(coverage)
              setData(null)
              setSequenceData(null)
            }
          } else if (track.type === 'annotation' || track.type === 'gene_model') {
            // Fetch genomic features covering the transcript's exonic regions, then remap
            const genomicRegions = txMapper.getGenomicRegionsForTranscriptRange(txStart, txEnd)
            const allFeatures: GenomicFeature[] = []
            const refNames = await track.adapter.getRefNames()
            for (const gRegion of genomicRegions) {
              const mappedChr = mapChromosomeName(gRegion.chromosome, refNames)
              if (!mappedChr) continue
              const features = await track.adapter.getFeatures({ ...gRegion, chromosome: mappedChr })
              allFeatures.push(...features)
            }
            // Deduplicate by feature id
            const seen = new Set<string>()
            const unique = allFeatures.filter((f) => { if (seen.has(f.id)) return false; seen.add(f.id); return true })
            const remapped = remapFeaturesToTranscript(unique, txMapper)
            if (!cancelled) {
              setData(remapped)
              setCoverageData(null)
              setSequenceData(null)
            }
          } else if (track.type === 'sequence' && track.adapter.getSequence) {
            const txSpan = txEnd - txStart
            if (txSpan <= 600) {
              const seq = await fetchTranscriptSequence(track.adapter, txMapper, txStart, txEnd)
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
          } else {
            // Other track types (variant, alignment) — hide in transcript view
            if (!cancelled) { setData(null); setCoverageData(null); setSequenceData(null); setLoading(false) }
            return
          }
        } else {
          // --- Normal genomic mode ---
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
  }, [chromosome, start, end, track.adapter, track.type, track.settings, txActive, txMapper, txStart, txEnd])

  // Auto-resize sequence track based on zoom level and strand setting. In
  // transcript view the sequence is already spliced + oriented 5'→3' (mRNA)
  // by fetchTranscriptSequence, so it must render as 'forward' — its frames
  // then align with the transcript-coordinate P-site frames.
  const seqStrand: TranslationStrand = txActive
    ? 'forward'
    : ((track.settings.translationStrand as TranslationStrand) ?? 'forward')
  useEffect(() => {
    if (track.type !== 'sequence') return
    const span = txActive ? txEnd - txStart : end - start
    const idealHeight = getSequenceTrackHeight(span, seqStrand)
    if (idealHeight !== track.height) {
      updateTrack(track.id, { height: idealHeight })
    }
  }, [track.type, track.id, track.height, start, end, seqStrand, updateTrack, txActive, txStart, txEnd])

  // Auto-resize annotation/gene_model tracks to fit visible features
  const annDisplayMode = (track.settings.displayMode as AnnotationDisplayMode) ?? 'expanded'
  useEffect(() => {
    if (track.type !== 'annotation' && track.type !== 'gene_model') return
    if (!data || data.length === 0) return
    const container = containerRef.current
    if (!container) return
    const width = container.getBoundingClientRect().width
    const idealHeight = getAnnotationTrackHeight(data, effectiveRegion, width, annDisplayMode)
    if (idealHeight !== track.height) {
      updateTrack(track.id, { height: idealHeight })
    }
  }, [track.type, track.id, track.height, data, effectiveRegion, annDisplayMode, updateTrack])

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
      renderSequenceCanvas(ctx, sequenceData, effectiveRegion, width, track.height, seqStrand)
    } else if (track.type === 'coverage' && coverageData) {
      const covMode = txActive ? 'frame' as CoverageDisplayMode : (track.settings.displayMode as CoverageDisplayMode) ?? 'area'
      renderCoverageCanvas(ctx, coverageData, effectiveRegion, width, track.height, track.color, covMode)
    } else if (track.type === 'alignment' && data) {
      renderAlignmentCanvas(ctx, data, coverageData ?? [], effectiveRegion, width, track.height, track.color)
    } else if (track.type === 'variant' && data) {
      renderVariantCanvas(ctx, data, effectiveRegion, width, track.height, track.color)
    } else if ((track.type === 'annotation' || track.type === 'gene_model') && data) {
      const strandColors = track.settings.forwardColor && track.settings.reverseColor
        ? { forward: track.settings.forwardColor as string, reverse: track.settings.reverseColor as string }
        : undefined
      renderAnnotationCanvas(ctx, data, effectiveRegion, width, track.height, track.color, colors.foreground,
        (track.settings.displayMode as AnnotationDisplayMode) ?? 'expanded', strandColors)
    }
  }, [data, coverageData, sequenceData, track.height, track.color, track.type, track.settings, effectiveRegion, colors.foreground, txActive])

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
      const txState = useTranscriptViewStore.getState()
      if (txState.active) {
        const txRegion = { chromosome: 'tx', start: txState.txStart, end: txState.txEnd }
        const centerTx = pixelToBp(mouseX, txRegion, rect.width)
        if (e.deltaY < 0) txState.zoomTx(0.7, centerTx)
        else txState.zoomTx(1.4, centerTx)
      } else {
        const s = useGenomeStore.getState()
        const centerBp = pixelToBp(mouseX, { chromosome: s.chromosome, start: s.start, end: s.end }, rect.width)
        if (e.deltaY < 0) s.zoom(0.7, centerBp)
        else s.zoom(1.4, centerBp)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    clickStartPos.current = { x: e.clientX, y: e.clientY }
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
    const txState = useTranscriptViewStore.getState()
    if (txState.active) {
      const deltaTx = -(deltaPx / rect.width) * (txState.txEnd - txState.txStart)
      txState.panTx(Math.round(deltaTx))
    } else {
      const deltaBp = -(deltaPx / rect.width) * (end - start)
      pan(Math.round(deltaBp))
    }
    lastX.current = e.clientX
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isSelecting.current) {
      isSelecting.current = false
      if (selection && selection.width > 5) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const txState = useTranscriptViewStore.getState()
          if (txState.active) {
            const txRegion = { chromosome: 'tx', start: txState.txStart, end: txState.txEnd }
            const s = pixelToBp(selection.left, txRegion, rect.width)
            const en = pixelToBp(selection.left + selection.width, txRegion, rect.width)
            txState.setTxRegion(Math.round(s), Math.round(en))
          } else {
            const startBp = pixelToBp(selection.left, region, rect.width)
            const endBp = pixelToBp(selection.left + selection.width, region, rect.width)
            setRegion({ chromosome, start: Math.round(startBp), end: Math.round(endBp) })
          }
        }
      }
      setSelection(null)
      clickStartPos.current = null
      return
    }
    isDragging.current = false

    // Detect click (not drag) on annotation/gene_model tracks to enter transcript view
    if (
      clickStartPos.current &&
      !txActive &&
      (track.type === 'annotation' || track.type === 'gene_model') &&
      data
    ) {
      const dx = Math.abs(e.clientX - clickStartPos.current.x)
      const dy = Math.abs(e.clientY - clickStartPos.current.y)
      if (dx < 4 && dy < 4) {
        handleFeatureClick(e)
      }
    }
    clickStartPos.current = null
  }

  const handleFeatureClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !data) return
    const clickPxX = e.clientX - rect.left
    const clickPxY = e.clientY - rect.top

    const displayMode = (track.settings.displayMode as string) ?? 'expanded'

    // In expanded mode, split gene models into per-transcript features so each is clickable
    let clickFeatures = data
    if (displayMode === 'expanded') {
      const expanded: GenomicFeature[] = []
      for (const f of data) {
        if (f.data.type === 'gene_model' && f.data.transcripts.length > 0) {
          for (const tx of f.data.transcripts) {
            expanded.push({ ...f, id: `${f.id}-${tx.id}`, start: tx.start, end: tx.end, data: { ...f.data, transcripts: [tx] } })
          }
        } else {
          expanded.push(f)
        }
      }
      clickFeatures = expanded
    }

    // Compute layout (must match renderer: ROW_HEIGHT=26, ROW_GAP=2, FEATURE_HEIGHT=10)
    const ROW_H = 26, ROW_GAP = 2, FEAT_H = 10
    const sorted = [...clickFeatures].sort((a, b) => a.start - b.start)
    const rowEnds: number[] = []

    for (const feature of sorted) {
      const x = bpToPixel(feature.start, region, rect.width)
      const xEnd = bpToPixel(feature.end, region, rect.width)
      const w = Math.max(1, xEnd - x)

      let row = 0
      while (row < rowEnds.length && rowEnds[row] > x - 2) row++
      if (row >= rowEnds.length) rowEnds.push(0)
      rowEnds[row] = x + w

      const y = row * (ROW_H + ROW_GAP) + 4
      if (clickPxX < x || clickPxX > x + w || clickPxY < y || clickPxY > y + FEAT_H) continue

      // Hit — build mapper for this feature
      let mapper: TranscriptCoordinateMapper | null = null
      let label = ''
      let cds: { txStart: number; txEnd: number } | undefined

      if (feature.data.type === 'gene_model' && feature.data.transcripts.length > 0) {
        const transcript = feature.data.transcripts[0]
        mapper = TranscriptCoordinateMapper.fromTranscript(transcript, feature.chromosome)
        label = feature.data.geneName ?? feature.data.geneId
        if (transcript.id) label += ` · ${transcript.id}`

        if (transcript.cds && transcript.cds.length > 0) {
          const cdsGenomicStart = Math.min(...transcript.cds.map((c) => c.start))
          const cdsGenomicEnd = Math.max(...transcript.cds.map((c) => c.end))
          const txCdsStart = mapper.genomicToTranscript(cdsGenomicStart)
          const txCdsEnd = mapper.genomicToTranscript(cdsGenomicEnd - 1)
          if (txCdsStart !== null && txCdsEnd !== null) {
            cds = { txStart: Math.min(txCdsStart, txCdsEnd), txEnd: Math.max(txCdsStart, txCdsEnd) + 1 }
          }
        }
      } else if (
        feature.data.type === 'annotation' &&
        feature.data.blockStarts &&
        feature.data.blockSizes &&
        feature.data.blockCount &&
        feature.data.blockCount > 1
      ) {
        mapper = TranscriptCoordinateMapper.fromBed12(feature)
        label = feature.data.name ?? feature.id

        if (feature.data.thickStart !== undefined && feature.data.thickEnd !== undefined &&
            feature.data.thickEnd > feature.data.thickStart) {
          const txCdsStart = mapper.genomicToTranscript(feature.data.thickStart)
          const txCdsEnd = mapper.genomicToTranscript(feature.data.thickEnd - 1)
          if (txCdsStart !== null && txCdsEnd !== null) {
            cds = { txStart: Math.min(txCdsStart, txCdsEnd), txEnd: Math.max(txCdsStart, txCdsEnd) + 1 }
          }
        }
      }

      if (mapper && mapper.txLength > 0) {
        useTranscriptViewStore.getState().enter(mapper, feature.id, label, cds)
      }
      break
    }
  }

  if (!track.visible) return null

  return (
    <div className="border-b border-border">
      {/* Track header */}
      <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 text-xs">
        {/* Drag handle + move up/down */}
        <div className="flex items-center gap-0.5">
          <span
            className="text-muted-foreground hover:text-foreground text-sm leading-none select-none cursor-grab active:cursor-grabbing px-0.5"
            onMouseDown={(e) => onDragHandleDown?.(e)}
            title="Drag to reorder"
          >⠿</span>
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
              value={(track.settings.displayMode as string) ?? 'expanded'}
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
        onMouseLeave={() => { isDragging.current = false; isSelecting.current = false; setSelection(null); clickStartPos.current = null }}
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
        {!loading && !error && !data && !coverageData && !sequenceData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted-foreground">No data in this region</span>
          </div>
        )}
        {!loading && !error && data && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted-foreground">No features in this region</span>
          </div>
        )}
        <CrosshairLine />
      </div>
    </div>
  )
}

function CrosshairLine() {
  const enabled = useCrosshairStore((s) => s.enabled)
  const x = useCrosshairStore((s) => s.x)
  if (!enabled || x === null) return null
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500/70 pointer-events-none z-20"
      style={{ left: x }}
    />
  )
}
