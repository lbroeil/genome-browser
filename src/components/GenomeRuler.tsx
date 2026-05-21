import { useRef, useEffect, useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useTranscriptViewStore } from '@/store/transcriptViewStore'
import { useCrosshairStore } from '@/store/crosshairStore'
import { generateTicks, formatBp, bpToPixel, pixelToBp } from '@/utils/coordinates'
import { useThemeColors } from '@/hooks/useThemeColors'
import { FRAME_COLORS } from '@/utils/colors'

const RULER_HEIGHT = 40

export function GenomeRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { chromosome, start, end, pan, zoom, setRegion } = useGenomeStore()
  const txActive = useTranscriptViewStore((s) => s.active)
  const txMapper = useTranscriptViewStore((s) => s.mapper)
  const txStart = useTranscriptViewStore((s) => s.txStart)
  const txEnd = useTranscriptViewStore((s) => s.txEnd)
  const txFeatureName = useTranscriptViewStore((s) => s.featureName)
  const txCdsRange = useTranscriptViewStore((s) => s.cdsRange)
  const isDragging = useRef(false)
  const lastX = useRef(0)
  const colors = useThemeColors()

  // Drag-to-zoom selection (shift+drag)
  const isSelecting = useRef(false)
  const selectionStartX = useRef(0)
  const [selection, setSelection] = useState<{ left: number; width: number } | null>(null)

  // Effective coordinates (transcript or genomic)
  const effStart = txActive ? txStart : start
  const effEnd = txActive ? txEnd : end
  const effRegion = txActive
    ? { chromosome: 'tx', start: txStart, end: txEnd }
    : { chromosome, start, end }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = rect.width
    canvas.width = width * dpr
    canvas.height = RULER_HEIGHT * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${RULER_HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, RULER_HEIGHT)

    // Background
    ctx.fillStyle = colors.card
    ctx.fillRect(0, 0, width, RULER_HEIGHT)

    // Base line
    const baseY = RULER_HEIGHT - 1
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    ctx.lineTo(width, baseY)
    ctx.stroke()

    // Ticks
    const ticks = generateTicks(effStart, effEnd, Math.floor(width / 100))
    ctx.fillStyle = colors.foreground
    ctx.strokeStyle = colors.foreground
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'

    for (const tick of ticks) {
      const x = bpToPixel(tick, effRegion, width)
      if (x < 0 || x > width) continue

      ctx.beginPath()
      ctx.moveTo(x, baseY)
      ctx.lineTo(x, baseY - 8)
      ctx.stroke()

      if (txActive) {
        ctx.fillText(String(tick), x, baseY - 12)
      } else {
        ctx.fillText(formatBp(tick), x, baseY - 12)
      }
    }

    // Exon junction markers in transcript view
    if (txActive && txMapper) {
      const junctions = txMapper.getJunctionPositions()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = '#f59e0b' // amber
      ctx.lineWidth = 1
      for (const jPos of junctions) {
        if (jPos < effStart || jPos > effEnd) continue
        const x = bpToPixel(jPos, effRegion, width)
        ctx.beginPath()
        ctx.moveTo(x, 2)
        ctx.lineTo(x, baseY)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Frame color bands at top (transcript-relative frame)
      const span = effEnd - effStart
      if (span <= 3000) {
        const bandH = 3
        for (let bp = Math.max(0, effStart); bp < effEnd; bp++) {
          const x1 = bpToPixel(bp, effRegion, width)
          const x2 = bpToPixel(bp + 1, effRegion, width)
          ctx.fillStyle = FRAME_COLORS[bp % 3]
          ctx.fillRect(x1, 0, Math.max(1, x2 - x1), bandH)
        }
      }

      // CDS reference bar — shows annotated CDS with frame coloring relative to CDS start
      if (txCdsRange) {
        const cdsBarH = 6
        const cdsBarY = RULER_HEIGHT - 10
        const cdsVisStart = Math.max(txCdsRange.txStart, effStart)
        const cdsVisEnd = Math.min(txCdsRange.txEnd, effEnd)

        if (cdsVisStart < cdsVisEnd) {
          const cdsX1 = bpToPixel(cdsVisStart, effRegion, width)
          const cdsX2 = bpToPixel(cdsVisEnd, effRegion, width)

          // Background bar for CDS extent
          ctx.fillStyle = 'rgba(128,128,128,0.2)'
          ctx.fillRect(cdsX1, cdsBarY, cdsX2 - cdsX1, cdsBarH)

          // Frame-colored codon blocks within visible CDS
          if (span <= 3000) {
            for (let bp = cdsVisStart; bp < cdsVisEnd; bp++) {
              const frame = (bp - txCdsRange.txStart) % 3
              const x1 = bpToPixel(bp, effRegion, width)
              const x2 = bpToPixel(bp + 1, effRegion, width)
              ctx.fillStyle = FRAME_COLORS[frame]
              ctx.fillRect(x1, cdsBarY, Math.max(1, x2 - x1), cdsBarH)
            }
          } else {
            ctx.fillStyle = FRAME_COLORS[0]
            ctx.fillRect(cdsX1, cdsBarY, cdsX2 - cdsX1, cdsBarH)
          }

          // CDS label
          ctx.fillStyle = colors.foreground
          ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
          ctx.textAlign = 'left'
          const cdsLabelX = Math.max(cdsX1 + 2, 2)
          if (cdsX2 - cdsX1 > 30) {
            ctx.fillText('CDS', cdsLabelX, cdsBarY - 1)
          }
        }
      }
    }

    // Label
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
    if (txActive && txFeatureName) {
      ctx.fillStyle = '#8b5cf6' // violet
      ctx.fillText(`Transcript: ${txFeatureName}`, 4, 14)
      // Show strand
      if (txMapper) {
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = colors.foreground
        const strandLabel = txMapper.strand === '+' ? '(+ strand)' : '(\u2212 strand)'
        const nameWidth = ctx.measureText(`Transcript: ${txFeatureName}`).width
        ctx.fillText(strandLabel, 8 + nameWidth, 14)
      }
    } else {
      ctx.fillStyle = colors.foreground
      ctx.fillText(chromosome, 4, 14)
    }
  }, [chromosome, start, end, colors, txActive, txMapper, txStart, txEnd, txFeatureName, txCdsRange, effStart, effEnd, effRegion])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (useTranscriptViewStore.getState().active) return
      useGenomeStore.getState().setRegion({
        chromosome: useGenomeStore.getState().chromosome,
        start: useGenomeStore.getState().start,
        end: useGenomeStore.getState().end,
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

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
    if (e.shiftKey) {
      isSelecting.current = true
      const rect = canvasRef.current?.getBoundingClientRect()
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
      const rect = canvasRef.current?.getBoundingClientRect()
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

  const handleMouseUp = () => {
    if (isSelecting.current) {
      isSelecting.current = false
      if (selection && selection.width > 5) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          const txState = useTranscriptViewStore.getState()
          if (txState.active) {
            const txRegion = { chromosome: 'tx', start: txState.txStart, end: txState.txEnd }
            const s = pixelToBp(selection.left, txRegion, rect.width)
            const en = pixelToBp(selection.left + selection.width, txRegion, rect.width)
            txState.setTxRegion(Math.round(s), Math.round(en))
          } else {
            const region = { chromosome, start, end }
            const startBp = pixelToBp(selection.left, region, rect.width)
            const endBp = pixelToBp(selection.left + selection.width, region, rect.width)
            setRegion({ chromosome, start: Math.round(startBp), end: Math.round(endBp) })
          }
        }
      }
      setSelection(null)
      return
    }
    isDragging.current = false
  }

  const crosshairEnabled = useCrosshairStore((s) => s.enabled)
  const crosshairX = useCrosshairStore((s) => s.x)

  return (
    <div
      ref={containerRef}
      className="w-full relative border-b border-border cursor-grab active:cursor-grabbing select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} />
      {selection && selection.width > 0 && (
        <div
          className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary/60 pointer-events-none"
          style={{ left: selection.left, width: selection.width }}
        />
      )}
      {crosshairEnabled && crosshairX !== null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500/70 pointer-events-none z-20"
          style={{ left: crosshairX }}
        />
      )}
    </div>
  )
}
