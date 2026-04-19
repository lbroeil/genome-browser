import type { GenomicRegion } from '@/adapters/types'
import { generateTicks, formatBp, bpToPixel } from '@/utils/coordinates'

export interface ComposerOptions {
  width: number
  trackElements: { element: SVGGElement; height: number; name: string }[]
  region: GenomicRegion
  rulerHeight?: number
  trackGap?: number
  labelWidth?: number
}

export function composeSvg(options: ComposerOptions): SVGSVGElement {
  const {
    width,
    trackElements,
    region,
    rulerHeight = 35,
    trackGap = 4,
    labelWidth = 120,
  } = options

  const ns = 'http://www.w3.org/2000/svg'
  const fontFamily = 'Arial, Helvetica, sans-serif'
  const dataWidth = width - labelWidth

  // Calculate total height
  let totalHeight = rulerHeight
  for (const { height } of trackElements) {
    totalHeight += height + trackGap
  }

  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(totalHeight))

  // Defs with embedded styles and clipPaths
  const defs = document.createElementNS(ns, 'defs')
  const style = document.createElementNS(ns, 'style')
  style.textContent = `
    /* genome-browser export styles — edit these to restyle the entire figure */
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
    .gene-label, .feature-label {
      font-size: 10px;
    }
    .axis text {
      font-size: 10px;
    }
    .track-name {
      font-size: 11px;
      font-weight: 500;
    }
  `
  defs.appendChild(style)

  // Add clipPath for each track
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

  // Left sidebar separator line
  const sidebarLine = document.createElementNS(ns, 'line')
  sidebarLine.setAttribute('x1', String(labelWidth))
  sidebarLine.setAttribute('y1', '0')
  sidebarLine.setAttribute('x2', String(labelWidth))
  sidebarLine.setAttribute('y2', String(totalHeight))
  sidebarLine.setAttribute('stroke', '#e5e5e5')
  sidebarLine.setAttribute('stroke-width', '1')
  svg.appendChild(sidebarLine)

  // Coordinate ruler (in the data area, offset by labelWidth)
  const rulerGroup = document.createElementNS(ns, 'g')
  rulerGroup.setAttribute('id', 'ruler')
  rulerGroup.setAttribute('class', 'coordinate-axis')
  rulerGroup.setAttribute('transform', `translate(${labelWidth}, 0)`)

  // Ruler base line
  const baseLine = document.createElementNS(ns, 'line')
  baseLine.setAttribute('x1', '0')
  baseLine.setAttribute('y1', String(rulerHeight - 1))
  baseLine.setAttribute('x2', String(dataWidth))
  baseLine.setAttribute('y2', String(rulerHeight - 1))
  baseLine.setAttribute('stroke', '#e5e5e5')
  baseLine.setAttribute('stroke-width', '1')
  rulerGroup.appendChild(baseLine)

  // Ticks
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
    label.setAttribute('font-size', '11')
    label.textContent = formatBp(tick)
    rulerGroup.appendChild(label)
  }

  svg.appendChild(rulerGroup)

  // Chromosome label in sidebar area
  const chromLabel = document.createElementNS(ns, 'text')
  chromLabel.setAttribute('x', String(labelWidth - 8))
  chromLabel.setAttribute('y', '14')
  chromLabel.setAttribute('font-size', '11')
  chromLabel.setAttribute('font-weight', 'bold')
  chromLabel.setAttribute('text-anchor', 'end')
  chromLabel.textContent = region.chromosome
  svg.appendChild(chromLabel)

  // Tracks
  const tracksGroup = document.createElementNS(ns, 'g')
  tracksGroup.setAttribute('id', 'tracks')

  let yOffset = rulerHeight
  trackElements.forEach(({ element, height, name }, i) => {
    // Track separator line
    const sepLine = document.createElementNS(ns, 'line')
    sepLine.setAttribute('x1', '0')
    sepLine.setAttribute('y1', String(yOffset))
    sepLine.setAttribute('x2', String(width))
    sepLine.setAttribute('y2', String(yOffset))
    sepLine.setAttribute('stroke', '#e5e5e5')
    sepLine.setAttribute('stroke-width', '0.5')
    tracksGroup.appendChild(sepLine)

    // Track name in left sidebar
    const nameText = document.createElementNS(ns, 'text')
    nameText.setAttribute('x', String(labelWidth - 8))
    nameText.setAttribute('y', String(yOffset + height / 2 + 4))
    nameText.setAttribute('text-anchor', 'end')
    nameText.setAttribute('class', 'track-name')
    nameText.textContent = name
    tracksGroup.appendChild(nameText)

    // Data area: clipped and offset to the right
    const trackWrapper = document.createElementNS(ns, 'g')
    trackWrapper.setAttribute('transform', `translate(${labelWidth}, ${yOffset})`)
    trackWrapper.setAttribute('clip-path', `url(#clip-track-${i})`)
    trackWrapper.appendChild(element)
    tracksGroup.appendChild(trackWrapper)

    yOffset += height + trackGap
  })

  svg.appendChild(tracksGroup)

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
