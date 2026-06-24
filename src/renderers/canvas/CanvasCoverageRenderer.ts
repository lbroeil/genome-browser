import type { CoverageBin, GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { FRAME_COLORS, ORF_FRAME_COLORS } from '@/utils/colors'
import { orfRelativeFrame, type OrfFrameOverlay } from '@/utils/orfFrame'

export type CoverageDisplayMode = 'area' | 'bar' | 'frame'

export function renderCoverageCanvas(
  ctx: CanvasRenderingContext2D,
  bins: CoverageBin[],
  region: GenomicRegion,
  width: number,
  height: number,
  color: string,
  displayMode: CoverageDisplayMode = 'area',
  overlay?: OrfFrameOverlay,
) {
  if (bins.length === 0) return

  const maxValue = Math.max(...bins.map((b) => b.value), 1)
  const yPadding = 20
  const plotHeight = height - yPadding
  const plotTop = 4

  if (displayMode === 'frame') {
    // Frame-colored bars for Ribo-seq p-site data. With an ORF overlay, colour
    // RELATIVE to the ORF reading frame so in-frame P-sites are bold green and
    // out-of-frame are muted — the periodicity read the curator wants at a glance.
    for (const bin of bins) {
      if (bin.value === 0) continue
      const x = bpToPixel(bin.start, region, width)
      const xEnd = bpToPixel(bin.end, region, width)
      const barW = Math.max(1, xEnd - x)
      const barHeight = (bin.value / maxValue) * plotHeight
      if (overlay) {
        const rel = orfRelativeFrame(bin.start, overlay)
        ctx.fillStyle = ORF_FRAME_COLORS[rel]
        ctx.globalAlpha = rel === 0 ? 1.0 : 0.5
        ctx.fillRect(x, plotTop + plotHeight - barHeight, barW, barHeight)
        ctx.globalAlpha = 1.0
      } else {
        ctx.fillStyle = FRAME_COLORS[bin.frame ?? (bin.start % 3)]
        ctx.fillRect(x, plotTop + plotHeight - barHeight, barW, barHeight)
      }
    }
  } else if (displayMode === 'bar') {
    // Bar chart
    ctx.fillStyle = color
    for (const bin of bins) {
      const x = bpToPixel(bin.start, region, width)
      const xEnd = bpToPixel(bin.end, region, width)
      const barW = Math.max(1, xEnd - x - 1)
      const barHeight = (bin.value / maxValue) * plotHeight
      ctx.fillRect(x, plotTop + plotHeight - barHeight, barW, barHeight)
    }
  } else {
    // Area chart
    ctx.beginPath()
    ctx.moveTo(bpToPixel(bins[0].start, region, width), plotTop + plotHeight)

    for (const bin of bins) {
      const x = bpToPixel(bin.start, region, width)
      const barHeight = (bin.value / maxValue) * plotHeight
      const y = plotTop + plotHeight - barHeight
      ctx.lineTo(x, y)
    }

    const lastBin = bins[bins.length - 1]
    ctx.lineTo(bpToPixel(lastBin.end, region, width), plotTop + plotHeight)
    ctx.closePath()

    ctx.globalAlpha = 0.25
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1.0

    // Stroke the line
    ctx.beginPath()
    for (let i = 0; i < bins.length; i++) {
      const x = bpToPixel(bins[i].start, region, width)
      const barHeight = (bins[i].value / maxValue) * plotHeight
      const y = plotTop + plotHeight - barHeight
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Y-axis labels
  ctx.fillStyle = '#737373'
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(maxValue.toFixed(1), width - 4, plotTop + 10)
  ctx.fillText('0', width - 4, plotTop + plotHeight)

  // Frame legend when in frame mode
  if (displayMode === 'frame') {
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    const labels = overlay ? ['in-frame', '+1', '+2'] : ['F1', 'F2', 'F3']
    const palette = overlay ? ORF_FRAME_COLORS : FRAME_COLORS
    let lx = 4
    for (let f = 0; f < 3; f++) {
      ctx.globalAlpha = overlay && f !== 0 ? 0.5 : 1.0
      ctx.fillStyle = palette[f]
      ctx.fillRect(lx, plotTop + 2, 8, 8)
      ctx.globalAlpha = 1.0
      ctx.fillStyle = '#737373'
      ctx.fillText(labels[f], lx + 11, plotTop + 10)
      lx += 13 + ctx.measureText(labels[f]).width + 10
    }
  }
}
