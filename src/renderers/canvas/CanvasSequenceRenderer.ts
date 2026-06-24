import type { GenomicRegion } from '@/adapters/types'
import { bpToPixel } from '@/utils/coordinates'
import { NUCLEOTIDE_COLORS } from '@/utils/colors'
import { CODON_TABLE, reverseComplement } from '@/utils/translation'
import type { OrfFrameOverlay } from '@/utils/orfFrame'

const FRAME_ROW_HEIGHT = 16
const SEQUENCE_ROW_HEIGHT = 18
const FRAME_GAP = 1

/** Max viewport size (bp) at which nucleotide letters are drawn */
const MAX_BP_SEQUENCE = 200
/** Max viewport size (bp) at which translation frames are drawn */
const MAX_BP_TRANSLATION = 600

export type TranslationStrand = 'forward' | 'reverse' | 'both'

/** Which forward-block frame row holds the ORF (or -1). The ORF lives in the row
 *  whose codon boundaries align with the ORF start codon. */
function orfForwardRow(region: GenomicRegion, o: OrfFrameOverlay): number {
  return ((((o.codingStart - region.start) % 3) + 3) % 3)
}
/** Which reverse-block frame row holds the ORF (or -1). */
function orfReverseRow(region: GenomicRegion, o: OrfFrameOverlay): number {
  return ((((region.end - o.codingEnd) % 3) + 3) % 3)
}

