import type { GenomicFeature, GenomicRegion, VariantData } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { VARIANT_COLORS } from '@/utils/colors'

const MARKER_SIZE = 8
const ROW_HEIGHT = 14

export function renderVariantSvg(
  features: GenomicFeature[],
  region: GenomicRegion,
  width: number,
  height: number,
  _color: string,
  trackName: string,
): SVGGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('id', `track-${trackName.replace(/[^a-zA-Z0-9]/g, '-')}`)
  g.setAttribute('class', 'track variant')

  if (features.length === 0) return g

  // Group by variant type
  const groups: Record<string, SVGGElement> = {}
  for (const type of ['SNV', 'INS', 'DEL', 'MNV', 'OTHER'] as const) {
    const typeGroup = document.createElementNS(ns, 'g')
    typeGroup.setAttribute('class', `variants variant-${type.toLowerCase()}`)
    groups[type] = typeGroup
  }

  const labelsGroup = document.createElementNS(ns, 'g')
  labelsGroup.setAttribute('class', 'labels')

  const rowEnds: number[] = []
  const bpPerPx = (region.end - region.start) / width

  for (const feature of features) {
    const x = bpToPixel(feature.start, region, width)
    // Skip variants entirely outside viewport
    if (x < -MARKER_SIZE || x > width + MARKER_SIZE) continue

    const varData = feature.data as VariantData
    const color = VARIANT_COLORS[varData.variantType] ?? VARIANT_COLORS.OTHER

    let row = 0
    while (row < rowEnds.length && rowEnds[row] > x - MARKER_SIZE) row++
    if (row >= rowEnds.length) rowEnds.push(0)
    rowEnds[row] = x + MARKER_SIZE

    const y = 4 + row * ROW_HEIGHT
    if (y + MARKER_SIZE > height) continue

    const hs = MARKER_SIZE / 2
    const diamond = document.createElementNS(ns, 'polygon')
    diamond.setAttribute('points', `${x},${y} ${x + hs},${y + hs} ${x},${y + MARKER_SIZE} ${x - hs},${y + hs}`)
    diamond.setAttribute('fill', color)
    if (varData.id) diamond.setAttribute('data-id', varData.id)
    diamond.setAttribute('data-ref', varData.ref)
    diamond.setAttribute('data-alt', varData.alt.join(','))

    const typeGroup = groups[varData.variantType] ?? groups.OTHER
    typeGroup.appendChild(diamond)

    if (bpPerPx < 5) {
      const label = document.createElementNS(ns, 'text')
      label.setAttribute('x', String(x))
      label.setAttribute('y', String(y + MARKER_SIZE + 9))
      label.setAttribute('text-anchor', 'middle')
      label.setAttribute('font-size', '9')
      label.setAttribute('fill', '#0a0a0a')
      label.textContent = `${varData.ref}>${varData.alt[0] ?? ''}`
      labelsGroup.appendChild(label)
    }
  }

  for (const typeGroup of Object.values(groups)) {
    if (typeGroup.children.length > 0) g.appendChild(typeGroup)
  }
  if (labelsGroup.children.length > 0) g.appendChild(labelsGroup)

  return g
}
