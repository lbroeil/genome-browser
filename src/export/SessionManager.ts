import type { GenomicRegion } from '@/adapters/types'
import type { TrackConfig, TrackType } from '@/store/trackStore'
import { BigWigAdapter } from '@/adapters/BigWigAdapter'
import { BedAdapter } from '@/adapters/BedAdapter'
import { GffAdapter } from '@/adapters/GffAdapter'
import { BamAdapter } from '@/adapters/BamAdapter'
import { VcfAdapter } from '@/adapters/VcfAdapter'
import { FastaAdapter } from '@/adapters/FastaAdapter'
import { UcscSequenceAdapter } from '@/adapters/UcscSequenceAdapter'

interface SessionTrack {
  id: string
  name: string
  type: TrackType
  height: number
  color: string
  visible: boolean
  settings: Record<string, unknown>
  source:
    | { kind: 'url'; url: string; format: string }
    | { kind: 'builtin'; builtinId: string }
    | { kind: 'local'; filename: string }
}

interface SessionData {
  version: 1
  viewport: GenomicRegion
  tracks: SessionTrack[]
}

export function serializeSession(
  region: GenomicRegion,
  tracks: TrackConfig[],
): string {
  const sessionTracks: SessionTrack[] = tracks.map((track) => {
    let source: SessionTrack['source']
    if (track.id === 'hg38-sequence') {
      source = { kind: 'builtin', builtinId: 'hg38-sequence' }
    } else if (track.settings.sourceUrl) {
      source = {
        kind: 'url',
        url: track.settings.sourceUrl as string,
        format: (track.settings.sourceFormat as string) ?? '',
      }
    } else {
      source = { kind: 'local', filename: track.name }
    }

    // Strip non-serializable settings (sourceUrl/sourceFormat are internal)
    const { sourceUrl: _u, sourceFormat: _f, ...userSettings } = track.settings

    return {
      id: track.id,
      name: track.name,
      type: track.type,
      height: track.height,
      color: track.color,
      visible: track.visible,
      settings: userSettings,
      source,
    }
  })

  const session: SessionData = {
    version: 1,
    viewport: region,
    tracks: sessionTracks,
  }

  return JSON.stringify(session, null, 2)
}

export interface RestoreResult {
  region: GenomicRegion
  tracks: TrackConfig[]
  warnings: string[]
}

export async function restoreSession(json: string): Promise<RestoreResult> {
  const session: SessionData = JSON.parse(json)
  const warnings: string[] = []
  const tracks: TrackConfig[] = []

  for (const st of session.tracks) {
    try {
      let adapter: TrackConfig['adapter']

      if (st.source.kind === 'builtin') {
        if (st.source.builtinId === 'hg38-sequence') {
          adapter = new UcscSequenceAdapter()
          await adapter.initialize()
        } else {
          warnings.push(`Unknown built-in track: ${st.source.builtinId}`)
          continue
        }
      } else if (st.source.kind === 'url') {
        adapter = createAdapterFromUrl(st.source.url, st.source.format, st.type)
        await adapter.initialize()
      } else {
        warnings.push(`"${st.source.filename}" was loaded from a local file and cannot be restored. Re-drop the file to add it back.`)
        continue
      }

      tracks.push({
        id: st.id,
        name: st.name,
        type: st.type,
        adapter,
        height: st.height,
        color: st.color,
        visible: st.visible,
        settings: {
          ...st.settings,
          ...(st.source.kind === 'url' ? { sourceUrl: st.source.url, sourceFormat: st.source.format } : {}),
        },
      })
    } catch (e) {
      warnings.push(`Failed to restore "${st.name}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    region: session.viewport,
    tracks,
    warnings,
  }
}

function createAdapterFromUrl(url: string, format: string, type: TrackType): TrackConfig['adapter'] {
  switch (format || inferFormat(url, type)) {
    case 'bigwig':
      return new BigWigAdapter(url)
    case 'bed':
      return new BedAdapter(url)
    case 'gtf':
      return new GffAdapter(url, 'gtf')
    case 'gff3':
      return new GffAdapter(url, 'gff3')
    case 'bam':
      return new BamAdapter({ bamUrl: url, baiUrl: url + '.bai' })
    case 'vcf':
      return new VcfAdapter({ vcfUrl: url, tbiUrl: url + '.tbi' })
    case 'fasta':
      return new FastaAdapter({ faUrl: url, faiUrl: url + '.fai' })
    default:
      throw new Error(`Unknown format: ${format}`)
  }
}

function inferFormat(url: string, type: TrackType): string {
  const lower = url.toLowerCase()
  if (lower.endsWith('.bw') || lower.endsWith('.bigwig')) return 'bigwig'
  if (lower.endsWith('.bed') || lower.endsWith('.bed.gz')) return 'bed'
  if (lower.endsWith('.gtf') || lower.endsWith('.gtf.gz')) return 'gtf'
  if (lower.endsWith('.gff3') || lower.endsWith('.gff') || lower.endsWith('.gff3.gz') || lower.endsWith('.gff.gz')) return 'gff3'
  if (lower.endsWith('.bam')) return 'bam'
  if (lower.endsWith('.vcf') || lower.endsWith('.vcf.gz')) return 'vcf'
  if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fna')) return 'fasta'
  // Fallback by track type
  switch (type) {
    case 'coverage': return 'bigwig'
    case 'annotation': return 'bed'
    case 'gene_model': return 'gtf'
    case 'alignment': return 'bam'
    case 'variant': return 'vcf'
    case 'sequence': return 'fasta'
    default: return ''
  }
}

export function downloadSession(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
