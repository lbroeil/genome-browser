import { invoke } from '@tauri-apps/api/core'
import { BigWigAdapter } from '@/adapters/BigWigAdapter'
import { BedAdapter } from '@/adapters/BedAdapter'
import { GffAdapter } from '@/adapters/GffAdapter'
import { BamAdapter } from '@/adapters/BamAdapter'
import { VcfAdapter } from '@/adapters/VcfAdapter'
import { FastaAdapter } from '@/adapters/FastaAdapter'
import { UcscSequenceAdapter } from '@/adapters/UcscSequenceAdapter'
import { isTauri } from '@/adapters/TauriFile'
import { useTrackStore, type TrackConfig, type TrackType } from '@/store/trackStore'
import { useGenomeStore } from '@/store/genomeStore'
import { indexAdapterForSearch, useSearchStore } from '@/store/searchStore'
import type { GenomicAdapter } from '@/adapters/types'

const USER_SETTING_KEYS = [
  'displayMode',
  'forwardColor',
  'reverseColor',
  'translationStrand',
  'strand', // P-site coverage strand tag, used for strand-aware curation visibility
]

interface SessionTrack {
  name: string
  type: TrackType
  height: number
  color: string
  visible: boolean
  source: Record<string, string>
  displaySettings?: Record<string, unknown>
}

interface SessionData {
  version: 2
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
  const sessionTracks: SessionTrack[] = tracks.map((t) => {
    let source: Record<string, string>
    if (t.id === 'hg38-sequence') {
      source = { format: 'builtin', builtinId: 'hg38-sequence' }
    } else if (t.settings.source) {
      source = t.settings.source as Record<string, string>
    } else if (t.settings.sourceUrl) {
      source = {
        format: (t.settings.sourceFormat as string) ?? '',
        url: t.settings.sourceUrl as string,
      }
    } else {
      source = { format: 'unknown', name: t.name }
    }

    const displaySettings: Record<string, unknown> = {}
    for (const key of USER_SETTING_KEYS) {
      if (t.settings[key] !== undefined) {
        displaySettings[key] = t.settings[key]
      }
    }

    return {
      name: t.name,
      type: t.type,
      height: t.height,
      color: t.color,
      visible: t.visible,
      source,
      displaySettings: Object.keys(displaySettings).length > 0 ? displaySettings : undefined,
    }
  })

  const session: SessionData = {
    version: 2,
    viewport,
    tracks: sessionTracks,
  }

  return JSON.stringify(session, null, 2)
}

async function createAdapterFromSource(
  source: Record<string, string>,
): Promise<{ adapter: GenomicAdapter; type: TrackType } | null> {
  const format = source.format

  if (format === 'builtin' && source.builtinId === 'hg38-sequence') {
    const adapter = new UcscSequenceAdapter()
    return { adapter, type: 'sequence' }
  }

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
  const session = JSON.parse(json)
  const tracks: TrackConfig[] = []
  const errors: string[] = []

  const sessionTracks: SessionTrack[] = session.tracks.map((st: SessionTrack & { settings?: Record<string, unknown> }) => {
    if (st.displaySettings) return st
    if (st.settings) {
      const displaySettings: Record<string, unknown> = {}
      for (const key of USER_SETTING_KEYS) {
        if (st.settings[key] !== undefined) displaySettings[key] = st.settings[key]
      }
      return { ...st, displaySettings }
    }
    return st
  })

  const results = await Promise.allSettled(
    sessionTracks.map(async (st) => {
      if (st.source.format === 'unknown' || st.source.kind === 'local') {
        throw new Error(`"${st.name}" was loaded from a local file and cannot be restored without Tauri. Re-open the file.`)
      }

      const missing = await checkFileExists(st.source)
      if (missing.length > 0) {
        throw new Error(`Missing files: ${missing.join(', ')}`)
      }

      const result = await createAdapterFromSource(st.source)
      if (!result) {
        throw new Error(`Unknown format: ${st.source.format}`)
      }

      await result.adapter.initialize()

      const settings: Record<string, unknown> = { source: st.source }
      if (st.displaySettings) {
        Object.assign(settings, st.displaySettings)
      }

      const track: TrackConfig = {
        id: st.source.builtinId === 'hg38-sequence' ? 'hg38-sequence' : `track-${++trackIdCounter}`,
        name: st.name,
        type: st.type,
        adapter: result.adapter,
        height: st.height,
        color: st.color,
        visible: st.visible,
        settings,
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

/**
 * Apply an already-restored session to the live stores: clear current
 * tracks, set the viewport, then add each restored track and (re)build the
 * search index. Centralizes the "replicate all file-load side effects"
 * rule — every side effect of fresh file loading (notably search indexing)
 * must also run on session restore. Returns any per-track restore errors.
 */
export function applyRestoredSession(result: {
  viewport: SessionData['viewport']
  tracks: TrackConfig[]
  errors: string[]
}): string[] {
  const store = useTrackStore.getState()
  for (const t of store.tracks) {
    store.removeTrack(t.id)
  }

  useGenomeStore.getState().setRegion(result.viewport)
  useSearchStore.getState().clearFeatures()

  for (const track of result.tracks) {
    useTrackStore.getState().addTrack(track)
    indexAdapterForSearch(track.adapter, track.type)
  }

  return result.errors
}

/**
 * Restore a session from an already-parsed session object (e.g. fetched as
 * JSON from the backend) and apply it to the live stores. Returns per-track
 * restore errors. Used by the curation view to load a project's base session.
 */
export async function restoreSessionFromObject(session: unknown): Promise<string[]> {
  const result = await restoreSession(JSON.stringify(session))
  return applyRestoredSession(result)
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
    filters: [{ name: 'Genome Browser Session', extensions: ['gbsession', 'json'] }],
    multiple: false,
  })
  if (!path) return null
  const buf: ArrayBuffer = await invoke('read_file_all', { path })
  return new TextDecoder().decode(new Uint8Array(buf))
}
