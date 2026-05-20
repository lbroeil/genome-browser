import { RemoteFile, BlobFile } from 'generic-filehandle2'
import { TauriFile } from './TauriFile'
import type { GenomicAdapter, AdapterMetadata, GenomicRegion, GenomicFeature } from './types'

interface FaiEntry {
  name: string
  length: number
  offset: number    // byte offset of the first base in the file
  lineBases: number // number of bases per line
  lineWidth: number // number of bytes per line (includes newline)
}

export class FastaAdapter implements GenomicAdapter {
  private faHandle: InstanceType<typeof RemoteFile> | InstanceType<typeof BlobFile> | TauriFile | null = null
  private index: FaiEntry[] = []
  private indexMap: Map<string, FaiEntry> = new Map()
  private refNames: string[] = []

  constructor(
    private source:
      | { file: File; index: File }
      | { faUrl: string; faiUrl: string }
      | { faPath: string; faiPath: string },
  ) {}

  async initialize(): Promise<AdapterMetadata> {
    // Read the FAI index
    let faiText: string
    if ('faPath' in this.source) {
      this.faHandle = new TauriFile(this.source.faPath)
      const faiHandle = new TauriFile(this.source.faiPath)
      const faiBuffer = await faiHandle.readFile()
      faiText = new TextDecoder().decode(faiBuffer)
    } else if ('file' in this.source) {
      this.faHandle = new BlobFile(this.source.file)
      faiText = await this.source.index.text()
    } else {
      this.faHandle = new RemoteFile(this.source.faUrl)
      const faiHandle = new RemoteFile(this.source.faiUrl)
      const faiBuffer = await faiHandle.readFile()
      faiText = new TextDecoder().decode(faiBuffer)
    }

    // Parse FAI: NAME LENGTH OFFSET LINEBASES LINEWIDTH
    for (const line of faiText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split('\t')
      if (parts.length < 5) continue
      const entry: FaiEntry = {
        name: parts[0],
        length: parseInt(parts[1], 10),
        offset: parseInt(parts[2], 10),
        lineBases: parseInt(parts[3], 10),
        lineWidth: parseInt(parts[4], 10),
      }
      this.index.push(entry)
      this.indexMap.set(entry.name, entry)
    }

    this.refNames = this.index.map((e) => e.name)

    return {
      refNames: this.refNames,
      format: 'fasta',
    }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(_region: GenomicRegion): Promise<GenomicFeature[]> {
    return []
  }

  async getSequence(region: GenomicRegion): Promise<string> {
    if (!this.faHandle) throw new Error('Not initialized')

    const entry = this.indexMap.get(region.chromosome)
    if (!entry) return ''

    const start = Math.max(0, region.start)
    const end = Math.min(entry.length, region.end)
    if (start >= end) return ''

    // Calculate byte positions in the FASTA file
    const startLine = Math.floor(start / entry.lineBases)
    const startCol = start % entry.lineBases
    const startByte = entry.offset + startLine * entry.lineWidth + startCol

    const endLine = Math.floor((end - 1) / entry.lineBases)
    const endCol = (end - 1) % entry.lineBases
    const endByte = entry.offset + endLine * entry.lineWidth + endCol + 1

    const length = endByte - startByte
    const buffer = await this.faHandle.read(length, startByte)
    const raw = new TextDecoder().decode(buffer)

    // Strip newlines and return uppercase sequence
    return raw.replace(/[\r\n]/g, '').toUpperCase()
  }

  dispose(): void {
    this.faHandle = null
  }
}
