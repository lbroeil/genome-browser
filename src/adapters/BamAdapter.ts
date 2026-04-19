import { BamFile } from '@gmod/bam'
import { RemoteFile, BlobFile } from 'generic-filehandle2'
import type {
  GenomicAdapter,
  AdapterMetadata,
  GenomicRegion,
  GenomicFeature,
  CoverageBin,
  AlignmentData,
  Mismatch,
} from './types'
import { downsample } from '@/utils/downsampling'
import { computeCoverage } from '@/utils/pileup'

const MAX_READS = 500

function parseCigarMismatches(
  record: { seq: string; CIGAR: string; start: number; qual: Uint8Array | null },
  refSequence?: string,
): { mismatches: Mismatch[]; softClipStart: number; softClipEnd: number } {
  const mismatches: Mismatch[] = []
  let softClipStart = 0
  let softClipEnd = 0

  const cigarOps = record.CIGAR.match(/(\d+)([MIDNSHP=X])/g)
  if (!cigarOps) return { mismatches, softClipStart, softClipEnd }

  let refPos = record.start
  let seqPos = 0
  let isFirstOp = true

  for (const op of cigarOps) {
    const len = parseInt(op)
    const type = op[op.length - 1]

    switch (type) {
      case 'M':
      case '=':
      case 'X':
        // For X (mismatch) we know it's a mismatch
        if (type === 'X') {
          for (let i = 0; i < len; i++) {
            mismatches.push({
              position: refPos + i,
              base: record.seq[seqPos + i] ?? 'N',
              quality: record.qual ? record.qual[seqPos + i] : 30,
            })
          }
        }
        refPos += len
        seqPos += len
        break
      case 'I':
        seqPos += len
        break
      case 'D':
      case 'N':
        refPos += len
        break
      case 'S':
        if (isFirstOp) {
          softClipStart = len
        } else {
          softClipEnd = len
        }
        seqPos += len
        break
      case 'H':
        break
    }
    isFirstOp = false
  }

  return { mismatches, softClipStart, softClipEnd }
}

export class BamAdapter implements GenomicAdapter {
  private bam: InstanceType<typeof BamFile> | null = null
  private refNames: string[] = []
  private source: { file: File; index: File } | { bamUrl: string; baiUrl: string }

  constructor(source: { file: File; index: File } | { bamUrl: string; baiUrl: string }) {
    this.source = source
  }

  async initialize(): Promise<AdapterMetadata> {
    if ('file' in this.source) {
      this.bam = new BamFile({
        bamFilehandle: new BlobFile(this.source.file),
        baiFilehandle: new BlobFile(this.source.index),
      })
    } else {
      this.bam = new BamFile({
        bamFilehandle: new RemoteFile(this.source.bamUrl),
        baiFilehandle: new RemoteFile(this.source.baiUrl),
      })
    }

    await this.bam.getHeader()
    this.refNames = (this.bam.indexToChr ?? []).map((c) => c.refName)

    return {
      refNames: this.refNames,
      format: 'bam',
    }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(region: GenomicRegion): Promise<GenomicFeature[]> {
    if (!this.bam) throw new Error('Not initialized')

    const records = await this.bam.getRecordsForRange(
      region.chromosome,
      region.start,
      region.end,
    )

    // Downsample if too many reads
    const sampled = downsample(records, MAX_READS)

    return sampled.map((record) => {
      const { mismatches, softClipStart, softClipEnd } = parseCigarMismatches(record)

      const data: AlignmentData = {
        type: 'alignment',
        readName: record.name,
        cigar: record.CIGAR,
        mappingQuality: record.mq ?? 0,
        flags: record.flags,
        sequence: record.seq,
        mismatches,
        insertions: [],
        deletions: [],
        softClipStart,
        softClipEnd,
        isReversed: record.isReverseComplemented(),
        isPaired: record.isPaired(),
        isProperPair: record.isProperlyPaired(),
        mateChromosome: record.next_refid >= 0
          ? this.refNames[record.next_refid]
          : undefined,
        mateStart: record.next_pos >= 0 ? record.next_pos : undefined,
        insertSize: record.template_length,
      }

      return {
        id: `bam-${record.fileOffset}`,
        chromosome: region.chromosome,
        start: record.start,
        end: record.end,
        strand: record.isReverseComplemented() ? '-' as const : '+' as const,
        data,
      }
    })
  }

  async getCoverage(region: GenomicRegion, bins: number): Promise<CoverageBin[]> {
    if (!this.bam) throw new Error('Not initialized')

    const records = await this.bam.getRecordsForRange(
      region.chromosome,
      region.start,
      region.end,
    )

    const coverageArray = computeCoverage(
      records,
      (r) => r.start,
      (r) => r.end,
      region.start,
      region.end,
      bins,
    )

    const binSize = (region.end - region.start) / bins
    return coverageArray.map((value, i) => ({
      start: Math.round(region.start + i * binSize),
      end: Math.round(region.start + (i + 1) * binSize),
      value,
    }))
  }

  dispose(): void {
    this.bam = null
  }
}
