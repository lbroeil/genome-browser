import type { GenomicFeature, GenomicRegion, AlignmentData, CoverageBin } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { computePileup } from '@/utils/pileup'
import { STRAND_COLORS, NUCLEOTIDE_COLORS } from '@/utils/colors'

const READ_HEIGHT = 6
const READ_GAP = 1
const COVERAGE_HEIGHT_FRACTION = 0.3

/** Clamp a rect to [0, viewportWidth]. Returns null if entirely outside. */
function clampRect(x: number, w: number, viewportWidth: number): { x: number; w: number } | null {
  const x2 = x + w
  if (x2 <= 0 || x >= viewportWidth) return null
  const cx = Math.max(0, x)
  const cx2 = Math.min(viewportWidth, x2)
  return { x: cx, w: Math.max(1, cx2 - cx) }
}

export function renderAlignmentSvg(
  features: GenomicFeature[],
  coverageBins: CoverageBin[],
  region: GenomicRegion,
  width: number,
  height: number,
  color: string,
  trackName: string,
): SVGGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('id', `track-${trackName.replace(/[^a-zA-Z0-9]/g, '-')}`)
  g.setAttribute('class', 'track alignment')

  const coverageHeight = Math.round(height * COVERAGE_HEIGHT_FRACTION)
  const readsAreaTop = coverageHeight + 4

  // Coverage sub-group — bins are already within viewport, but clamp for safety
  if (coverageBins.length > 0) {
    const covGroup = document.createElementNS(ns, 'g')
    covGroup.setAttribute('class', 'coverage')

    const maxValue = Math.max(...coverageBins.map((b) => b.value), 1)

    for (const bin of coverageBins) {
      const x = bpToPixel(bin.start, region, width)
      const xEnd = bpToPixel(bin.end, region, width)
      const barW = Math.max(1, xEnd - x)
      const barH = (bin.value / maxValue) * (coverageHeight - 4)

      const clamped = clampRect(x, barW, width)
      if (!clamped) continue

      const rect = document.createElementNS(ns, 'rect')
      rect.setAttribute('x', clamped.x.toFixed(1))
      rect.setAttribute('y', (coverageHeight - barH - 1).toFixed(1))
      rect.setAttribute('width', clamped.w.toFixed(1))
      rect.setAttribute('height', barH.toFixed(1))
      rect.setAttribute('fill', color)
      rect.setAttribute('fill-opacity', '0.4')
      covGroup.appendChild(rect)
    }

    // Max value label (left side)
    const maxLabel = document.createElementNS(ns, 'text')
    maxLabel.setAttribute('x', '4')
    maxLabel.setAttribute('y', '12')
    maxLabel.setAttribute('text-anchor', 'start')
    maxLabel.setAttribute('font-size', '9')
    maxLabel.textContent = String(Math.round(maxValue))
    covGroup.appendChild(maxLabel)

    g.appendChild(covGroup)
  }

  // Separator
  const sep = document.createElementNS(ns, 'line')
  sep.setAttribute('x1', '0')
  sep.setAttribute('y1', String(coverageHeight + 2))
  sep.setAttribute('x2', String(width))
  sep.setAttribute('y2', String(coverageHeight + 2))
  sep.setAttribute('stroke', '#e5e5e5')
  sep.setAttribute('stroke-width', '0.5')
  g.appendChild(sep)

  if (features.length === 0) return g

  // Reads
  const pileup = computePileup(features, (f) => f.start, (f) => f.end, 1)
  const readsAreaHeight = height - readsAreaTop
  const visibleRows = Math.floor(readsAreaHeight / (READ_HEIGHT + READ_GAP))
  const bpPerPx = (region.end - region.start) / width

  // Group by strand
  const forwardGroup = document.createElementNS(ns, 'g')
  forwardGroup.setAttribute('class', 'reads strand-forward')

  const reverseGroup = document.createElementNS(ns, 'g')
  reverseGroup.setAttribute('class', 'reads strand-reverse')

  const mismatchGroup = document.createElementNS(ns, 'g')
  mismatchGroup.setAttribute('class', 'mismatches')

  for (const { feature, row } of pileup) {
    if (row >= visibleRows) continue

    const y = readsAreaTop + row * (READ_HEIGHT + READ_GAP)
    const x = bpToPixel(feature.start, region, width)
    const xEnd = bpToPixel(feature.end, region, width)
    const w = Math.max(1, xEnd - x)

    // Clamp read rect to viewport
    const clamped = clampRect(x, w, width)
    if (!clamped) continue

    const alignData = feature.data as AlignmentData
    const readColor = alignData.isReversed ? STRAND_COLORS.reverse : STRAND_COLORS.forward
    const targetGroup = alignData.isReversed ? reverseGroup : forwardGroup

    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('x', clamped.x.toFixed(1))
    rect.setAttribute('y', String(y))
    rect.setAttribute('width', clamped.w.toFixed(1))
    rect.setAttribute('height', String(READ_HEIGHT))
    rect.setAttribute('fill', readColor)
    rect.setAttribute('data-read', alignData.readName)
    targetGroup.appendChild(rect)

    // Mismatches — clamp each one
    if (bpPerPx < 2) {
      for (const mm of alignData.mismatches) {
        const mmX = bpToPixel(mm.position, region, width)
        const mmW = Math.max(1, 1 / bpPerPx)
        const mmClamped = clampRect(mmX, mmW, width)
        if (!mmClamped) continue
        const mmRect = document.createElementNS(ns, 'rect')
        mmRect.setAttribute('x', mmClamped.x.toFixed(1))
        mmRect.setAttribute('y', String(y))
        mmRect.setAttribute('width', mmClamped.w.toFixed(1))
        mmRect.setAttribute('height', String(READ_HEIGHT))
        mmRect.setAttribute('fill', NUCLEOTIDE_COLORS[mm.base] ?? NUCLEOTIDE_COLORS.N)
        mismatchGroup.appendChild(mmRect)
      }
    }
  }

  g.appendChild(forwardGroup)
  g.appendChild(reverseGroup)
  g.appendChild(mismatchGroup)

  return g
}
