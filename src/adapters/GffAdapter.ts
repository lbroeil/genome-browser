import type {
  GenomicAdapter,
  AdapterMetadata,
  GenomicRegion,
  GenomicFeature,
  GeneModelData,
  Transcript,
  Exon,
} from './types'

interface RawFeature {
  chromosome: string
  source: string
  type: string
  start: number
  end: number
  score: string
  strand: '+' | '-' | '.'
  frame: string
  attributes: Record<string, string>
}

export class GffAdapter implements GenomicAdapter {
  private features: GenomicFeature[] = []
  private refNames: Set<string> = new Set()
  private fileHandle: File | null = null
  private url: string | null = null
  private format: 'gtf' | 'gff3'

  constructor(source: File | string, format: 'gtf' | 'gff3' = 'gtf') {
    if (typeof source === 'string') {
      this.url = source
    } else {
      this.fileHandle = source
    }
    this.format = format
  }

  async initialize(): Promise<AdapterMetadata> {
    let text: string

    if (this.fileHandle) {
      text = await this.fileHandle.text()
    } else if (this.url) {
      const response = await fetch(this.url)
      text = await response.text()
    } else {
      throw new Error('No file source')
    }

    const rawFeatures = this.parseLines(text)
    this.features = this.buildGeneModels(rawFeatures)

    return {
      refNames: Array.from(this.refNames),
      format: this.format,
    }
  }

