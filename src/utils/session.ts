import { invoke } from '@tauri-apps/api/core'
import { BigWigAdapter } from '@/adapters/BigWigAdapter'
import { BedAdapter } from '@/adapters/BedAdapter'
import { GffAdapter } from '@/adapters/GffAdapter'
import { BamAdapter } from '@/adapters/BamAdapter'
import { VcfAdapter } from '@/adapters/VcfAdapter'
import { FastaAdapter } from '@/adapters/FastaAdapter'
import { isTauri } from '@/adapters/TauriFile'
import type { TrackConfig, TrackType } from '@/store/trackStore'
import type { GenomicAdapter } from '@/adapters/types'

interface SessionTrack {
  name: string
  type: TrackType
  height: number
  color: string
  visible: boolean
  source: Record<string, string>
}

interface SessionData {
  version: 1
  viewport: {
    chromosome: string
    start: number
    end: number
  }
  tracks: SessionTrack[]
}

export function serializeSession(
  tracks: TrackConfig[],
  viewport: { chromosome: string; start: number; end: number },
): string {
  const sessionTracks: SessionTrack[] = tracks
    .filter((t) => t.settings.source)
    .map((t) => ({
      name: t.name,
      type: t.type,
      height: t.height,
      color: t.color,
      visible: t.visible,
      source: t.settings.source as Record<string, string>,
    }))

  const session: SessionData = {
    version: 1,
    viewport,
    tracks: sessionTracks,
  }

  return JSON.stringify(session, null, 2)
}

async function createAdapterFromSource(
  source: Record<string, string>,
): Promise<{ adapter: GenomicAdapter; type: TrackType } | null> {
  const format = source.format

  switch (format) {
    case 'bigwig': {
      const adapter = new BigWigAdapter(source.path ?? source.url)
      return { adapter, type: 'coverage' }
    }
    case 'bed': {
      const adapter = new BedAdapter(source.path ?? source.url)
      return { adapter, type: 'annotation' }
    }
    case 'gtf': {
      const adapter = new GffAdapter(source.path ?? source.url, 'gtf')
      return { adapter, type: 'gene_model' }
    }
    case 'gff3': {
      const adapter = new GffAdapter(source.path ?? source.url, 'gff3')
      return { adapter, type: 'gene_model' }
    }
    case 'bam': {
      if (source.bamPath) {
        const adapter = new BamAdapter({ bamPath: source.bamPath, baiPath: source.baiPath })
        return { adapter, type: 'alignment' }
      }
      const adapter = new BamAdapter({ bamUrl: source.url, baiUrl: source.baiUrl })
      return { adapter, type: 'alignment' }
    }
    case 'vcf': {
      if (source.vcfPath) {
        const adapter = new VcfAdapter({ vcfPath: source.vcfPath, tbiPath: source.tbiPath })
        return { adapter, type: 'variant' }
      }
      const adapter = new VcfAdapter({ vcfUrl: source.url, tbiUrl: source.tbiUrl })
      return { adapter, type: 'variant' }
    }
    case 'fasta': {
      if (source.faPath) {
        const adapter = new FastaAdapter({ faPath: source.faPath, faiPath: source.faiPath })
        return { adapter, type: 'sequence' }
      }
      const adapter = new FastaAdapter({ faUrl: source.url, faiUrl: source.faiUrl })
      return { adapter, type: 'sequence' }
    }
  }

  return null
}

async function checkFileExists(source: Record<string, string>): Promise<string[]> {
  if (!isTauri()) return []
  const missing: string[] = []
  const pathKeys = ['path', 'bamPath', 'baiPath', 'faPath', 'faiPath', 'vcfPath', 'tbiPath']
  for (const key of pathKeys) {
    if (source[key]) {
      const exists: boolean = await invoke('file_exists', { path: source[key] })
      if (!exists) missing.push(source[key])
    }
  }
  return missing
}

let trackIdCounter = 1000

export async function restoreSession(
  json: string,
): Promise<{
  viewport: SessionData['viewport']
  tracks: TrackConfig[]
  errors: string[]
}> {
  const session: SessionData = JSON.parse(json)
  const tracks: TrackConfig[] = []
  const errors: string[] = []

  const results = await Promise.allSettled(
    session.tracks.map(async (st) => {
      const missing = await checkFileExists(st.source)
      if (missing.length > 0) {
        throw new Error(`Missing files: ${missing.join(', ')}`)
      }

      const result = await createAdapterFromSource(st.source)
      if (!result) {
        throw new Error(`Unknown format: ${st.source.format}`)
      }

      await result.adapter.initialize()

      const track: TrackConfig = {
        id: `track-${++trackIdCounter}`,
        name: st.name,
        type: st.type,
        adapter: result.adapter,
        height: st.height,
        color: st.color,
        visible: st.visible,
        settings: { source: st.source },
      }
      return track
    }),
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      tracks.push(r.value)
    } else {
      errors.push(r.reason?.message ?? String(r.reason))
    }
  }

  return { viewport: session.viewport, tracks, errors }
}

export async function saveSessionToFile(sessionJson: string): Promise<void> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({
    filters: [{ name: 'Genome Browser Session', extensions: ['gbsession'] }],
    defaultPath: 'session.gbsession',
  })
  if (!path) return
  await invoke('write_file', { path, contents: sessionJson })
}

export async function loadSessionFromFile(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({
    filters: [{ name: 'Genome Browser Session', extensions: ['gbsession'] }],
    multiple: false,
  })
  if (!path) return null
  const buf: ArrayBuffer = await invoke('read_file_all', { path })
  return new TextDecoder().decode(new Uint8Array(buf))
}
