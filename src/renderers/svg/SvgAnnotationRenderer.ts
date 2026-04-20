import type { GenomicFeature, GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { STRAND_COLORS, FRAME_COLORS } from '@/utils/colors'

const ROW_HEIGHT = 26
const ROW_GAP = 2
const FEATURE_HEIGHT = 10

interface LayoutItem {
  feature: GenomicFeature
  row: number
  x: number
  width: number
}

/** Clamp a rect to [0, viewportWidth]. Returns null if entirely outside. */
function clampRect(x: number, w: number, viewportWidth: number): { x: number; w: number } | null {
  const x2 = x + w
  if (x2 <= 0 || x >= viewportWidth) return null
  const cx = Math.max(0, x)
  const cx2 = Math.min(viewportWidth, x2)
  return { x: cx, w: Math.max(1, cx2 - cx) }
}

/** Clamp a line's x coordinates to [0, viewportWidth]. Returns null if entirely outside. */
function clampLine(x1: number, x2: number, viewportWidth: number): { x1: number; x2: number } | null {
  if (x2 <= 0 || x1 >= viewportWidth) return null
  return { x1: Math.max(0, x1), x2: Math.min(viewportWidth, x2) }
}

function layoutFeatures(features: GenomicFeature[], region: GenomicRegion, canvasWidth: number): LayoutItem[] {
  const items: LayoutItem[] = []
  const rowEnds: number[] = []
  const sorted = [...features].sort((a, b) => a.start - b.start)

  for (const feature of sorted) {
    const x = bpToPixel(feature.start, region, canvasWidth)
    const xEnd = bpToPixel(feature.end, region, canvasWidth)
    const width = Math.max(1, xEnd - x)

    let row = 0
    while (row < rowEnds.length && rowEnds[row] > x - 2) row++
    if (row >= rowEnds.length) rowEnds.push(0)
    rowEnds[row] = x + width

    items.push({ feature, row, x, width })
  }

  return items
}

function expandTranscripts(features: GenomicFeature[]): GenomicFeature[] {
  const result: GenomicFeature[] = []
  for (const feature of features) {
    if (feature.data.type === 'gene_model' && feature.data.transcripts.length > 0) {
      for (const transcript of feature.data.transcripts) {
        result.push({
          ...feature,
          id: `${feature.id}-${transcript.id}`,
          start: transcript.start,
          end: transcript.end,
          data: {
            ...feature.data,
            transcripts: [transcript],
          },
        })
      }
    } else {
      result.push(feature)
    }
  }
  return result
}

export type SvgAnnotationDisplayMode = 'collapsed' | 'expanded' | 'frame'

export function renderAnnotationSvg(
  features: GenomicFeature[],
  region: GenomicRegion,
  width: number,
  height: number,
  defaultColor: string,
  trackName: string,
  displayMode: SvgAnnotationDisplayMode = 'collapsed',
  strandColors?: { forward: string; reverse: string },
): SVGGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('id', `track-${trackName.replace(/[^a-zA-Z0-9]/g, '-')}`)
  g.setAttribute('class', 'track annotation')

  if (features.length === 0) return g

  const renderFeatures = displayMode === 'expanded' ? expandTranscripts(features) : features
  const layout = layoutFeatures(renderFeatures, region, width)

  // Group features by strand for logical SVG grouping
  const forwardGroup = document.createElementNS(ns, 'g')
  forwardGroup.setAttribute('class', 'features strand-forward')

  const reverseGroup = document.createElementNS(ns, 'g')
  reverseGroup.setAttribute('class', 'features strand-reverse')

  const unknownGroup = document.createElementNS(ns, 'g')
  unknownGroup.setAttribute('class', 'features strand-unknown')

  const labelsGroup = document.createElementNS(ns, 'g')
  labelsGroup.setAttribute('class', 'labels')

  for (const { feature, row, x, width: w } of layout) {
    const y = row * (ROW_HEIGHT + ROW_GAP) + 4
    if (y + FEATURE_HEIGHT > height) continue

    const sc = strandColors ?? STRAND_COLORS
    let color = defaultColor
    if (displayMode === 'frame') {
      color = FRAME_COLORS[feature.start % 3]
    } else if (feature.data.type === 'annotation' && feature.data.itemRgb) {
      color = feature.data.itemRgb
    } else if (feature.strand) {
      color = feature.strand === '+' ? sc.forward : sc.reverse
    }

    const targetGroup = feature.strand === '+' ? forwardGroup : feature.strand === '-' ? reverseGroup : unknownGroup

    if (feature.data.type === 'gene_model' && feature.data.transcripts.length > 0) {
      const geneG = document.createElementNS(ns, 'g')
      geneG.setAttribute('class', 'gene')
      geneG.setAttribute('data-gene-id', feature.data.geneId)
      if (feature.data.geneName) geneG.setAttribute('data-gene-name', feature.data.geneName)

      const transcript = feature.data.transcripts[0]
      const midY = y + FEATURE_HEIGHT / 2

      // Intron line — clamped to viewport
      const txX = bpToPixel(transcript.start, region, width)
      const txXEnd = bpToPixel(transcript.end, region, width)
      const clampedIntron = clampLine(txX, txXEnd, width)
      if (clampedIntron) {
        const intronLine = document.createElementNS(ns, 'line')
        intronLine.setAttribute('x1', clampedIntron.x1.toFixed(1))
        intronLine.setAttribute('y1', String(midY))
        intronLine.setAttribute('x2', clampedIntron.x2.toFixed(1))
        intronLine.setAttribute('y2', String(midY))
        intronLine.setAttribute('stroke', color)
        intronLine.setAttribute('stroke-width', '1')
        intronLine.setAttribute('class', 'intron')
        geneG.appendChild(intronLine)
      }

      // Exons / CDS — clamped to viewport
      for (const exon of transcript.exons) {
        if (transcript.cds && transcript.cds.length > 0) {
          for (const cds of transcript.cds) {
            const cdsOverlapStart = Math.max(exon.start, cds.start)
            const cdsOverlapEnd = Math.min(exon.end, cds.end)
            if (cdsOverlapStart < cdsOverlapEnd) {
              const cdsX = bpToPixel(cdsOverlapStart, region, width)
              const cdsW = Math.max(1, bpToPixel(cdsOverlapEnd, region, width) - cdsX)
              const clamped = clampRect(cdsX, cdsW, width)
              if (clamped) {
                const rect = document.createElementNS(ns, 'rect')
                rect.setAttribute('x', clamped.x.toFixed(1))
                rect.setAttribute('y', String(y))
                rect.setAttribute('width', clamped.w.toFixed(1))
                rect.setAttribute('height', String(FEATURE_HEIGHT))
                rect.setAttribute('fill', color)
                rect.setAttribute('class', 'cds')
                geneG.appendChild(rect)
              }
            }
          }
        } else {
          const exX = bpToPixel(exon.start, region, width)
          const exW = Math.max(1, bpToPixel(exon.end, region, width) - exX)
          const clamped = clampRect(exX, exW, width)
          if (clamped) {
            const rect = document.createElementNS(ns, 'rect')
            rect.setAttribute('x', clamped.x.toFixed(1))
            rect.setAttribute('y', String(y))
            rect.setAttribute('width', clamped.w.toFixed(1))
            rect.setAttribute('height', String(FEATURE_HEIGHT))
            rect.setAttribute('fill', color)
            rect.setAttribute('class', 'exon')
            geneG.appendChild(rect)
          }
        }
      }

      // UTRs — clamped to viewport
      const utrHeight = FEATURE_HEIGHT * 0.5
      const utrY = y + (FEATURE_HEIGHT - utrHeight) / 2
      for (const utr of [...(transcript.utr5 ?? []), ...(transcript.utr3 ?? [])]) {
        const utrX = bpToPixel(utr.start, region, width)
        const utrW = Math.max(1, bpToPixel(utr.end, region, width) - utrX)
        const clamped = clampRect(utrX, utrW, width)
        if (clamped) {
          const rect = document.createElementNS(ns, 'rect')
          rect.setAttribute('x', clamped.x.toFixed(1))
          rect.setAttribute('y', utrY.toFixed(1))
          rect.setAttribute('width', clamped.w.toFixed(1))
          rect.setAttribute('height', utrHeight.toFixed(1))
          rect.setAttribute('fill', color)
          rect.setAttribute('class', 'utr')
          geneG.appendChild(rect)
        }
      }

      targetGroup.appendChild(geneG)

      // Label — clamp x to viewport
      const geneName = feature.data.geneName ?? feature.data.geneId
      let label: string | undefined
      if (displayMode === 'expanded' && transcript.id) {
        label = w > 60 && geneName && geneName !== transcript.id
          ? `${geneName} · ${transcript.id}`
          : transcript.id
      } else {
        label = geneName
        if (w > 80 && transcript.id && transcript.id !== label) {
          label = `${label} · ${transcript.id}`
        }
      }

      if (label) {
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(Math.max(Math.min(x + 1, width - 10), 2)))
        text.setAttribute('y', String(y + FEATURE_HEIGHT + 12))
        text.setAttribute('font-size', '10')
        text.setAttribute('font-style', 'italic')
        text.setAttribute('class', 'gene-label')
        text.textContent = label
        labelsGroup.appendChild(text)
      }
    } else {
      // Simple annotation — clamped to viewport
      const clamped = clampRect(x, w, width)
      if (clamped) {
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('x', clamped.x.toFixed(1))
        rect.setAttribute('y', String(y))
        rect.setAttribute('width', clamped.w.toFixed(1))
        rect.setAttribute('height', String(FEATURE_HEIGHT))
        rect.setAttribute('fill', color)
        rect.setAttribute('class', 'feature')
        if (feature.data.type === 'annotation' && feature.data.name) {
          rect.setAttribute('data-name', feature.data.name)
        }
        targetGroup.appendChild(rect)
      }

      // Label
      if (feature.data.type === 'annotation' && feature.data.name) {
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(Math.max(Math.min(x + 1, width - 10), 2)))
        text.setAttribute('y', String(y + FEATURE_HEIGHT + 12))
        text.setAttribute('font-size', '10')
        text.setAttribute('font-style', 'italic')
        text.setAttribute('class', 'feature-label')
        text.textContent = feature.data.name
        labelsGroup.appendChild(text)
      }
    }
  }

  g.appendChild(forwardGroup)
  g.appendChild(reverseGroup)
  g.appendChild(unknownGroup)
  g.appendChild(labelsGroup)

  return g
}