  private parseLines(text: string): RawFeature[] {
    const features: RawFeature[] = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const fields = trimmed.split('\t')
      if (fields.length < 9) continue

      const chromosome = fields[0]
      this.refNames.add(chromosome)

      features.push({
        chromosome,
        source: fields[1],
        type: fields[2],
        start: parseInt(fields[3], 10) - 1, // Convert to 0-based
        end: parseInt(fields[4], 10), // GTF/GFF end is 1-based inclusive -> 0-based exclusive
        score: fields[5],
        strand: fields[6] as '+' | '-' | '.',
        frame: fields[7],
        attributes: this.parseAttributes(fields[8]),
      })
    }
    return features
  }

  private parseAttributes(attrStr: string): Record<string, string> {
    const attrs: Record<string, string> = {}

    if (this.format === 'gtf') {
      // GTF format: key "value"; key "value";
      const matches = attrStr.matchAll(/(\w+)\s+"([^"]*?)"/g)
      for (const match of matches) {
        attrs[match[1]] = match[2]
      }
    } else {
      // GFF3 format: key=value;key=value
      for (const pair of attrStr.split(';')) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx > 0) {
          const key = pair.substring(0, eqIdx).trim()
          const value = decodeURIComponent(pair.substring(eqIdx + 1).trim())
          attrs[key] = value
        }
      }
    }

    return attrs
  }

  private buildGeneModels(rawFeatures: RawFeature[]): GenomicFeature[] {
    if (this.format === 'gff3') {
      return this.buildGeneModelsGff3(rawFeatures)
    }
    return this.buildGeneModelsGtf(rawFeatures)
  }

  /** GTF: group by gene_id / transcript_id attributes */
  private buildGeneModelsGtf(rawFeatures: RawFeature[]): GenomicFeature[] {
    const geneMap = new Map<string, { gene: RawFeature | null; transcripts: Map<string, { transcript: RawFeature | null; exons: RawFeature[]; cds: RawFeature[]; utrs: RawFeature[] }> }>()

    for (const f of rawFeatures) {
      const geneId = f.attributes.gene_id || 'unknown'
      const transcriptId = f.attributes.transcript_id || ''

      if (!geneMap.has(geneId)) {
        geneMap.set(geneId, { gene: null, transcripts: new Map() })
      }
      const gene = geneMap.get(geneId)!

      const typeLower = f.type.toLowerCase()

      if (typeLower === 'gene') {
        gene.gene = f
      } else if (typeLower === 'transcript' || typeLower === 'mrna') {
        if (!gene.transcripts.has(transcriptId)) {
          gene.transcripts.set(transcriptId, { transcript: null, exons: [], cds: [], utrs: [] })
        }
        gene.transcripts.get(transcriptId)!.transcript = f
      } else if (typeLower === 'exon') {
        const txId = transcriptId || geneId
        if (!gene.transcripts.has(txId)) {
          gene.transcripts.set(txId, { transcript: null, exons: [], cds: [], utrs: [] })
        }
        gene.transcripts.get(txId)!.exons.push(f)
      } else if (typeLower === 'cds') {
        const txId = transcriptId || geneId
        if (!gene.transcripts.has(txId)) {
          gene.transcripts.set(txId, { transcript: null, exons: [], cds: [], utrs: [] })
        }
        gene.transcripts.get(txId)!.cds.push(f)
      } else if (typeLower.includes('utr') || typeLower === 'five_prime_utr' || typeLower === 'three_prime_utr') {
        const txId = transcriptId || geneId
        if (!gene.transcripts.has(txId)) {
          gene.transcripts.set(txId, { transcript: null, exons: [], cds: [], utrs: [] })
        }
        gene.transcripts.get(txId)!.utrs.push(f)
      }
    }

    return this.assembleGenes(geneMap)
  }

  /** GFF3: resolve Parent-based hierarchy (gene → mRNA → exon/CDS/UTR) */
  private buildGeneModelsGff3(rawFeatures: RawFeature[]): GenomicFeature[] {
    // Build ID → feature lookup and Parent → children mapping
    const byId = new Map<string, RawFeature>()
    const childrenOf = new Map<string, RawFeature[]>()

    for (const f of rawFeatures) {
      if (f.attributes.ID) {
        byId.set(f.attributes.ID, f)
      }
      const parents = f.attributes.Parent?.split(',') ?? []
      for (const p of parents) {
        const trimmed = p.trim()
        if (!trimmed) continue
        if (!childrenOf.has(trimmed)) childrenOf.set(trimmed, [])
        childrenOf.get(trimmed)!.push(f)
      }
    }

    type GeneEntry = { gene: RawFeature | null; transcripts: Map<string, { transcript: RawFeature | null; exons: RawFeature[]; cds: RawFeature[]; utrs: RawFeature[] }> }
    const geneMap = new Map<string, GeneEntry>()

    // Find all gene-level features
    for (const f of rawFeatures) {
      const typeLower = f.type.toLowerCase()
      if (typeLower === 'gene' || typeLower === 'pseudogene') {
        const geneId = f.attributes.ID ?? f.attributes.Name ?? `gene-${f.start}`
        if (!geneMap.has(geneId)) {
          geneMap.set(geneId, { gene: f, transcripts: new Map() })
        } else {
          geneMap.get(geneId)!.gene = f
        }

        // Find child transcripts (mRNA, transcript, etc.)
        const txChildren = childrenOf.get(geneId) ?? []
        for (const tx of txChildren) {
          const txType = tx.type.toLowerCase()
          if (txType === 'mrna' || txType === 'transcript' || txType === 'ncrna' || txType === 'lnc_rna' || txType === 'mrna' || txType === 'rrna' || txType === 'trna') {
            const txId = tx.attributes.ID ?? tx.attributes.Name ?? `tx-${tx.start}`
            const gene = geneMap.get(geneId)!
            if (!gene.transcripts.has(txId)) {
              gene.transcripts.set(txId, { transcript: tx, exons: [], cds: [], utrs: [] })
            }

            // Find child exons/CDS/UTR of this transcript
            const subChildren = childrenOf.get(txId) ?? []
            const txData = gene.transcripts.get(txId)!
            for (const sub of subChildren) {
              const subType = sub.type.toLowerCase()
              if (subType === 'exon') {
                txData.exons.push(sub)
              } else if (subType === 'cds') {
                txData.cds.push(sub)
              } else if (subType.includes('utr') || subType === 'five_prime_utr' || subType === 'three_prime_utr') {
                txData.utrs.push(sub)
              }
            }
          }
        }
      }
    }

    // Handle orphan mRNAs (no gene parent) — create synthetic gene entries
    for (const f of rawFeatures) {
      const typeLower = f.type.toLowerCase()
      if (typeLower === 'mrna' || typeLower === 'transcript') {
        const txId = f.attributes.ID ?? `tx-${f.start}`
        const parentId = f.attributes.Parent
        // Skip if parent is a known gene
        if (parentId && geneMap.has(parentId)) continue

        const geneId = parentId ?? txId
        if (!geneMap.has(geneId)) {
          geneMap.set(geneId, { gene: null, transcripts: new Map() })
        }
        const gene = geneMap.get(geneId)!
        if (!gene.transcripts.has(txId)) {
          gene.transcripts.set(txId, { transcript: f, exons: [], cds: [], utrs: [] })
          const subChildren = childrenOf.get(txId) ?? []
          const txData = gene.transcripts.get(txId)!
          for (const sub of subChildren) {
            const subType = sub.type.toLowerCase()
            if (subType === 'exon') txData.exons.push(sub)
            else if (subType === 'cds') txData.cds.push(sub)
            else if (subType.includes('utr')) txData.utrs.push(sub)
          }
        }
      }
    }

    return this.assembleGenes(geneMap)
  }

  /** Shared: convert grouped gene data into GenomicFeature[] */
  private assembleGenes(geneMap: Map<string, { gene: RawFeature | null; transcripts: Map<string, { transcript: RawFeature | null; exons: RawFeature[]; cds: RawFeature[]; utrs: RawFeature[] }> }>): GenomicFeature[] {
    const result: GenomicFeature[] = []

    for (const [geneId, geneData] of geneMap) {
      const transcripts: Transcript[] = []
      let geneStart = Infinity
      let geneEnd = -Infinity
      let geneChrom = ''
      let geneStrand: '+' | '-' | undefined

      for (const [txId, txData] of geneData.transcripts) {
        if (txData.exons.length === 0 && !txData.transcript) continue

        const exons: Exon[] = txData.exons
          .map((e) => ({ start: e.start, end: e.end }))
          .sort((a, b) => a.start - b.start)

        const txStart = txData.transcript?.start ?? Math.min(...txData.exons.map((e) => e.start))
        const txEnd = txData.transcript?.end ?? Math.max(...txData.exons.map((e) => e.end))
        const strand = (txData.transcript?.strand ?? txData.exons[0]?.strand ?? '.') as '+' | '-' | '.'

        geneChrom = txData.transcript?.chromosome ?? txData.exons[0]?.chromosome ?? ''
        geneStrand = strand === '+' || strand === '-' ? strand : undefined
        geneStart = Math.min(geneStart, txStart)
        geneEnd = Math.max(geneEnd, txEnd)

        const cds = txData.cds.map((c) => ({ start: c.start, end: c.end })).sort((a, b) => a.start - b.start)

        // Compute UTRs from CDS and exons if not explicitly provided
        let utr5: { start: number; end: number }[] = []
        let utr3: { start: number; end: number }[] = []

        if (txData.utrs.length > 0) {
          for (const u of txData.utrs) {
            const uType = u.type.toLowerCase()
            if (uType.includes('five') || uType === '5utr') {
              utr5.push({ start: u.start, end: u.end })
            } else {
              utr3.push({ start: u.start, end: u.end })
            }
          }
        } else if (cds.length > 0 && exons.length > 0) {
          // Derive UTRs from CDS boundaries
          const cdsStart = cds[0].start
          const cdsEnd = cds[cds.length - 1].end

          for (const exon of exons) {
            if (exon.end <= cdsStart) {
              const target = strand === '-' ? utr3 : utr5
              target.push({ start: exon.start, end: exon.end })
            } else if (exon.start >= cdsEnd) {
              const target = strand === '-' ? utr5 : utr3
              target.push({ start: exon.start, end: exon.end })
            } else {
              if (exon.start < cdsStart) {
                const target = strand === '-' ? utr3 : utr5
                target.push({ start: exon.start, end: cdsStart })
              }
              if (exon.end > cdsEnd) {
                const target = strand === '-' ? utr5 : utr3
                target.push({ start: cdsEnd, end: exon.end })
              }
            }
          }
        }

        transcripts.push({
          id: txId,
          start: txStart,
          end: txEnd,
          strand: strand === '+' || strand === '-' ? strand : '+',
          exons,
          cds: cds.length > 0 ? cds : undefined,
          utr5: utr5.length > 0 ? utr5 : undefined,
          utr3: utr3.length > 0 ? utr3 : undefined,
        })
      }

      if (geneData.gene) {
        geneChrom = geneData.gene.chromosome
        geneStart = geneData.gene.start
        geneEnd = geneData.gene.end
        geneStrand = geneData.gene.strand === '+' || geneData.gene.strand === '-' ? geneData.gene.strand : undefined
      }

      if (!geneChrom || geneStart === Infinity) continue

      const geneName = geneData.gene?.attributes.gene_name ?? geneData.gene?.attributes.Name ?? undefined
      const biotype = geneData.gene?.attributes.gene_biotype ?? geneData.gene?.attributes.gene_type ?? geneData.gene?.attributes.biotype ?? undefined

      const data: GeneModelData = {
        type: 'gene_model',
        geneId,
        geneName,
        biotype,
        transcripts,
      }

      result.push({
        id: `gene-${geneId}`,
        chromosome: geneChrom,
        start: geneStart,
        end: geneEnd,
        strand: geneStrand,
        data,
      })
    }

    return result
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
