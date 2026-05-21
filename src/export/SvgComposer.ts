import type { GenomicRegion } from '@/adapters/types'
import { generateTicks, formatBp, bpToPixel } from '@/utils/coordinates'
import { FRAME_COLORS, STRAND_COLORS, VARIANT_COLORS } from '@/utils/colors'

export interface ComposerOptions {
  width: number
  trackElements: { element: SVGGElement; height: number; name: string }[]
  region: GenomicRegion
  rulerHeight?: number
  trackGap?: number
  labelWidth?: number
  fontFamily?: string
  fontScale?: number
  showScaleBar?: boolean
  showLegends?: boolean
  highlight?: { start: number; end: number; color: string }
}

function pickScaleBar(span: number): { value: number; label: string } {
  const targets = [
    { value: 1, label: '1 bp' },
    { value: 10, label: '10 bp' },
    { value: 50, label: '50 bp' },
    { value: 100, label: '100 bp' },
    { value: 500, label: '500 bp' },
    { value: 1_000, label: '1 kb' },
    { value: 5_000, label: '5 kb' },
    { value: 10_000, label: '10 kb' },
    { value: 50_000, label: '50 kb' },
    { value: 100_000, label: '100 kb' },
    { value: 500_000, label: '500 kb' },
    { value: 1_000_000, label: '1 Mb' },
    { value: 5_000_000, label: '5 Mb' },
    { value: 10_000_000, label: '10 Mb' },
  ]
  for (const t of targets) {
    if (t.value >= span * 0.1 && t.value <= span * 0.4) return t
  }
  return targets[targets.length - 1]
}

function hasTrackClass(elements: { element: SVGGElement }[], className: string): boolean {
  return elements.some((e) => {
    const classes = e.element.getAttribute('class') ?? ''
    return classes.includes(className)
  })
}

function hasFrameMode(elements: { element: SVGGElement }[]): boolean {
  return elements.some((e) => e.element.querySelector('.frame-0') !== null)
}

