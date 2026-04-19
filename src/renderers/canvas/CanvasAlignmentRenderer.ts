import type { GenomicFeature, GenomicRegion, AlignmentData, CoverageBin } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { computePileup } from '@/utils/pileup'
import { STRAND_COLORS, NUCLEOTIDE_COLORS } from '@/utils/colors'

const READ_HEIGHT = 6
const READ_GAP = 1
const COVERAGE_HEIGHT_FRACTION = 0.3
const MIN_BP_PER_PX_FOR_READS = 0.5 // Show individual reads when zoomed in enough

export function renderAlignmentCanvas(
  ctx: CanvasRenderingContext2D,
  features: GenomicFeature[],
  coverageBins: CoverageBin[],
  region: GenomicRegion,
  width: number,
  height: number,
  color: string,
) {
  const bpPerPx = (region.end - region.start) / width
  const coverageHeight = Math.round(height * COVERAGE_HEIGHT_FRACTION)
  const readsAreaTop = coverageHeight + 4
  const readsAreaHeight = height - readsAreaTop

  // Draw coverage on top
  if (coverageBins.length > 0) {
    renderCoverageHistogram(ctx, coverageBins, region, width, coverageHeight, color)
  }

  // Draw separator line
  ctx.strokeStyle = '#e5e5e5'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, coverageHeight + 2)
  ctx.lineTo(width, coverageHeight + 2)
  ctx.stroke()

  // Draw reads if zoomed in enough
  if (bpPerPx > 50) {
    // Too zoomed out for individual reads
    ctx.fillStyle = '#737373'
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Zoom in to see individual reads', width / 2, readsAreaTop + 20)
    return
  }

  if (features.length === 0) return

  // Compute pileup layout
  const pileup = computePileup(
    features,
    (f) => f.start,
    (f) => f.end,
    1,
  )

  const maxRow = Math.max(...pileup.map((p) => p.row))
  const visibleRows = Math.floor(readsAreaHeight / (READ_HEIGHT + READ_GAP))

  for (const { feature, row } of pileup) {
    if (row >= visibleRows) continue

    const y = readsAreaTop + row * (READ_HEIGHT + READ_GAP)
    const x = bpToPixel(feature.start, region, width)
    const xEnd = bpToPixel(feature.end, region, width)
    const w = Math.max(1, xEnd - x)

    const alignData = feature.data as AlignmentData

    // Read color based on strand
    const readColor = alignData.isReversed ? STRAND_COLORS.reverse : STRAND_COLORS.forward

    // Draw read body
    ctx.fillStyle = readColor
    ctx.fillRect(x, y, w, READ_HEIGHT)

    // Draw mismatches if zoomed in enough
    if (bpPerPx < 2) {
      for (const mm of alignData.mismatches) {
        const mmX = bpToPixel(mm.position, region, width)
        const mmW = Math.max(1, 1 / bpPerPx)
        ctx.fillStyle = NUCLEOTIDE_COLORS[mm.base] ?? NUCLEOTIDE_COLORS.N
        ctx.fillRect(mmX, y, mmW, READ_HEIGHT)

        // Show base letter if zoomed in very close
        if (bpPerPx < MIN_BP_PER_PX_FOR_READS) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `${Math.min(READ_HEIGHT, 10)}px monospace`
          ctx.textAlign = 'center'
          ctx.fillText(mm.base, mmX + mmW / 2, y + READ_HEIGHT - 1)
        }
      }
    }

    // Draw soft clips
    if (alignData.softClipStart > 0) {
      const clipW = bpToPixel(feature.start + alignData.softClipStart, region, width) - x
      ctx.fillStyle = '#f59e0b80'
      ctx.fillRect(x, y, Math.max(1, clipW), READ_HEIGHT)
    }
    if (alignData.softClipEnd > 0) {
      const clipStart = bpToPixel(feature.end - alignData.softClipEnd, region, width)
      ctx.fillStyle = '#f59e0b80'
      ctx.fillRect(clipStart, y, Math.max(1, xEnd - clipStart), READ_HEIGHT)
    }

    // Draw strand direction indicator
    if (w > 8) {
      ctx.fillStyle = '#ffffff'
      ctx.font = '6px sans-serif'
      ctx.textAlign = alignData.isReversed ? 'left' : 'right'
      const arrowX = alignData.isReversed ? x + 2 : x + w - 2
      ctx.fillText(alignData.isReversed ? '<' : '>', arrowX, y + READ_HEIGHT - 1)
    }
  }

  // Show overflow indicator
  if (maxRow >= visibleRows) {
    ctx.fillStyle = '#737373'
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${features.length} reads (${maxRow + 1} rows)`, width - 4, height - 4)
  }
}

function renderCoverageHistogram(
  ctx: CanvasRenderingContext2D,
  bins: CoverageBin[],
  region: GenomicRegion,
  width: number,
  height: number,
  color: string,
) {
  if (bins.length === 0) return
  const maxValue = Math.max(...bins.map((b) => b.value), 1)
  const plotTop = 2

  // Draw filled bars
  for (const bin of bins) {
    const x = bpToPixel(bin.start, region, width)
    const xEnd = bpToPixel(bin.end, region, width)
    const barW = Math.max(1, xEnd - x)
    const barH = (bin.value / maxValue) * (height - plotTop - 2)

    ctx.fillStyle = color + '60'
    ctx.fillRect(x, height - barH - 1, barW, barH)
  }

  // Y-axis label
  ctx.fillStyle = '#737373'
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(String(Math.round(maxValue)), width - 4, plotTop + 10)
}
