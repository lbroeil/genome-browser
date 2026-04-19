import { useRef, useEffect, useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { generateTicks, formatBp, bpToPixel, pixelToBp } from '@/utils/coordinates'
import { useThemeColors } from '@/hooks/useThemeColors'

const RULER_HEIGHT = 40

export function GenomeRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { chromosome, start, end, pan, zoom, setRegion } = useGenomeStore()
  const isDragging = useRef(false)
  const lastX = useRef(0)
  const colors = useThemeColors()

  // Drag-to-zoom selection (shift+drag)
  const isSelecting = useRef(false)
  const selectionStartX = useRef(0)
  const [selection, setSelection] = useState<{ left: number; width: number } | null>(null)

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
    const ticks = generateTicks(start, end, Math.floor(width / 100))
    ctx.fillStyle = colors.foreground
    ctx.strokeStyle = colors.foreground
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'

    for (const tick of ticks) {
      const x = bpToPixel(tick, { chromosome, start, end }, width)
      if (x < 0 || x > width) continue

      ctx.beginPath()
      ctx.moveTo(x, baseY)
      ctx.lineTo(x, baseY - 8)
      ctx.stroke()

      ctx.fillText(formatBp(tick), x, baseY - 12)
    }

    // Chromosome label
    ctx.textAlign = 'left'
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(chromosome, 4, 14)
  }, [chromosome, start, end, colors])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
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
    const deltaBp = -(deltaPx / rect.width) * (end - start)
    pan(Math.round(deltaBp))
    lastX.current = e.clientX
  }

  const handleMouseUp = () => {
    if (isSelecting.current) {
      isSelecting.current = false
      if (selection && selection.width > 5) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          const region = { chromosome, start, end }
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
    </div>
  )
}