export function composeSvg(options: ComposerOptions): SVGSVGElement {
  const {
    width,
    trackElements,
    region,
    rulerHeight = 35,
    trackGap = 4,
    labelWidth = 120,
    fontFamily = 'Arial, Helvetica, sans-serif',
    fontScale = 1.0,
    showScaleBar = true,
    showLegends = true,
    highlight,
  } = options

  const ns = 'http://www.w3.org/2000/svg'
  const dataWidth = width - labelWidth
  const fs = (base: number) => (base * fontScale).toFixed(1)

  // Calculate legend height
  let legendHeight = 0
  if (showLegends) {
    const legends: string[] = []
    if (hasFrameMode(trackElements)) legends.push('frame')
    if (hasTrackClass(trackElements, 'strand-forward')) legends.push('strand')
    if (hasTrackClass(trackElements, 'variant')) legends.push('variant')
    if (legends.length > 0) legendHeight = 24
  }

  // Calculate scale bar height
  const scaleBarHeight = showScaleBar ? 20 : 0

  // Calculate total height
  let totalHeight = rulerHeight
  for (const { height } of trackElements) {
    totalHeight += height + trackGap
  }
  totalHeight += legendHeight + scaleBarHeight

  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(totalHeight))

  // Defs
  const defs = document.createElementNS(ns, 'defs')
  const style = document.createElementNS(ns, 'style')
  style.textContent = `
    text {
      font-family: ${fontFamily};
      fill: #000000;
    }
    .coverage-fill { opacity: 0.25; }
    .coverage-line { stroke-width: 1; fill: none; }
    .exon { stroke: none; }
    .intron { stroke-width: 1; }
    .utr { stroke: none; opacity: 0.6; }
    .feature { stroke: none; }
    .gene-label, .feature-label { font-size: ${fs(10)}px; }
    .axis text { font-size: ${fs(10)}px; }
    .track-name { font-size: ${fs(11)}px; font-weight: 500; }
    .legend text { font-size: ${fs(9)}px; }
    .scale-bar text { font-size: ${fs(9)}px; }
  `
  defs.appendChild(style)

  trackElements.forEach((_, i) => {
    const clipPath = document.createElementNS(ns, 'clipPath')
    clipPath.setAttribute('id', `clip-track-${i}`)
    const clipRect = document.createElementNS(ns, 'rect')
    clipRect.setAttribute('x', '0')
    clipRect.setAttribute('y', '0')
    clipRect.setAttribute('width', String(dataWidth))
    clipRect.setAttribute('height', String(trackElements[i].height))
    clipPath.appendChild(clipRect)
    defs.appendChild(clipPath)
  })

  svg.appendChild(defs)

  // Background
  const bg = document.createElementNS(ns, 'rect')
  bg.setAttribute('width', String(width))
  bg.setAttribute('height', String(totalHeight))
  bg.setAttribute('fill', 'white')
  bg.setAttribute('class', 'background')
  svg.appendChild(bg)

  // A3: Highlight region band
  if (highlight && !isNaN(highlight.start) && !isNaN(highlight.end)) {
    const hx1 = bpToPixel(highlight.start, region, dataWidth)
    const hx2 = bpToPixel(highlight.end, region, dataWidth)
    if (hx2 > 0 && hx1 < dataWidth) {
      const highlightRect = document.createElementNS(ns, 'rect')
      highlightRect.setAttribute('x', String(Math.max(0, hx1) + labelWidth))
      highlightRect.setAttribute('y', '0')
      highlightRect.setAttribute('width', String(Math.min(dataWidth, hx2) - Math.max(0, hx1)))
      highlightRect.setAttribute('height', String(totalHeight))
      // Parse 8-digit hex (#RRGGBBAA) into fill + fill-opacity for SVG compatibility
      let fillColor = highlight.color
      let fillOpacity = '1'
      if (/^#[0-9a-fA-F]{8}$/.test(highlight.color)) {
        fillColor = highlight.color.slice(0, 7)
        fillOpacity = (parseInt(highlight.color.slice(7, 9), 16) / 255).toFixed(2)
      }
      highlightRect.setAttribute('fill', fillColor)
      highlightRect.setAttribute('fill-opacity', fillOpacity)
      highlightRect.setAttribute('class', 'highlight-region')
      svg.appendChild(highlightRect)
    }
  }

  // Left sidebar separator line
  if (labelWidth > 0) {
    const sidebarLine = document.createElementNS(ns, 'line')
    sidebarLine.setAttribute('x1', String(labelWidth))
    sidebarLine.setAttribute('y1', '0')
    sidebarLine.setAttribute('x2', String(labelWidth))
    sidebarLine.setAttribute('y2', String(totalHeight))
    sidebarLine.setAttribute('stroke', '#e5e5e5')
    sidebarLine.setAttribute('stroke-width', '1')
    svg.appendChild(sidebarLine)
  }

  // Coordinate ruler
  const rulerGroup = document.createElementNS(ns, 'g')
  rulerGroup.setAttribute('id', 'ruler')
  rulerGroup.setAttribute('class', 'coordinate-axis')
  rulerGroup.setAttribute('transform', `translate(${labelWidth}, 0)`)

  const baseLine = document.createElementNS(ns, 'line')
  baseLine.setAttribute('x1', '0')
  baseLine.setAttribute('y1', String(rulerHeight - 1))
  baseLine.setAttribute('x2', String(dataWidth))
  baseLine.setAttribute('y2', String(rulerHeight - 1))
  baseLine.setAttribute('stroke', '#e5e5e5')
  baseLine.setAttribute('stroke-width', '1')
  rulerGroup.appendChild(baseLine)

  const ticks = generateTicks(region.start, region.end, Math.floor(dataWidth / 100))
  for (const tick of ticks) {
    const x = bpToPixel(tick, region, dataWidth)
    if (x < 0 || x > dataWidth) continue

    const tickLine = document.createElementNS(ns, 'line')
    tickLine.setAttribute('x1', String(x.toFixed(1)))
    tickLine.setAttribute('y1', String(rulerHeight - 1))
    tickLine.setAttribute('x2', String(x.toFixed(1)))
    tickLine.setAttribute('y2', String(rulerHeight - 9))
    tickLine.setAttribute('stroke', '#000000')
    tickLine.setAttribute('stroke-width', '1')
    rulerGroup.appendChild(tickLine)

    const label = document.createElementNS(ns, 'text')
    label.setAttribute('x', String(x.toFixed(1)))
    label.setAttribute('y', String(rulerHeight - 13))
    label.setAttribute('text-anchor', 'middle')
    label.setAttribute('font-size', fs(11))
    label.textContent = formatBp(tick)
    rulerGroup.appendChild(label)
  }

  svg.appendChild(rulerGroup)

  // Chromosome label in sidebar
  if (labelWidth > 0) {
    const chromLabel = document.createElementNS(ns, 'text')
    chromLabel.setAttribute('x', String(labelWidth - 8))
    chromLabel.setAttribute('y', '14')
    chromLabel.setAttribute('font-size', fs(11))
    chromLabel.setAttribute('font-weight', 'bold')
    chromLabel.setAttribute('text-anchor', 'end')
    chromLabel.textContent = region.chromosome
    svg.appendChild(chromLabel)
  }

  // Tracks
  const tracksGroup = document.createElementNS(ns, 'g')
  tracksGroup.setAttribute('id', 'tracks')

  let yOffset = rulerHeight
  trackElements.forEach(({ element, height, name }, i) => {
    const sepLine = document.createElementNS(ns, 'line')
    sepLine.setAttribute('x1', '0')
    sepLine.setAttribute('y1', String(yOffset))
    sepLine.setAttribute('x2', String(width))
    sepLine.setAttribute('y2', String(yOffset))
    sepLine.setAttribute('stroke', '#e5e5e5')
    sepLine.setAttribute('stroke-width', '0.5')
    tracksGroup.appendChild(sepLine)

    if (labelWidth > 0) {
      const nameText = document.createElementNS(ns, 'text')
      nameText.setAttribute('x', String(labelWidth - 8))
      nameText.setAttribute('y', String(yOffset + height / 2 + 4))
      nameText.setAttribute('text-anchor', 'end')
      nameText.setAttribute('class', 'track-name')
      nameText.textContent = name
      tracksGroup.appendChild(nameText)
    }

    const trackWrapper = document.createElementNS(ns, 'g')
    trackWrapper.setAttribute('transform', `translate(${labelWidth}, ${yOffset})`)
    trackWrapper.setAttribute('clip-path', `url(#clip-track-${i})`)
    trackWrapper.appendChild(element)
    tracksGroup.appendChild(trackWrapper)

    yOffset += height + trackGap
  })

  svg.appendChild(tracksGroup)

  // A2: Scale bar (bottom of figure)
  if (showScaleBar) {
    const span = region.end - region.start
    const bar = pickScaleBar(span)
    const barWidthPx = (bar.value / span) * dataWidth
    const barX = labelWidth + dataWidth - barWidthPx - 10
    const barY = yOffset + 6

    const scaleGroup = document.createElementNS(ns, 'g')
    scaleGroup.setAttribute('class', 'scale-bar')

    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', String(barX))
    line.setAttribute('y1', String(barY))
    line.setAttribute('x2', String(barX + barWidthPx))
    line.setAttribute('y2', String(barY))
    line.setAttribute('stroke', '#000000')
    line.setAttribute('stroke-width', '2')
    scaleGroup.appendChild(line)

    const cap1 = document.createElementNS(ns, 'line')
    cap1.setAttribute('x1', String(barX))
    cap1.setAttribute('y1', String(barY - 3))
    cap1.setAttribute('x2', String(barX))
    cap1.setAttribute('y2', String(barY + 3))
    cap1.setAttribute('stroke', '#000000')
    cap1.setAttribute('stroke-width', '1.5')
    scaleGroup.appendChild(cap1)

    const cap2 = document.createElementNS(ns, 'line')
    cap2.setAttribute('x1', String(barX + barWidthPx))
    cap2.setAttribute('y1', String(barY - 3))
    cap2.setAttribute('x2', String(barX + barWidthPx))
    cap2.setAttribute('y2', String(barY + 3))
    cap2.setAttribute('stroke', '#000000')
    cap2.setAttribute('stroke-width', '1.5')
    scaleGroup.appendChild(cap2)

    const barLabel = document.createElementNS(ns, 'text')
    barLabel.setAttribute('x', String(barX + barWidthPx / 2))
    barLabel.setAttribute('y', String(barY + 14))
    barLabel.setAttribute('text-anchor', 'middle')
    barLabel.setAttribute('font-size', fs(9))
    barLabel.textContent = bar.label
    scaleGroup.appendChild(barLabel)

    svg.appendChild(scaleGroup)
  }

  // A2: Legends
  if (showLegends && legendHeight > 0) {
    const legendGroup = document.createElementNS(ns, 'g')
    legendGroup.setAttribute('class', 'legend')
    const legendY = totalHeight - legendHeight + 4
    let legendX = labelWidth + 8

    if (hasFrameMode(trackElements)) {
      for (let f = 0; f < 3; f++) {
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('x', String(legendX))
        rect.setAttribute('y', String(legendY))
        rect.setAttribute('width', '10')
        rect.setAttribute('height', '10')
        rect.setAttribute('fill', FRAME_COLORS[f])
        rect.setAttribute('rx', '1')
        legendGroup.appendChild(rect)

        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(legendX + 14))
        text.setAttribute('y', String(legendY + 9))
        text.setAttribute('font-size', fs(9))
        text.textContent = `Frame ${f + 1}`
        legendGroup.appendChild(text)
        legendX += 62
      }
      legendX += 10
    }

    if (hasTrackClass(trackElements, 'strand-forward')) {
      for (const [label, color] of [['+ strand', STRAND_COLORS.forward], ['- strand', STRAND_COLORS.reverse]] as const) {
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('x', String(legendX))
        rect.setAttribute('y', String(legendY))
        rect.setAttribute('width', '10')
        rect.setAttribute('height', '10')
        rect.setAttribute('fill', color)
        rect.setAttribute('rx', '1')
        legendGroup.appendChild(rect)

        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(legendX + 14))
        text.setAttribute('y', String(legendY + 9))
        text.setAttribute('font-size', fs(9))
        text.textContent = label
        legendGroup.appendChild(text)
        legendX += 62
      }
      legendX += 10
    }

    if (hasTrackClass(trackElements, 'variant')) {
      for (const [type, color] of Object.entries(VARIANT_COLORS)) {
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('x', String(legendX))
        rect.setAttribute('y', String(legendY))
        rect.setAttribute('width', '10')
        rect.setAttribute('height', '10')
        rect.setAttribute('fill', color)
        rect.setAttribute('rx', '1')
        legendGroup.appendChild(rect)

        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(legendX + 14))
        text.setAttribute('y', String(legendY + 9))
        text.setAttribute('font-size', fs(9))
        text.textContent = type
        legendGroup.appendChild(text)
        legendX += 50
      }
    }

    svg.appendChild(legendGroup)
  }

  return svg
}

export function svgToString(svg: SVGSVGElement): string {
  const serializer = new XMLSerializer()
  const xmlStr = serializer.serializeToString(svg)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlStr}`
}

export function downloadSvg(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadPng(svg: SVGSVGElement, filename: string, scale = 2): void {
  const svgString = svgToString(svg)
  const img = new Image()
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)

    canvas.toBlob((blob) => {
      if (!blob) return
      const pngUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }

  img.src = url
}
