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

  // Group annotation features by name
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

  const groups: { name: string; features: GenomicFeature[] }[] = []
  for (const [name, feats] of nameGroups) {
    if (feats.length === 1) {
      ungrouped.push(feats[0])
    } else {
      groups.push({ name, features: feats.sort((a, b) => a.start - b.start) })
    }
  }

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

export type SvgAnnotationDisplayMode = 'collapsed' | 'expanded' | 'frame'

export function renderAnnotationSvg(
  features: GenomicFeature[],
  region: GenomicRegion,
  width: number,
  height: number,
  defaultColor: string,
  trackName: string,
  displayMode: SvgAnnotationDisplayMode = 'expanded',
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
  const rowLabelEnds: Record<number, number> = {}

  // Draw intron lines for named BED groups
  const groupSpans = new Map<string, { row: number; minX: number; maxX: number; strand?: '+' | '-'; color: string }>()
  for (const item of layout) {
    if (!item.groupId) continue
    const sc2 = strandColors ?? STRAND_COLORS
    let c = defaultColor
    if (displayMode === 'frame') c = FRAME_COLORS[item.feature.start % 3]
    else if (item.feature.data.type === 'annotation' && item.feature.data.itemRgb) c = item.feature.data.itemRgb
    else if (item.feature.strand) c = item.feature.strand === '+' ? sc2.forward : sc2.reverse

    const existing = groupSpans.get(item.groupId)
    if (existing) {
      existing.minX = Math.min(existing.minX, item.x)
      existing.maxX = Math.max(existing.maxX, item.x + item.width)
    } else {
      groupSpans.set(item.groupId, { row: item.row, minX: item.x, maxX: item.x + item.width, strand: item.feature.strand as '+' | '-' | undefined, color: c })
    }
  }

  for (const [, span] of groupSpans) {
    const y = span.row * (ROW_HEIGHT + ROW_GAP) + 4
    if (y + FEATURE_HEIGHT > height) continue
    const midY = y + FEATURE_HEIGHT / 2
    const clamped = clampLine(span.minX, span.maxX, width)
    if (clamped) {
      const targetG = span.strand === '+' ? forwardGroup : span.strand === '-' ? reverseGroup : unknownGroup
      const line = document.createElementNS(ns, 'line')
      line.setAttribute('x1', clamped.x1.toFixed(1))
      line.setAttribute('y1', String(midY))
      line.setAttribute('x2', clamped.x2.toFixed(1))
      line.setAttribute('y2', String(midY))
      line.setAttribute('stroke', span.color)
      line.setAttribute('stroke-width', '1')
      line.setAttribute('class', 'group-intron')
      targetG.appendChild(line)
    }
  }

  for (const { feature, row, x, width: w, groupId } of layout) {
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

      // Intron line with direction arrows — clamped to viewport
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

        // Direction chevrons on intron lines between exons
        const strand = feature.strand ?? transcript.strand
        if (strand === '+' || strand === '-') {
          const exonsSorted = [...transcript.exons].sort((a, b) => a.start - b.start)
          for (let ei = 0; ei < exonsSorted.length - 1; ei++) {
            const gapStart = bpToPixel(exonsSorted[ei].end, region, width)
            const gapEnd = bpToPixel(exonsSorted[ei + 1].start, region, width)
            const gapMid = (gapStart + gapEnd) / 2
            if (gapMid < 0 || gapMid > width || gapEnd - gapStart < 12) continue
            const arrowSize = 3
            if (strand === '+') {
              const chevron = document.createElementNS(ns, 'polyline')
              chevron.setAttribute('points', `${(gapMid - arrowSize).toFixed(1)},${midY - arrowSize} ${gapMid.toFixed(1)},${midY} ${(gapMid - arrowSize).toFixed(1)},${midY + arrowSize}`)
              chevron.setAttribute('stroke', color)
              chevron.setAttribute('stroke-width', '1')
              chevron.setAttribute('fill', 'none')
              chevron.setAttribute('class', 'direction-arrow')
              geneG.appendChild(chevron)
            } else {
              const chevron = document.createElementNS(ns, 'polyline')
              chevron.setAttribute('points', `${(gapMid + arrowSize).toFixed(1)},${midY - arrowSize} ${gapMid.toFixed(1)},${midY} ${(gapMid + arrowSize).toFixed(1)},${midY + arrowSize}`)
              chevron.setAttribute('stroke', color)
              chevron.setAttribute('stroke-width', '1')
              chevron.setAttribute('fill', 'none')
              chevron.setAttribute('class', 'direction-arrow')
              geneG.appendChild(chevron)
            }
          }
        }
      }

      // Exons / CDS — clamped to viewport
      for (const exon of transcript.exons) {
        if (transcript.cds && transcript.cds.length > 0) {
          // Non-CDS exon (UTR) portion at half height; CDS darker + full height
          // so the annotated coding region stands out for overlap comparison.
          const exX = bpToPixel(exon.start, region, width)
          const exW = Math.max(1, bpToPixel(exon.end, region, width) - exX)
          const exClamped = clampRect(exX, exW, width)
          if (exClamped) {
            const rect = document.createElementNS(ns, 'rect')
            rect.setAttribute('x', exClamped.x.toFixed(1))
            rect.setAttribute('y', String(y + FEATURE_HEIGHT * 0.25))
            rect.setAttribute('width', exClamped.w.toFixed(1))
            rect.setAttribute('height', String(FEATURE_HEIGHT * 0.5))
            rect.setAttribute('fill', color)
            rect.setAttribute('class', 'exon')
            geneG.appendChild(rect)
          }
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
                rect.setAttribute('fill', darken(color, 0.3))
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
        const labelX = Math.max(Math.min(x + 1, width - 10), 2)
        const estWidth = label.length * 6
        if (!rowLabelEnds[row] || labelX >= rowLabelEnds[row]) {
          const text = document.createElementNS(ns, 'text')
          text.setAttribute('x', String(labelX))
          text.setAttribute('y', String(y + FEATURE_HEIGHT + 12))
          text.setAttribute('font-size', '10')
          text.setAttribute('font-style', 'italic')
          text.setAttribute('class', 'gene-label')
          text.textContent = label
          labelsGroup.appendChild(text)
          rowLabelEnds[row] = labelX + estWidth + 6
        }
      }
    } else {
      const ann = feature.data.type === 'annotation' ? feature.data : undefined
      const blockSizes = ann?.blockSizes
      const blockStarts = ann?.blockStarts

      if (blockSizes && blockStarts && blockSizes.length > 1 && blockStarts.length === blockSizes.length) {
        // Spliced annotation (BED12): exon blocks joined by an intron line, with
        // the thick (CDS) portion full height and thin (UTR) halved.
        const midY = y + FEATURE_HEIGHT / 2
        const clampedIntron = clampLine(x, x + w, width)
        if (clampedIntron) {
          const intronLine = document.createElementNS(ns, 'line')
          intronLine.setAttribute('x1', clampedIntron.x1.toFixed(1))
          intronLine.setAttribute('y1', String(midY))
          intronLine.setAttribute('x2', clampedIntron.x2.toFixed(1))
          intronLine.setAttribute('y2', String(midY))
          intronLine.setAttribute('stroke', color)
          intronLine.setAttribute('stroke-width', '1')
          intronLine.setAttribute('class', 'intron')
          targetGroup.appendChild(intronLine)
        }

        const thickStart = ann?.thickStart
        const thickEnd = ann?.thickEnd
        const hasThick = thickStart != null && thickEnd != null && thickEnd > thickStart

        const drawSeg = (segStart: number, segEnd: number, h: number) => {
          if (segEnd <= segStart) return
          const sx = bpToPixel(segStart, region, width)
          const sw = Math.max(1, bpToPixel(segEnd, region, width) - sx)
          const clamped = clampRect(sx, sw, width)
          if (!clamped) return
          const rect = document.createElementNS(ns, 'rect')
          rect.setAttribute('x', clamped.x.toFixed(1))
          rect.setAttribute('y', String(y + (FEATURE_HEIGHT - h) / 2))
          rect.setAttribute('width', clamped.w.toFixed(1))
          rect.setAttribute('height', String(h))
          rect.setAttribute('fill', color)
          rect.setAttribute('class', 'feature')
          if (ann?.name) rect.setAttribute('data-name', ann.name)
          targetGroup.appendChild(rect)
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
      } else {
        // Single-block annotation — clamped to viewport
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
      }

      // Label (for grouped features, only label the leftmost block)
      let showLabel = true
      if (groupId) {
        const span = groupSpans.get(groupId)
        if (span && Math.abs(x - span.minX) > 1) showLabel = false
      }
      if (showLabel && feature.data.type === 'annotation' && feature.data.name) {
        const labelX = Math.max(Math.min(x + 1, width - 10), 2)
        const estWidth = feature.data.name.length * 6
        if (!rowLabelEnds[row] || labelX >= rowLabelEnds[row]) {
          const text = document.createElementNS(ns, 'text')
          text.setAttribute('x', String(labelX))
          text.setAttribute('y', String(y + FEATURE_HEIGHT + 12))
          text.setAttribute('font-size', '10')
          text.setAttribute('font-style', 'italic')
          text.setAttribute('class', 'feature-label')
          text.textContent = feature.data.name
          labelsGroup.appendChild(text)
          rowLabelEnds[row] = labelX + estWidth + 6
        }
      }
    }
  }

  g.appendChild(forwardGroup)
  g.appendChild(reverseGroup)
  g.appendChild(unknownGroup)
  g.appendChild(labelsGroup)

  return g
}
