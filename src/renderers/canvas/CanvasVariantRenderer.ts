import type { GenomicFeature, GenomicRegion, VariantData } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { VARIANT_COLORS } from '@/utils/colors'

const MARKER_SIZE = 8
const ROW_HEIGHT = 14

export function renderVariantCanvas(
  ctx: CanvasRenderingContext2D,
  features: GenomicFeature[],
  region: GenomicRegion,
  width: number,
  height: number,
  _color: string,
) {
  if (features.length === 0) return

  // Layout: simple stacking to avoid overlaps
  const rowEnds: number[] = []

  for (const feature of features) {
    const x = bpToPixel(feature.start, region, width)
    const varData = feature.data as VariantData
    const color = VARIANT_COLORS[varData.variantType] ?? VARIANT_COLORS.OTHER

    // Find available row
    let row = 0
    while (row < rowEnds.length && rowEnds[row] > x - MARKER_SIZE) row++
    if (row >= rowEnds.length) rowEnds.push(0)
    rowEnds[row] = x + MARKER_SIZE

    const y = 4 + row * ROW_HEIGHT
    if (y + MARKER_SIZE > height) continue

    // Draw diamond marker
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + MARKER_SIZE / 2, y + MARKER_SIZE / 2)
    ctx.lineTo(x, y + MARKER_SIZE)
    ctx.lineTo(x - MARKER_SIZE / 2, y + MARKER_SIZE / 2)
    ctx.closePath()
    ctx.fill()

    // Draw label if zoomed in
    const bpPerPx = (region.end - region.start) / width
    if (bpPerPx < 5) {
      ctx.fillStyle = '#0a0a0a'
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      const label = `${varData.ref}>${varData.alt[0] ?? ''}`
      ctx.fillText(label, x, y + MARKER_SIZE + 9)
    }
  }
}
