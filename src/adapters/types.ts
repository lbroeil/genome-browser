export interface GenomicRegion {
  chromosome: string
  start: number // 0-based
  end: number // exclusive
}

export interface CoverageBin {
  start: number
  end: number
  value: number
  frame?: 0 | 1 | 2
}

export interface AlignmentData {
  type: 'alignment'
  readName: string
  cigar: string
  mappingQuality: number
  flags: number
  sequence: string
  mismatches: Mismatch[]
  insertions: Insertion[]
  deletions: Deletion[]
  softClipStart: number
  softClipEnd: number
  isReversed: boolean
  isPaired: boolean
  isProperPair: boolean
  mateChromosome?: string
  mateStart?: number
  insertSize?: number
}

export interface Mismatch {
  position: number // genomic position
  base: string
  quality: number
}

export interface Insertion {
  position: number
  sequence: string
}

export interface Deletion {
  position: number
  length: number
}

export interface AnnotationData {
  type: 'annotation'
  name?: string
  score?: number
  itemRgb?: string
  thickStart?: number
  thickEnd?: number
  blockCount?: number
  blockSizes?: number[]
  blockStarts?: number[]
}

export interface GeneModelData {
  type: 'gene_model'
  geneId: string
  geneName?: string
  biotype?: string
  transcripts: Transcript[]
}

export interface Transcript {
  id: string
  start: number
  end: number
  strand: '+' | '-'
  exons: Exon[]
  cds?: { start: number; end: number }[]
  utr5?: { start: number; end: number }[]
  utr3?: { start: number; end: number }[]
}

export interface Exon {
  start: number
  end: number
}

export interface VariantData {
  type: 'variant'
  id?: string
  ref: string
  alt: string[]
  qual?: number
  filter?: string
  info?: Record<string, unknown>
  variantType: 'SNV' | 'INS' | 'DEL' | 'MNV' | 'OTHER'
}

export type FeatureData = AlignmentData | AnnotationData | GeneModelData | VariantData

export interface GenomicFeature {
  id: string
  chromosome: string
  start: number
  end: number
  strand?: '+' | '-'
  data: FeatureData
}

export interface AdapterMetadata {
  refNames: string[]
  format: string
}

export interface GenomicAdapter {
  initialize(): Promise<AdapterMetadata>
  getRefNames(): Promise<string[]>
  getFeatures(region: GenomicRegion): Promise<GenomicFeature[]>
  getCoverage?(region: GenomicRegion, bins: number): Promise<CoverageBin[]>
  getSequence?(region: GenomicRegion): Promise<string>
  dispose(): void
}
