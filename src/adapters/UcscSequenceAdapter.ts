import type { GenomicAdapter, AdapterMetadata, GenomicRegion, GenomicFeature } from './types'
import { HG38_CHROMOSOMES } from '@/utils/coordinates'

const UCSC_API = 'https://api.genome.ucsc.edu/getData/sequence'

/**
 * Built-in adapter that fetches hg38 reference sequence from the UCSC REST API.
 * Only fetches when actually called (i.e., when zoomed in enough for the sequence
 * track to display), so requests are always small (<600bp).
 */
export class UcscSequenceAdapter implements GenomicAdapter {
  private refNames: string[] = Object.keys(HG38_CHROMOSOMES)
  private cache: { key: string; sequence: string } | null = null

  async initialize(): Promise<AdapterMetadata> {
    return {
      refNames: this.refNames,
      format: 'ucsc-api',
    }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(_region: GenomicRegion): Promise<GenomicFeature[]> {
    return []
  }

  async getSequence(region: GenomicRegion): Promise<string> {
    // Only fetch reasonable region sizes (the renderer caps at 600bp anyway)
    const length = region.end - region.start
    if (length > 10000) return ''

    // Simple cache: if the requested region is within the cached region, return substring
    if (this.cache) {
      const [cachedChr, cachedStart, cachedEnd] = this.cache.key.split(':').flatMap(s => s.split('-'))
      if (
        cachedChr === region.chromosome &&
        region.start >= parseInt(cachedStart) &&
        region.end <= parseInt(cachedEnd)
      ) {
        const offset = region.start - parseInt(cachedStart)
        return this.cache.sequence.slice(offset, offset + length)
      }
    }

    // Fetch with some padding so small pans don't trigger new requests
    const padding = Math.max(200, Math.round(length * 0.5))
    const fetchStart = Math.max(0, region.start - padding)
    const fetchEnd = region.end + padding

    const url = `${UCSC_API}?genome=hg38&chrom=${region.chromosome}&start=${fetchStart}&end=${fetchEnd}`

    const response = await fetch(url)
    if (!response.ok) return ''

    const data = await response.json()
    const sequence = (data.dna as string).toUpperCase()

    // Cache the fetched region
    this.cache = {
      key: `${region.chromosome}:${fetchStart}-${fetchEnd}`,
      sequence,
    }

    const offset = region.start - fetchStart
    return sequence.slice(offset, offset + length)
  }

  dispose(): void {
    this.cache = null
  }
}
