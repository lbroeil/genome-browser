/**
 * ORF frame anchoring — used by the curation flow to colour the P-site coverage
 * and translation tracks relative to the ORF under review, so a curator can see
 * at a glance whether the ribosome P-sites follow the ORF's reading frame and
 * where the (possibly non-ATG) start and stop codons sit.
 *
 * Coordinates in an overlay are expressed in the *renderer's* coordinate space:
 *   - transcript view: spliced transcript (tx) coordinates, always `strand:'forward'`
 *     (the spliced sequence is already oriented 5'→3')
 *   - genomic view: genomic coordinates, `strand` matching the ORF
 *
 * Reliable for transcript view (any exon count) and single-exon ORFs in genomic
 * view. Multi-exon ORFs in *genomic* view translate naively across introns, so
 * only the start/stop codon positions stay correct there — the periodicity
 * colouring is meaningful per-exon only. Use transcript view for spliced ORFs.
 */
export interface OrfFrameOverlay {
  /** First base of the ORF coding region, inclusive (lower coordinate). */
  codingStart: number
  /** One past the last base of the ORF coding region, exclusive (higher coordinate). */
  codingEnd: number
  /** Which strand's reading the ORF is on, in the renderer's coordinate space. */
  strand: 'forward' | 'reverse'
}

/**
 * Reading frame of a position relative to the ORF start codon.
 * 0 = in-frame with the ORF; 1 / 2 = +1 / +2 out of frame.
 */
export function orfRelativeFrame(pos: number, o: OrfFrameOverlay): 0 | 1 | 2 {
  const d = o.strand === 'reverse' ? o.codingEnd - 1 - pos : pos - o.codingStart
  return ((((d % 3) + 3) % 3) as 0 | 1 | 2)
}
