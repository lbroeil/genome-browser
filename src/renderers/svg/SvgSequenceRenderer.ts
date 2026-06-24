import type { GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { NUCLEOTIDE_COLORS } from '@/utils/colors'
import { CODON_TABLE, reverseComplement } from '@/utils/translation'
import type { TranslationStrand } from '@/renderers/canvas/CanvasSequenceRenderer'
import type { OrfFrameOverlay } from '@/utils/orfFrame'

const FRAME_ROW_HEIGHT = 16
const SEQUENCE_ROW_HEIGHT = 18
const FRAME_GAP = 1

const MAX_BP_SEQUENCE = 200
const MAX_BP_TRANSLATION = 600

export function renderSequenceSvg(
  sequence: string,
  region: GenomicRegion,
  width: number,
  height: number,
  trackName: string,
  strand: TranslationStrand = 'forward',
  overlay?: OrfFrameOverlay,
): SVGGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('id', `track-${trackName.replace(/[^a-zA-Z0-9]/g, '-')}`)
  g.setAttribute('class', 'track sequence')

  const viewportBp = region.end - region.start

  if (viewportBp > MAX_BP_TRANSLATION || sequence.length === 0) {
    const text = document.createElementNS(ns, 'text')
    text.setAttribute('x', String(width / 2))
    text.setAttribute('y', String(height / 2 + 4))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('font-size', '11')
    text.textContent = 'Zoom in to see sequence'
    g.appendChild(text)
    return g
  }

  const bpWidth = width / viewportBp
  const showLetters = viewportBp <= MAX_BP_SEQUENCE
  const showForward = strand === 'forward' || strand === 'both'
  const showReverse = strand === 'reverse' || strand === 'both'
  let yOffset = 2

  // --- Nucleotide sequence ---
  // When only reverse strand is selected, show reverse complement bases
  const displaySeq = strand === 'reverse' ? reverseComplement(sequence) : sequence
  if (showLetters) {
    const seqGroup = document.createElementNS(ns, 'g')
    seqGroup.setAttribute('class', 'nucleotides')

    for (let i = 0; i < displaySeq.length; i++) {
      const genomicPos = region.start + i
      const x = bpToPixel(genomicPos, region, width)
      const base = strand === 'reverse' ? displaySeq[displaySeq.length - 1 - i] : displaySeq[i]
      const color = NUCLEOTIDE_COLORS[base] ?? NUCLEOTIDE_COLORS.N

      const rect = document.createElementNS(ns, 'rect')
      rect.setAttribute('x', x.toFixed(1))
      rect.setAttribute('y', String(yOffset))
      rect.setAttribute('width', bpWidth.toFixed(1))
      rect.setAttribute('height', String(SEQUENCE_ROW_HEIGHT))
      rect.setAttribute('fill', color)
      rect.setAttribute('fill-opacity', '0.15')
      seqGroup.appendChild(rect)

      if (bpWidth > 6) {
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', (x + bpWidth / 2).toFixed(1))
        text.setAttribute('y', String(yOffset + SEQUENCE_ROW_HEIGHT - 4))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', String(Math.min(14, bpWidth * 0.8)))
        text.setAttribute('font-family', 'monospace')
        text.setAttribute('font-weight', 'bold')
        text.setAttribute('fill', color)
        text.textContent = base
        seqGroup.appendChild(text)
      }
    }

    g.appendChild(seqGroup)
    yOffset += SEQUENCE_ROW_HEIGHT + 2
  }

  const orfRowFwd = overlay && overlay.strand === 'forward'
    ? ((((overlay.codingStart - region.start) % 3) + 3) % 3) : -1
  const orfRowRev = overlay && overlay.strand === 'reverse'
    ? ((((region.end - overlay.codingEnd) % 3) + 3) % 3) : -1

  // --- Forward strand frames ---
  if (showForward) {
    const fwdGroup = document.createElementNS(ns, 'g')
    fwdGroup.setAttribute('class', 'translation strand-forward')

    for (let frame = 0; frame < 3; frame++) {
      const frameGroup = createFrameGroup(ns, sequence, region, width, yOffset, frame, false, showLetters,
        overlay, frame === orfRowFwd)
      frameGroup.setAttribute('class', `frame frame-${frame}`)
      fwdGroup.appendChild(frameGroup)
      yOffset += FRAME_ROW_HEIGHT + FRAME_GAP
    }
    g.appendChild(fwdGroup)
    if (showReverse) yOffset += 2
  }

  // --- Reverse strand frames ---
  if (showReverse) {
    const revGroup = document.createElementNS(ns, 'g')
    revGroup.setAttribute('class', 'translation strand-reverse')

    const rcSeq = reverseComplement(sequence)
    for (let frame = 0; frame < 3; frame++) {
      const frameGroup = createFrameGroup(ns, rcSeq, region, width, yOffset, frame, true, showLetters,
        overlay, frame === orfRowRev)
      frameGroup.setAttribute('class', `frame frame-${frame}`)
      revGroup.appendChild(frameGroup)
      yOffset += FRAME_ROW_HEIGHT + FRAME_GAP
    }
    g.appendChild(revGroup)
  }

  return g
}

