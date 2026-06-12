import type {
  GenomicAdapter, AdapterMetadata, GenomicRegion, GenomicFeature, AnnotationData,
} from '@/adapters/types'
import type { CuratedOrf } from './api'

function parseInts(s: string | null | undefined): number[] | undefined {
  if (!s) return undefined
  const parts = s.split(',').map((x) => x.trim()).filter((x) => x.length > 0)
  if (parts.length === 0) return undefined
  return parts.map((x) => parseInt(x, 10))
}

/** Convert a curated ORF (DB row) into a genome-browser annotation feature (BED12 semantics). */
export function orfToFeature(orf: CuratedOrf): GenomicFeature {
  const blockSizes = parseInts(orf.block_sizes)
  const blockStarts = parseInts(orf.block_starts)
  const data: AnnotationData = {
    type: 'annotation',
    name: orf.name,
    thickStart: orf.thick_start ?? undefined,
    thickEnd: orf.thick_stop ?? undefined,
    blockSizes,
    blockStarts,
    blockCount:
      blockSizes && blockStarts ? Math.min(blockSizes.length, blockStarts.length) : undefined,
  }
  return {
    id: `orf-${orf.id}`,
    chromosome: orf.chromosome ?? '',
    start: orf.start ?? 0,
    end: orf.stop ?? 0,
    strand: orf.strand === '+' || orf.strand === '-' ? orf.strand : undefined,
    data,
  }
}

/**
 * In-memory GenomicAdapter over a project's ORF list, so the ORFs under review
 * render as an annotation track (with frame coloring + click-to-transcript-view)
 * without needing a separate BED file.
 */
export class OrfListAdapter implements GenomicAdapter {
  private features: GenomicFeature[]
  private refNames: string[]

  constructor(orfs: CuratedOrf[]) {
    this.features = orfs
      .filter((o) => o.chromosome && o.start != null && o.stop != null)
      .map(orfToFeature)
    this.refNames = Array.from(new Set(this.features.map((f) => f.chromosome)))
  }

  async initialize(): Promise<AdapterMetadata> {
    return { refNames: this.refNames, format: 'orf-list' }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(region: GenomicRegion): Promise<GenomicFeature[]> {
    return this.features.filter(
      (f) =>
        f.chromosome === region.chromosome && f.end > region.start && f.start < region.end,
    )
  }

  dispose(): void {}
}
