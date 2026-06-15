import type { GenomicFeature, GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { STRAND_COLORS, FRAME_COLORS, darken } from '@/utils/colors'

const ROW_HEIGHT = 26
const ROW_GAP = 2
const FEATURE_HEIGHT = 10

interface LayoutItem {
  feature: GenomicFeature
  row: number
  x: number
  width: number
  groupId?: string
}

function layoutFeatures(features: GenomicFeature[], region: GenomicRegion, canvasWidth: number): LayoutItem[] {
  const items: LayoutItem[] = []
  const rowEnds: number[] = []

  // Group annotation features by name (BED features with same name = same ORF)
  const nameGroups = new Map<string, GenomicFeature[]>()
  const ungrouped: GenomicFeature[] = []

  for (const feature of features) {
    const name = feature.data.type === 'annotation' ? feature.data.name : undefined
    if (name) {
      if (!nameGroups.has(name)) nameGroups.set(name, [])
      nameGroups.get(name)!.push(feature)
    } else {
      ungrouped.push(feature)
    }
  }

  // Single-feature "groups" go to ungrouped
  const groups: { name: string; features: GenomicFeature[] }[] = []
  for (const [name, feats] of nameGroups) {
    if (feats.length === 1) {
      ungrouped.push(feats[0])
    } else {
      groups.push({ name, features: feats.sort((a, b) => a.start - b.start) })
    }
  }

  // Layout multi-feature groups first — all members share one row
  for (const group of groups.sort((a, b) => a.features[0].start - b.features[0].start)) {
    const groupStart = Math.min(...group.features.map((f) => f.start))
    const groupEnd = Math.max(...group.features.map((f) => f.end))
    const x = bpToPixel(groupStart, region, canvasWidth)
    const xEnd = bpToPixel(groupEnd, region, canvasWidth)
    const groupWidth = Math.max(1, xEnd - x)

    let row = 0
    while (row < rowEnds.length && rowEnds[row] > x - 2) row++
    if (row >= rowEnds.length) rowEnds.push(0)
    rowEnds[row] = x + groupWidth

    for (const feature of group.features) {
      const fx = bpToPixel(feature.start, region, canvasWidth)
      const fxEnd = bpToPixel(feature.end, region, canvasWidth)
      const fw = Math.max(1, fxEnd - fx)
      items.push({ feature, row, x: fx, width: fw, groupId: group.name })
    }
  }

  // Layout ungrouped features with standard packing
  const sorted = [...ungrouped].sort((a, b) => a.start - b.start)
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

  // Draw intron lines for named groups first (behind the blocks)
  const groupSpans = new Map<string, { row: number; minX: number; maxX: number; strand?: '+' | '-'; color: string }>()
  for (const item of layout) {
    if (!item.groupId) continue
    let color = defaultColor
    if (useFrameColor) {
      color = FRAME_COLORS[item.feature.start % 3]
    } else if (item.feature.data.type === 'annotation' && item.feature.data.itemRgb) {
      color = item.feature.data.itemRgb
    } else if (item.feature.strand) {
      color = item.feature.strand === '+' ? sc.forward : sc.reverse
    }

    const existing = groupSpans.get(item.groupId)
    if (existing) {
      existing.minX = Math.min(existing.minX, item.x)
      existing.maxX = Math.max(existing.maxX, item.x + item.width)
    } else {
      groupSpans.set(item.groupId, {
        row: item.row,
        minX: item.x,
        maxX: item.x + item.width,
        strand: item.feature.strand as '+' | '-' | undefined,
        color,
      })
    }
  }

  for (const [, span] of groupSpans) {
    const y = span.row * (ROW_HEIGHT + ROW_GAP) + 4
    if (y + FEATURE_HEIGHT > height) continue
    const midY = y + FEATURE_HEIGHT / 2
    ctx.strokeStyle = span.color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(span.minX, midY)
    ctx.lineTo(span.maxX, midY)
    ctx.stroke()

    // Strand arrows along the connecting line
    const spanW = span.maxX - span.minX
    if (spanW > 30 && span.strand) {
      ctx.fillStyle = span.color
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'
      const arrowChar = span.strand === '+' ? '▸' : '◂'
      const step = Math.max(20, spanW / 8)
      for (let ax = span.minX + step; ax < span.maxX - 10; ax += step) {
        ctx.fillText(arrowChar, ax, midY + 3)
      }
    }
  }

  // Draw features
  for (const { feature, row, x, width: w, groupId } of layout) {
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
            // Non-CDS exon portions (UTR) at half height, CDS darker + full height
            // so the annotated coding region stands out for overlap comparison.
            ctx.fillStyle = color
            ctx.fillRect(exX, y + FEATURE_HEIGHT * 0.25, exW, FEATURE_HEIGHT * 0.5)
            for (const cds of transcript.cds) {
              const cdsOverlapStart = Math.max(exon.start, cds.start)
              const cdsOverlapEnd = Math.min(exon.end, cds.end)
              if (cdsOverlapStart < cdsOverlapEnd) {
                const cdsX = bpToPixel(cdsOverlapStart, region, width)
                const cdsW = Math.max(1, bpToPixel(cdsOverlapEnd, region, width) - cdsX)
                ctx.fillStyle = darken(color, 0.3)
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
          const arrowChar = feature.strand === '+' ? '▸' : '◂'
          const step = Math.max(20, txW / 8)
          for (let ax = txX + step; ax < txXEnd - 10; ax += step) {
            ctx.fillText(arrowChar, ax, midY + 3)
          }
        }
      }
    } else {
      const ann = feature.data.type === 'annotation' ? feature.data : undefined
      const blockSizes = ann?.blockSizes
      const blockStarts = ann?.blockStarts

      if (blockSizes && blockStarts && blockSizes.length > 1 && blockStarts.length === blockSizes.length) {
        // Spliced annotation (BED12): draw each exon block, joined by an intron
        // line, with the thick (CDS) portion full height and thin (UTR) halved.
        const midY = y + FEATURE_HEIGHT / 2
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, midY)
        ctx.lineTo(x + w, midY)
        ctx.stroke()

        const thickStart = ann?.thickStart
        const thickEnd = ann?.thickEnd
        const hasThick = thickStart != null && thickEnd != null && thickEnd > thickStart

        const drawSeg = (segStart: number, segEnd: number, h: number) => {
          if (segEnd <= segStart) return
          const sx = bpToPixel(segStart, region, width)
          const sw = Math.max(1, bpToPixel(segEnd, region, width) - sx)
          ctx.fillStyle = color
          ctx.fillRect(sx, y + (FEATURE_HEIGHT - h) / 2, sw, h)
        }

        const n = Math.min(blockSizes.length, blockStarts.length)
        for (let i = 0; i < n; i++) {
          const bStart = feature.start + blockStarts[i]
          const bEnd = bStart + blockSizes[i]
          if (hasThick) {
            drawSeg(bStart, Math.min(bEnd, thickStart!), FEATURE_HEIGHT * 0.5)
            drawSeg(Math.max(bStart, thickStart!), Math.min(bEnd, thickEnd!), FEATURE_HEIGHT)
            drawSeg(Math.max(bStart, thickEnd!), bEnd, FEATURE_HEIGHT * 0.5)
          } else {
            drawSeg(bStart, bEnd, FEATURE_HEIGHT)
          }
        }

        // Strand arrows along the intron line
        if (w > 30 && feature.strand) {
          ctx.fillStyle = color
          ctx.font = '8px sans-serif'
          ctx.textAlign = 'center'
          const arrowChar = feature.strand === '+' ? '▸' : '◂'
          const step = Math.max(20, w / 8)
          for (let ax = x + step; ax < x + w - 10; ax += step) {
            ctx.fillText(arrowChar, ax, midY + 3)
          }
        }
      } else {
        // Single-block annotation: colored rectangle
        ctx.fillStyle = color
        ctx.fillRect(x, y, w, FEATURE_HEIGHT)

        if (w > 10 && feature.strand && !groupId) {
          ctx.fillStyle = '#ffffff'
          ctx.font = '8px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(feature.strand === '+' ? '>' : '<', x + w / 2, y + FEATURE_HEIGHT - 2)
        }
      }
    }

    // Draw label
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
      // For grouped features, only label the first one (leftmost)
      if (groupId) {
        const span = groupSpans.get(groupId)
        if (span && Math.abs(x - span.minX) > 1) {
          label = undefined
        } else {
          label = feature.data.name
        }
      } else {
        label = feature.data.name
      }
    }

    if (label) {
      ctx.fillStyle = labelColor ?? '#0a0a0a'
      ctx.font = 'italic 10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'left'
      const labelX = Math.max(x + 1, 2)
      const labelWidth = ctx.measureText(label).width
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