function createFrameGroup(
  ns: string,
  sequence: string,
  region: GenomicRegion,
  width: number,
  yOffset: number,
  frame: number,
  isReverse: boolean,
  showLetters: boolean,
  overlay?: OrfFrameOverlay,
  isOrfRow = false,
): SVGGElement {
  const g = document.createElementNS(ns, 'g')
  const viewportBp = region.end - region.start
  const bpWidth = width / viewportBp
  const seqLen = sequence.length
  const dim = !!overlay && !isOrfRow

  for (let i = frame; i + 2 < seqLen; i += 3) {
    const codon = sequence[i] + sequence[i + 1] + sequence[i + 2]
    const aa = CODON_TABLE[codon] ?? '?'

    const codonWidth = bpWidth * 3
    const codonGStart = isReverse ? region.end - i - 3 : region.start + i
    const x = bpToPixel(codonGStart, region, width)

    let bgColor: string
    let opacity: number
    let textColor: string
    if (aa === 'M') {
      bgColor = '#22c55e'
      opacity = 0.85
      textColor = '#ffffff'
    } else if (aa === '*') {
      bgColor = '#ef4444'
      opacity = 0.85
      textColor = '#ffffff'
    } else {
      bgColor = '#e5e7eb'
      opacity = 0.4
      textColor = '#374151'
    }
    if (dim) opacity *= 0.35

    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('x', x.toFixed(1))
    rect.setAttribute('y', String(yOffset))
    rect.setAttribute('width', (codonWidth - 0.5).toFixed(1))
    rect.setAttribute('height', String(FRAME_ROW_HEIGHT))
    rect.setAttribute('fill', bgColor)
    rect.setAttribute('fill-opacity', opacity.toFixed(2))
    if (aa === 'M') rect.setAttribute('class', 'start-codon')
    else if (aa === '*') rect.setAttribute('class', 'stop-codon')
    g.appendChild(rect)

    // ORF-anchored decorations: shade the coding span, box start + stop codons.
    let isStart = false
    let isStop = false
    if (overlay && isOrfRow) {
      const inCds = codonGStart >= overlay.codingStart && codonGStart < overlay.codingEnd
      isStart = isReverse ? codonGStart === overlay.codingEnd - 3 : codonGStart === overlay.codingStart
      isStop = isReverse ? codonGStart === overlay.codingStart : codonGStart === overlay.codingEnd - 3
      if (inCds) {
        const tint = document.createElementNS(ns, 'rect')
        tint.setAttribute('x', x.toFixed(1))
        tint.setAttribute('y', String(yOffset))
        tint.setAttribute('width', (codonWidth - 0.5).toFixed(1))
        tint.setAttribute('height', String(FRAME_ROW_HEIGHT))
        tint.setAttribute('fill', '#16a34a')
        tint.setAttribute('fill-opacity', '0.15')
        g.appendChild(tint)
      }
    }

    if (showLetters && codonWidth > 8) {
      const text = document.createElementNS(ns, 'text')
      text.setAttribute('x', (x + codonWidth / 2).toFixed(1))
      text.setAttribute('y', String(yOffset + FRAME_ROW_HEIGHT - 3))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('font-size', String(Math.min(12, codonWidth * 0.6)))
      text.setAttribute('font-family', 'monospace')
      text.setAttribute('fill', dim ? '#9ca3af' : textColor)
      text.textContent = aa
      g.appendChild(text)
    }

    if (isStart || isStop) {
      const box = document.createElementNS(ns, 'rect')
      box.setAttribute('x', (x + 1).toFixed(1))
      box.setAttribute('y', String(yOffset + 1))
      box.setAttribute('width', (codonWidth - 2.5).toFixed(1))
      box.setAttribute('height', String(FRAME_ROW_HEIGHT - 2))
      box.setAttribute('fill', 'none')
      box.setAttribute('stroke', isStart ? '#16a34a' : '#ef4444')
      box.setAttribute('stroke-width', '2')
      box.setAttribute('class', isStart ? 'orf-start' : 'orf-stop')
      g.appendChild(box)
    }
  }

  return g
}
