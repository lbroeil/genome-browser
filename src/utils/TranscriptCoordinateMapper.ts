import type { GenomicFeature, GenomicRegion, Transcript } from '@/adapters/types'

export interface ExonBlock {
  genomicStart: number // 0-based
  genomicEnd: number   // exclusive
  txOffset: number     // offset in transcript coordinates (cumulative exon length before this exon)
}

export class TranscriptCoordinateMapper {
  readonly chromosome: string
  readonly strand: '+' | '-'
  readonly exons: ExonBlock[] // sorted by genomicStart
  readonly txLength: number

  private constructor(chromosome: string, strand: '+' | '-', exons: ExonBlock[], txLength: number) {
    this.chromosome = chromosome
    this.strand = strand
    this.exons = exons
    this.txLength = txLength
  }

  /** Build mapper from a Transcript (GTF/GFF gene model) */
  static fromTranscript(transcript: Transcript, chromosome: string): TranscriptCoordinateMapper {
    const strand = transcript.strand
    const sortedExons = [...transcript.exons].sort((a, b) => a.start - b.start)

    const exonBlocks: ExonBlock[] = []
    let cumulative = 0
    for (const exon of sortedExons) {
      exonBlocks.push({
        genomicStart: exon.start,
        genomicEnd: exon.end,
        txOffset: cumulative,
      })
      cumulative += exon.end - exon.start
    }

    // For minus strand, reverse the transcript offsets so position 0 = 3' end in genomic terms
    if (strand === '-') {
      for (const block of exonBlocks) {
        const exonLen = block.genomicEnd - block.genomicStart
        block.txOffset = cumulative - block.txOffset - exonLen
      }
    }

    return new TranscriptCoordinateMapper(chromosome, strand, exonBlocks, cumulative)
  }

  /** Build mapper from a BED12 feature (ORF with block structure) */
  static fromBed12(feature: GenomicFeature): TranscriptCoordinateMapper {
    if (feature.data.type !== 'annotation') {
      throw new Error('fromBed12 requires an annotation feature')
    }

    const { blockStarts, blockSizes, blockCount } = feature.data
    if (!blockStarts || !blockSizes || !blockCount) {
      // Single-exon feature — treat the whole span as one block
      const exonBlocks: ExonBlock[] = [{
        genomicStart: feature.start,
        genomicEnd: feature.end,
        txOffset: 0,
      }]
      return new TranscriptCoordinateMapper(
        feature.chromosome,
        feature.strand ?? '+',
        exonBlocks,
        feature.end - feature.start,
      )
    }

    const strand = feature.strand ?? '+'
    const exonBlocks: ExonBlock[] = []
    let cumulative = 0

    for (let i = 0; i < blockCount; i++) {
      const gStart = feature.start + blockStarts[i]
      const gEnd = gStart + blockSizes[i]
      exonBlocks.push({
        genomicStart: gStart,
        genomicEnd: gEnd,
        txOffset: cumulative,
      })
      cumulative += blockSizes[i]
    }

    // For minus strand, reverse transcript offsets
    if (strand === '-') {
      for (const block of exonBlocks) {
        const exonLen = block.genomicEnd - block.genomicStart
        block.txOffset = cumulative - block.txOffset - exonLen
      }
    }

    return new TranscriptCoordinateMapper(feature.chromosome, strand, exonBlocks, cumulative)
  }

  /** Map a genomic position to transcript coordinate. Returns null if position is in an intron. */
  genomicToTranscript(genomicPos: number): number | null {
    for (const exon of this.exons) {
      if (genomicPos >= exon.genomicStart && genomicPos < exon.genomicEnd) {
        if (this.strand === '-') {
          // For minus strand, higher genomic = lower transcript position within an exon
          const distFromExonEnd = exon.genomicEnd - 1 - genomicPos
          return exon.txOffset + distFromExonEnd
        }
        return exon.txOffset + (genomicPos - exon.genomicStart)
      }
    }
    return null // intronic
  }

  /** Map a transcript coordinate back to genomic position */
  transcriptToGenomic(txPos: number): number {
    if (txPos < 0 || txPos >= this.txLength) {
      throw new Error(`Transcript position ${txPos} out of range [0, ${this.txLength})`)
    }

    for (const exon of this.exons) {
      const exonLen = exon.genomicEnd - exon.genomicStart
      if (txPos >= exon.txOffset && txPos < exon.txOffset + exonLen) {
        const offsetInExon = txPos - exon.txOffset
        if (this.strand === '-') {
          return exon.genomicEnd - 1 - offsetInExon
        }
        return exon.genomicStart + offsetInExon
      }
    }

    throw new Error(`Could not map transcript position ${txPos} to genomic coordinate`)
  }

  /** Get the reading frame (0, 1, or 2) for a genomic position. Null if intronic. */
  getFrame(genomicPos: number): 0 | 1 | 2 | null {
    const txPos = this.genomicToTranscript(genomicPos)
    if (txPos === null) return null
    return (txPos % 3) as 0 | 1 | 2
  }

  /** Get exon junction positions in transcript coordinates (positions where one exon ends and next begins) */
  getJunctionPositions(): number[] {
    const junctions: number[] = []
    // Sort exons by txOffset to get them in transcript order
    const sorted = [...this.exons].sort((a, b) => a.txOffset - b.txOffset)
    for (let i = 0; i < sorted.length - 1; i++) {
      const exonLen = sorted[i].genomicEnd - sorted[i].genomicStart
      junctions.push(sorted[i].txOffset + exonLen)
    }
    return junctions
  }

  /**
   * Given a transcript coordinate range, return the corresponding genomic regions.
   * A single transcript range may span multiple exons, producing multiple genomic regions.
   */
  getGenomicRegionsForTranscriptRange(txStart: number, txEnd: number): GenomicRegion[] {
    const regions: GenomicRegion[] = []
    const clampedStart = Math.max(0, txStart)
    const clampedEnd = Math.min(this.txLength, txEnd)

    // Sort exons by txOffset for transcript-order iteration
    const sorted = [...this.exons].sort((a, b) => a.txOffset - b.txOffset)

    for (const exon of sorted) {
      const exonLen = exon.genomicEnd - exon.genomicStart
      const exonTxStart = exon.txOffset
      const exonTxEnd = exon.txOffset + exonLen

      // Check overlap with requested transcript range
      const overlapStart = Math.max(clampedStart, exonTxStart)
      const overlapEnd = Math.min(clampedEnd, exonTxEnd)
      if (overlapStart >= overlapEnd) continue

      const offsetInExonStart = overlapStart - exonTxStart
      const offsetInExonEnd = overlapEnd - exonTxStart

      let gStart: number
      let gEnd: number
      if (this.strand === '-') {
        gStart = exon.genomicEnd - offsetInExonEnd
        gEnd = exon.genomicEnd - offsetInExonStart
      } else {
        gStart = exon.genomicStart + offsetInExonStart
        gEnd = exon.genomicStart + offsetInExonEnd
      }

      regions.push({
        chromosome: this.chromosome,
        start: Math.min(gStart, gEnd),
        end: Math.max(gStart, gEnd),
      })
    }

    // Sort by genomic position for consistent adapter queries
    return regions.sort((a, b) => a.start - b.start)
  }
}
