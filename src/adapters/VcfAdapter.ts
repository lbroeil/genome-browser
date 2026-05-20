import { TabixIndexedFile } from '@gmod/tabix'
import VCFParser from '@gmod/vcf'
import { RemoteFile, BlobFile } from 'generic-filehandle2'
import { TauriFile } from './TauriFile'
import type {
  GenomicAdapter,
  AdapterMetadata,
  GenomicRegion,
  GenomicFeature,
  VariantData,
} from './types'

function classifyVariant(ref: string, alt: string): VariantData['variantType'] {
  if (alt.startsWith('<')) return 'OTHER'
  if (ref.length === 1 && alt.length === 1) return 'SNV'
  if (ref.length < alt.length) return 'INS'
  if (ref.length > alt.length) return 'DEL'
  if (ref.length > 1 && alt.length > 1 && ref.length === alt.length) return 'MNV'
  return 'OTHER'
}

export class VcfAdapter implements GenomicAdapter {
  private tabix: InstanceType<typeof TabixIndexedFile> | null = null
  private parser: InstanceType<typeof VCFParser> | null = null
  private refNames: string[] = []
  private source:
    | { vcfFile: File; tbiFile: File }
    | { vcfUrl: string; tbiUrl: string }
    | { vcfPath: string; tbiPath: string }

  constructor(source: { vcfFile: File; tbiFile: File } | { vcfUrl: string; tbiUrl: string } | { vcfPath: string; tbiPath: string }) {
    this.source = source
  }

  async initialize(): Promise<AdapterMetadata> {
    if ('vcfPath' in this.source) {
      this.tabix = new TabixIndexedFile({
        filehandle: new TauriFile(this.source.vcfPath),
        tbiFilehandle: new TauriFile(this.source.tbiPath),
      })
    } else if ('vcfFile' in this.source) {
      this.tabix = new TabixIndexedFile({
        filehandle: new BlobFile(this.source.vcfFile),
        tbiFilehandle: new BlobFile(this.source.tbiFile),
      })
    } else {
      this.tabix = new TabixIndexedFile({
        filehandle: new RemoteFile(this.source.vcfUrl),
        tbiFilehandle: new RemoteFile(this.source.tbiUrl),
      })
    }

    const header = await this.tabix.getHeader()
    this.parser = new VCFParser({ header, strict: false })
    this.refNames = await this.tabix.getReferenceSequenceNames()

    return {
      refNames: this.refNames,
      format: 'vcf',
    }
  }

  async getRefNames(): Promise<string[]> {
    return this.refNames
  }

  async getFeatures(region: GenomicRegion): Promise<GenomicFeature[]> {
    if (!this.tabix || !this.parser) throw new Error('Not initialized')

    const features: GenomicFeature[] = []
    let counter = 0

    await this.tabix.getLines(region.chromosome, region.start, region.end, {
      lineCallback: (line: string) => {
        try {
          const variant = this.parser!.parseLine(line)
          const altAlleles = variant.ALT ?? []
          const ref = variant.REF ?? ''
          const pos = variant.POS - 1 // Convert to 0-based

          for (const alt of altAlleles) {
            const variantType = classifyVariant(ref, alt)
            const end = pos + ref.length

            const data: VariantData = {
              type: 'variant',
              id: variant.ID?.[0] ?? undefined,
              ref,
              alt: altAlleles,
              qual: variant.QUAL != null ? Number(variant.QUAL) : undefined,
              filter: variant.FILTER,
              variantType,
            }

            features.push({
              id: `vcf-${counter++}`,
              chromosome: region.chromosome,
              start: pos,
              end,
              data,
            })
          }
        } catch {
          // Skip malformed lines
        }
      },
    })

    return features
  }

  dispose(): void {
    this.tabix = null
    this.parser = null
  }
}
