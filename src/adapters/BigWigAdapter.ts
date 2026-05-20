import { BigWig } from '@gmod/bbi'
import { RemoteFile, BlobFile } from 'generic-filehandle2'
import { TauriFile, isFilePath } from './TauriFile'
import type { GenomicAdapter, AdapterMetadata, GenomicRegion, GenomicFeature, CoverageBin } from './types'

export class BigWigAdapter implements GenomicAdapter {
  private bigwig: InstanceType<typeof BigWig> | null = null
  private refNames: string[] = []

  constructor(private source: File | string) {}

  async initialize(): Promise<AdapterMetadata> {
    if (typeof this.source === 'string' && isFilePath(this.source)) {
      this.bigwig = new BigWig({ filehandle: new TauriFile(this.source) })
    } else if (typeof this.source === 'string') {
      this.bigwig = new BigWig({ filehandle: new RemoteFile(this.source) })
    } else {
      this.bigwig = new BigWig({ filehandle: new BlobFile(this.source) })
    }

    const header = await this.bigwig.getHeader()
    this.refNames = Object.keys(header.refsByName)

    return {
      refNames: this.refNames,
      format: 'bigwig',
    }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(_region: GenomicRegion): Promise<GenomicFeature[]> {
    return []
  }

  async getCoverage(region: GenomicRegion, bins: number): Promise<CoverageBin[]> {
    if (!this.bigwig) throw new Error('Not initialized')

    const bpPerBin = (region.end - region.start) / bins

    const features = await this.bigwig.getFeatures(
      region.chromosome,
      region.start,
      region.end,
      { scale: 1 / bpPerBin },
    )

    if (features.length === 0) return []

    // If the features are already binned at a good resolution, use them directly
    if (features.length <= bins * 2) {
      return features.map((f) => ({
        start: f.start,
        end: f.end,
        value: f.score ?? 0,
      }))
    }

    // Re-bin to requested resolution
    const binSize = (region.end - region.start) / bins
    const result: CoverageBin[] = []

    for (let i = 0; i < bins; i++) {
      const binStart = region.start + i * binSize
      const binEnd = binStart + binSize

      let sum = 0
      let count = 0
      for (const f of features) {
        if (f.end <= binStart || f.start >= binEnd) continue
        const overlapStart = Math.max(f.start, binStart)
        const overlapEnd = Math.min(f.end, binEnd)
        const overlapFraction = (overlapEnd - overlapStart) / (f.end - f.start)
        sum += (f.score ?? 0) * overlapFraction
        count++
      }

      result.push({
        start: Math.round(binStart),
        end: Math.round(binEnd),
        value: count > 0 ? sum : 0,
      })
    }

    return result
  }

  dispose(): void {
    this.bigwig = null
  }
}
