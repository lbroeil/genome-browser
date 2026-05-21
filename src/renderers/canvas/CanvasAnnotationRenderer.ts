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

function layoutFeatures(features: GenomicFeature[], region: GenomicRegion, canvasWidth: number): LayoutItem[] {
  const items: LayoutItem[] = []
  const rowEnds: number[] = []

  const sorted = [...features].sort((a, b) => a.start - b.start)

  for (const feature of sorted) {
    const x = bpToPixel(feature.start, region, canvasWidth)
    const xEnd = bpToPixel(feature.end, region, canvasWidth)
    const width = Math.max(1, xEnd - x)

    let row = 0
    while (row < rowEnds.length && rowEnds[row] > x - 2) {
      row++
    }
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

export type AnnotationDisplayMode = 'collapsed' | 'expanded' | 'frame'

export function renderAnnotationCanvas(
  ctx: CanvasRenderingContext2D,
  features: GenomicFeature[],
  region: GenomicRegion,
  width: number,
  height: number,
  defaultColor: string,
  labelColor?: string,
  displayMode: AnnotationDisplayMode = 'expanded',
  strandColors?: { forward: string; reverse: string },
) {
  if (features.length === 0) return

  const sc = strandColors ?? STRAND_COLORS
  const useFrameColor = displayMode === 'frame'
  const renderFeatures = displayMode === 'expanded' ? expandTranscripts(features) : features
  const layout = layoutFeatures(renderFeatures, region, width)
  const rowLabelEnds: Record<number, number> = {}

  for (const { feature, row, x, width: w } of layout) {
    const y = row * (ROW_HEIGHT + ROW_GAP) + 4

    if (y + FEATURE_HEIGHT > height) continue

    // Determine color
    let color = defaultColor
    if (useFrameColor) {
      color = FRAME_COLORS[feature.start % 3]
    } else if (feature.data.type === 'annotation' && feature.data.itemRgb) {
      color = feature.data.itemRgb
    } else if (feature.strand) {
      color = feature.strand === '+' ? sc.forward : sc.reverse
    }

    if (feature.data.type === 'gene_model') {
      const midY = y + FEATURE_HEIGHT / 2

      const transcript = feature.data.transcripts[0]
      if (transcript) {
        // Intron line spans the transcript extent (not gene extent) to avoid orphan lines
        const txX = bpToPixel(transcript.start, region, width)
        const txXEnd = bpToPixel(transcript.end, region, width)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(txX, midY)
        ctx.lineTo(txXEnd, midY)
        ctx.stroke()

        // UTRs (thinner)
        const utrHeight = FEATURE_HEIGHT * 0.5
        const utrY = y + (FEATURE_HEIGHT - utrHeight) / 2
        for (const utr of [...(transcript.utr5 ?? []), ...(transcript.utr3 ?? [])]) {
          const utrX = bpToPixel(utr.start, region, width)
          const utrW = Math.max(1, bpToPixel(utr.end, region, width) - utrX)
          ctx.fillStyle = color
          ctx.fillRect(utrX, utrY, utrW, utrHeight)
        }

        // Exons / CDS
        for (const exon of transcript.exons) {
          const exX = bpToPixel(exon.start, region, width)
          const exW = Math.max(1, bpToPixel(exon.end, region, width) - exX)

          if (transcript.cds && transcript.cds.length > 0) {
            for (const cds of transcript.cds) {
              const cdsOverlapStart = Math.max(exon.start, cds.start)
              const cdsOverlapEnd = Math.min(exon.end, cds.end)
              if (cdsOverlapStart < cdsOverlapEnd) {
                const cdsX = bpToPixel(cdsOverlapStart, region, width)
                const cdsW = Math.max(1, bpToPixel(cdsOverlapEnd, region, width) - cdsX)
                ctx.fillStyle = color
                ctx.fillRect(cdsX, y, cdsW, FEATURE_HEIGHT)
              }
            }
          } else {
            ctx.fillStyle = color
            ctx.fillRect(exX, y, exW, FEATURE_HEIGHT)
          }
        }

        // Strand direction arrows along intron
        const txW = txXEnd - txX
        if (txW > 30 && feature.strand) {
          ctx.fillStyle = color
          ctx.font = '8px sans-serif'
          ctx.textAlign = 'center'
          const arrowChar = feature.strand === '+' ? '\u25B8' : '\u25C2'
          const step = Math.max(20, txW / 8)
          for (let ax = txX + step; ax < txXEnd - 10; ax += step) {
            ctx.fillText(arrowChar, ax, midY + 3)
          }
        }
      }
    } else {
      // Simple annotation: colored rectangle
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, FEATURE_HEIGHT)

      if (w > 10 && feature.strand) {
        ctx.fillStyle = '#ffffff'
        ctx.font = '8px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(feature.strand === '+' ? '>' : '<', x + w / 2, y + FEATURE_HEIGHT - 2)
      }
    }

    // Draw label (sticky: clamps to visible area when feature extends off-screen left)
    let label: string | undefined
    if (feature.data.type === 'gene_model') {
      const geneName = feature.data.geneName ?? feature.data.geneId
      const transcriptId = feature.data.transcripts[0]?.id
      if (displayMode === 'expanded' && transcriptId) {
        label = w > 60 && geneName && geneName !== transcriptId
          ? `${geneName} · ${transcriptId}`
          : transcriptId
      } else {
        label = geneName
        if (w > 80 && transcriptId && transcriptId !== label) {
          label = `${label} · ${transcriptId}`
        }
      }
    } else if (feature.data.type === 'annotation') {
      label = feature.data.name
    }

    if (label) {
      ctx.fillStyle = labelColor ?? '#0a0a0a'
      ctx.font = 'italic 10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'left'
      const labelX = Math.max(x + 1, 2)
      const labelWidth = ctx.measureText(label).width
      // Skip label if it would overlap a previously drawn label on this row
      if (!rowLabelEnds[row] || labelX >= rowLabelEnds[row]) {
        ctx.fillText(label, labelX, y + FEATURE_HEIGHT + 12)
        rowLabelEnds[row] = labelX + labelWidth + 6
      }
    }
  }
}

const MAX_ANNOTATION_HEIGHT = 500
const MIN_ANNOTATION_HEIGHT = 60

export function getAnnotationTrackHeight(
  features: GenomicFeature[],
  region: GenomicRegion,
  canvasWidth: number,
  displayMode: AnnotationDisplayMode = 'expanded',
): number {
  if (features.length === 0) return MIN_ANNOTATION_HEIGHT
  const renderFeatures = displayMode === 'expanded' ? expandTranscripts(features) : features
  const layout = layoutFeatures(renderFeatures, region, canvasWidth)
  if (layout.length === 0) return MIN_ANNOTATION_HEIGHT
  const maxRow = Math.max(...layout.map((l) => l.row))
  const idealHeight = (maxRow + 1) * (ROW_HEIGHT + ROW_GAP) + 20
  return Math.min(MAX_ANNOTATION_HEIGHT, Math.max(MIN_ANNOTATION_HEIGHT, idealHeight))
}
