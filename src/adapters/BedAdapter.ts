import { TauriFile, isFilePath } from './TauriFile'
import type { GenomicAdapter, AdapterMetadata, GenomicRegion, GenomicFeature, AnnotationData } from './types'
import { decodeTextMaybeGzipped } from '@/utils/gzip'

export class BedAdapter implements GenomicAdapter {
  private features: GenomicFeature[] = []
  private refNames: Set<string> = new Set()
  private fileHandle: File | null = null
  private url: string | null = null
  private filePath: string | null = null

  constructor(source: File | string) {
    if (typeof source === 'string' && isFilePath(source)) {
      this.filePath = source
    } else if (typeof source === 'string') {
      this.url = source
    } else {
      this.fileHandle = source
    }
  }

  async initialize(): Promise<AdapterMetadata> {
    let text: string

    if (this.filePath) {
      const handle = new TauriFile(this.filePath)
      const bytes = await handle.readFile()
      text = await decodeTextMaybeGzipped(bytes)
    } else if (this.fileHandle) {
      const bytes = new Uint8Array(await this.fileHandle.arrayBuffer())
      text = await decodeTextMaybeGzipped(bytes)
    } else if (this.url) {
      const response = await fetch(this.url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      text = await decodeTextMaybeGzipped(bytes)
    } else {
      throw new Error('No file source')
    }

    this.features = this.parseBed(text)
    return {
      refNames: Array.from(this.refNames),
      format: 'bed',
    }
  }

  private parseBed(text: string): GenomicFeature[] {
    const features: GenomicFeature[] = []
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) continue

      const fields = line.split('\t')
      if (fields.length < 3) continue

      const chromosome = fields[0]
      const start = parseInt(fields[1], 10)
      const end = parseInt(fields[2], 10)

      if (isNaN(start) || isNaN(end)) continue

      this.refNames.add(chromosome)

      const data: AnnotationData = {
        type: 'annotation',
        name: fields[3] || undefined,
        score: fields[4] ? parseFloat(fields[4]) : undefined,
        itemRgb: fields[8] ? this.parseRgb(fields[8]) : undefined,
        thickStart: fields[6] ? parseInt(fields[6], 10) : undefined,
        thickEnd: fields[7] ? parseInt(fields[7], 10) : undefined,
      }

      // BED12: block structure
      if (fields.length >= 12) {
        data.blockCount = parseInt(fields[9], 10)
        data.blockSizes = fields[10].split(',').filter(Boolean).map(Number)
        data.blockStarts = fields[11].split(',').filter(Boolean).map(Number)
      }

      const strand = fields[5] as '+' | '-' | undefined

      features.push({
        id: `bed-${i}`,
        chromosome,
        start,
        end,
        strand: strand === '+' || strand === '-' ? strand : undefined,
        data,
      })
    }

    return features
  }

  private parseRgb(rgb: string): string | undefined {
    if (rgb === '0' || rgb === '.') return undefined
    const parts = rgb.split(',')
    if (parts.length === 3) {
      return `rgb(${parts[0]},${parts[1]},${parts[2]})`
    }
    return undefined
  }

  async getRefNames(): Promise<string[]> {
    return Array.from(this.refNames)
  }

  async getFeatures(region: GenomicRegion): Promise<GenomicFeature[]> {
    return this.features.filter(
      (f) =>
        f.chromosome === region.chromosome &&
        f.end > region.start &&
        f.start < region.end,
    )
  }

  dispose(): void {
    this.features = []
    this.fileHandle = null
    this.url = null
  }
}