export function renderSequenceCanvas(
  ctx: CanvasRenderingContext2D,
  sequence: string,
  region: GenomicRegion,
  width: number,
  height: number,
  strand: TranslationStrand = 'forward',
  overlay?: OrfFrameOverlay,
) {
  const viewportBp = region.end - region.start
  if (viewportBp > MAX_BP_TRANSLATION || sequence.length === 0) {
    ctx.fillStyle = '#737373'
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Zoom in to see sequence', width / 2, height / 2 + 4)
    return
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
    for (let i = 0; i < displaySeq.length; i++) {
      const genomicPos = region.start + i
      const x = bpToPixel(genomicPos, region, width)
      const base = strand === 'reverse' ? displaySeq[displaySeq.length - 1 - i] : displaySeq[i]
      const color = NUCLEOTIDE_COLORS[base] ?? NUCLEOTIDE_COLORS.N

      ctx.fillStyle = color
      ctx.globalAlpha = 0.15
      ctx.fillRect(x, yOffset, bpWidth, SEQUENCE_ROW_HEIGHT)
      ctx.globalAlpha = 1.0

      ctx.fillStyle = color
      ctx.font = `bold ${Math.min(14, bpWidth * 0.8)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(base, x + bpWidth / 2, yOffset + SEQUENCE_ROW_HEIGHT - 4)
    }
    yOffset += SEQUENCE_ROW_HEIGHT + 2
  }

  const orfRowFwd = overlay && overlay.strand === 'forward' ? orfForwardRow(region, overlay) : -1
  const orfRowRev = overlay && overlay.strand === 'reverse' ? orfReverseRow(region, overlay) : -1

  // --- Forward strand frames (0, 1, 2) ---
  if (showForward) {
    drawFrameLabel(ctx, '+', yOffset)
    for (let frame = 0; frame < 3; frame++) {
      drawTranslationFrame(ctx, sequence, region, width, yOffset, frame, false, showLetters,
        overlay, frame === orfRowFwd)
      yOffset += FRAME_ROW_HEIGHT + FRAME_GAP
    }
    if (showReverse) yOffset += 2
  }

  // --- Reverse strand frames (0, 1, 2) ---
  if (showReverse) {
    const rcSeq = reverseComplement(sequence)
    drawFrameLabel(ctx, '\u2212', yOffset)
    for (let frame = 0; frame < 3; frame++) {
      drawTranslationFrame(ctx, rcSeq, region, width, yOffset, frame, true, showLetters,
        overlay, frame === orfRowRev)
      yOffset += FRAME_ROW_HEIGHT + FRAME_GAP
    }
  }
}

function drawFrameLabel(ctx: CanvasRenderingContext2D, strandChar: string, yOffset: number) {
  ctx.fillStyle = '#737373'
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(strandChar, 2, yOffset + 10)
}

function drawTranslationFrame(
  ctx: CanvasRenderingContext2D,
  sequence: string,
  region: GenomicRegion,
  width: number,
  yOffset: number,
  frame: number,
  isReverse: boolean,
  showLetters: boolean,
  overlay?: OrfFrameOverlay,
  isOrfRow = false,
) {
  const viewportBp = region.end - region.start
  const bpWidth = width / viewportBp
  const seqLen = sequence.length
  // With an ORF overlay, dim the frame rows that aren't the ORF's so the eye
  // goes straight to the ORF's reading frame.
  const dim = !!overlay && !isOrfRow

  ctx.fillStyle = isOrfRow ? '#16a34a' : '#a3a3a3'
  ctx.font = '8px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(isOrfRow ? `F${frame + 1} ORF` : `F${frame + 1}`, 12, yOffset + 11)

  for (let i = frame; i + 2 < seqLen; i += 3) {
    const codon = sequence[i] + sequence[i + 1] + sequence[i + 2]
    const aa = CODON_TABLE[codon] ?? '?'

    const codonWidth = bpWidth * 3
    // genomicStart = the lower coordinate of this codon (in render-coordinate space)
    const codonGStart = isReverse ? region.end - i - 3 : region.start + i
    const x = bpToPixel(codonGStart, region, width)

    let bgColor: string
    let textColor: string
    if (aa === 'M') {
      bgColor = '#22c55e'
      textColor = '#ffffff'
    } else if (aa === '*') {
      bgColor = '#ef4444'
      textColor = '#ffffff'
    } else {
      bgColor = '#e5e7eb'
      textColor = '#374151'
    }

    const baseAlpha = aa === 'M' || aa === '*' ? 0.85 : 0.4
    ctx.fillStyle = bgColor
    ctx.globalAlpha = dim ? baseAlpha * 0.35 : baseAlpha
    ctx.fillRect(x, yOffset, codonWidth - 0.5, FRAME_ROW_HEIGHT)
    ctx.globalAlpha = 1.0

    // ORF-anchored decorations: shade the coding span, box the start + stop codons.
    let isStart = false
    let isStop = false
    if (overlay && isOrfRow) {
      const inCds = codonGStart >= overlay.codingStart && codonGStart < overlay.codingEnd
      isStart = isReverse ? codonGStart === overlay.codingEnd - 3 : codonGStart === overlay.codingStart
      isStop = isReverse ? codonGStart === overlay.codingStart : codonGStart === overlay.codingEnd - 3
      if (inCds) {
        ctx.fillStyle = '#16a34a'
        ctx.globalAlpha = 0.15
        ctx.fillRect(x, yOffset, codonWidth - 0.5, FRAME_ROW_HEIGHT)
        ctx.globalAlpha = 1.0
      }
    }

    if (showLetters && codonWidth > 8) {
      ctx.fillStyle = dim ? '#9ca3af' : textColor
      ctx.font = `${Math.min(12, codonWidth * 0.6)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(aa, x + codonWidth / 2, yOffset + FRAME_ROW_HEIGHT - 3)
    }

    if (isStart || isStop) {
      ctx.strokeStyle = isStart ? '#16a34a' : '#ef4444'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, yOffset + 1, codonWidth - 2.5, FRAME_ROW_HEIGHT - 2)
    }
  }
}

/**
 * Calculate the minimum height needed for the sequence track at the current zoom level.
 */
export function getSequenceTrackHeight(viewportBp: number, strand: TranslationStrand = 'forward'): number {
  if (viewportBp > MAX_BP_TRANSLATION) return 30
  const showForward = strand === 'forward' || strand === 'both'
  const showReverse = strand === 'reverse' || strand === 'both'

  let h = 4
  if (viewportBp <= MAX_BP_SEQUENCE) h += SEQUENCE_ROW_HEIGHT + 2
  if (showForward) h += 3 * (FRAME_ROW_HEIGHT + FRAME_GAP)
  if (showForward && showReverse) h += 2
  if (showReverse) h += 3 * (FRAME_ROW_HEIGHT + FRAME_GAP)
  return h + 4
}
