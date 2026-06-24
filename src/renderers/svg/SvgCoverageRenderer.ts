import type { CoverageBin, GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { FRAME_COLORS, ORF_FRAME_COLORS } from '@/utils/colors'
import { orfRelativeFrame, type OrfFrameOverlay } from '@/utils/orfFrame'

export type SvgCoverageDisplayMode = 'area' | 'bar' | 'frame'

export function renderCoverageSvg(
  bins: CoverageBin[],
  region: GenomicRegion,
  width: number,
  height: number,
  color: string,
  trackName: string,
  displayMode: SvgCoverageDisplayMode = 'area',
  overlay?: OrfFrameOverlay,
): SVGGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('id', `track-${trackName.replace(/[^a-zA-Z0-9]/g, '-')}`)
  g.setAttribute('class', 'track coverage')

  if (bins.length === 0) return g

  const maxValue = Math.max(...bins.map((b) => b.value), 1)
  const yPadding = 20
  const plotHeight = height - yPadding
  const plotTop = 4

  // Data group
  const dataGroup = document.createElementNS(ns, 'g')
  dataGroup.setAttribute('class', 'data')

  if (displayMode === 'frame') {
    // Frame-colored bars for Ribo-seq. With an ORF overlay, colour relative to
    // the ORF reading frame (in-frame bold green, out-of-frame muted).
    for (let f = 0; f < 3; f++) {
      const frameGroup = document.createElementNS(ns, 'g')
      frameGroup.setAttribute('class', `frame-${f}`)
      frameGroup.setAttribute('fill', overlay ? ORF_FRAME_COLORS[f] : FRAME_COLORS[f])
      if (overlay && f !== 0) frameGroup.setAttribute('fill-opacity', '0.5')

      for (const bin of bins) {
        if (bin.value === 0) continue
        const binFrame = overlay ? orfRelativeFrame(bin.start, overlay) : (bin.frame ?? (bin.start % 3))
        if (binFrame !== f) continue
        const x = bpToPixel(bin.start, region, width)
        const xEnd = bpToPixel(bin.end, region, width)
        const barW = Math.max(1, xEnd - x)
        const barHeight = (bin.value / maxValue) * plotHeight
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('x', String(x.toFixed(1)))
        rect.setAttribute('y', String((plotTop + plotHeight - barHeight).toFixed(1)))
        rect.setAttribute('width', String(barW.toFixed(1)))
        rect.setAttribute('height', String(barHeight.toFixed(1)))
        frameGroup.appendChild(rect)
      }
      dataGroup.appendChild(frameGroup)
    }
  } else if (displayMode === 'bar') {
    // Bar chart
    for (const bin of bins) {
      const x = bpToPixel(bin.start, region, width)
      const xEnd = bpToPixel(bin.end, region, width)
      const barW = Math.max(1, xEnd - x - 1)
      const barHeight = (bin.value / maxValue) * plotHeight
      const rect = document.createElementNS(ns, 'rect')
      rect.setAttribute('x', String(x.toFixed(1)))
      rect.setAttribute('y', String((plotTop + plotHeight - barHeight).toFixed(1)))
      rect.setAttribute('width', String(barW.toFixed(1)))
      rect.setAttribute('height', String(barHeight.toFixed(1)))
      rect.setAttribute('fill', color)
      rect.setAttribute('class', 'bar')
      dataGroup.appendChild(rect)
    }
  } else {
    // Area chart (default)
    let pathD = `M ${bpToPixel(bins[0].start, region, width)} ${plotTop + plotHeight}`
    for (const bin of bins) {
      const x = bpToPixel(bin.start, region, width)
      const barHeight = (bin.value / maxValue) * plotHeight
      const y = plotTop + plotHeight - barHeight
      pathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
    }
    const lastBin = bins[bins.length - 1]
    pathD += ` L ${bpToPixel(lastBin.end, region, width).toFixed(1)} ${plotTop + plotHeight} Z`

    const fillPath = document.createElementNS(ns, 'path')
    fillPath.setAttribute('d', pathD)
    fillPath.setAttribute('fill', color)
    fillPath.setAttribute('fill-opacity', '0.25')
    fillPath.setAttribute('stroke', 'none')
    fillPath.setAttribute('class', 'coverage-fill')
    dataGroup.appendChild(fillPath)

    let lineD = ''
    for (let i = 0; i < bins.length; i++) {
      const x = bpToPixel(bins[i].start, region, width)
      const barHeight = (bins[i].value / maxValue) * plotHeight
      const y = plotTop + plotHeight - barHeight
      lineD += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`
    }

    const linePath = document.createElementNS(ns, 'path')
    linePath.setAttribute('d', lineD)
    linePath.setAttribute('fill', 'none')
    linePath.setAttribute('stroke', color)
    linePath.setAttribute('stroke-width', '1')
    linePath.setAttribute('class', 'coverage-line')
    dataGroup.appendChild(linePath)
  }

  g.appendChild(dataGroup)

  // Axis group (left side y-axis labels)
  const axisGroup = document.createElementNS(ns, 'g')
  axisGroup.setAttribute('class', 'axis')

  const maxLabel = document.createElementNS(ns, 'text')
  maxLabel.setAttribute('x', '4')
  maxLabel.setAttribute('y', String(plotTop + 12))
  maxLabel.setAttribute('text-anchor', 'start')
  maxLabel.setAttribute('font-size', '10')
  maxLabel.textContent = maxValue.toFixed(1)
  axisGroup.appendChild(maxLabel)

  const zeroLabel = document.createElementNS(ns, 'text')
  zeroLabel.setAttribute('x', '4')
  zeroLabel.setAttribute('y', String(plotTop + plotHeight))
  zeroLabel.setAttribute('text-anchor', 'start')
  zeroLabel.setAttribute('font-size', '10')
  zeroLabel.textContent = '0'
  axisGroup.appendChild(zeroLabel)

  g.appendChild(axisGroup)

  return g
}
