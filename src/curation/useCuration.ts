import { create } from 'zustand'
import { useTrackStore, type TrackConfig } from '@/store/trackStore'
import { restoreSessionFromObject } from '@/utils/session'
import { ensureSequenceTrack } from '@/hooks/useEnsureSequenceTrack'
import { OrfListAdapter } from './OrfListAdapter'
import { viewWholeOrf, applyStrandVisibility, applySequenceStrand } from './navigation'
import { api, type Project, type CuratedOrf, type Decision } from './api'

/**
 * Resolve relative track URLs ("/data/x.bw") in a base session against the API
 * base, so the same session works in dev (cross-origin) and prod (same-origin).
 */
function resolveSessionUrls(session: unknown): unknown {
  if (!session || typeof session !== 'object') return session
  const s = JSON.parse(JSON.stringify(session)) as { tracks?: Array<{ source?: Record<string, string> }> }
  // Resolve to an ABSOLUTE URL. In prod apiBase is '' (same origin), which would
  // leave a root-relative "/data/x.bw" — and the bigWig/BAM remote-file readers
  // need an absolute URL, so fall back to the current origin.
  const base = api.apiBase || (typeof window !== 'undefined' ? window.location.origin : '')
  for (const t of s.tracks ?? []) {
    const src = t.source
    if (src?.url && src.url.startsWith('/')) src.url = `${base}${src.url}`
  }
  return s
}

const ORF_TRACK_ID = 'orf-list-track'        // the single ORF currently under review
const ALL_ORFS_TRACK_ID = 'all-orfs-track'   // dim context layer: every candidate ORF
const USER_STORAGE_KEY = 'curation_user'

/**
 * Curation track order, top → bottom:
 *   gene models (GENCODE context)
 *   → all candidate ORFs (dim context)
 *   → ORF under review (the one being judged, highlighted)
 *   → hg38 sequence / translation
 *   → P-site coverage.
 */
function curationRank(t: TrackConfig): number {
  if (t.id === ALL_ORFS_TRACK_ID) return 1 // dim context of all candidates
  if (t.id === ORF_TRACK_ID) return 2 // the ORF under review — below the broader context
  switch (t.type) {
    case 'gene_model': return 0
    case 'annotation':
    case 'variant': return 1          // context (all candidate ORFs, etc.)
    case 'sequence': return 3         // hg38 sequence / translation
    case 'coverage':
    case 'alignment': return 4        // P-site coverage
    default: return 1
  }
}

function orderCurationTracks(): void {
  const ordered = [...useTrackStore.getState().tracks].sort((a, b) => curationRank(a) - curationRank(b))
  useTrackStore.setState({ tracks: ordered })
}

/**
 * (Re)build the "ORF under review" track so it contains ONLY the ORF being
 * judged — highlighted bright — so it's unambiguous which one the vote applies
 * to, even when neighbouring candidates overlap. The full candidate set stays
 * visible in the dim ALL_ORFS_TRACK_ID context layer above.
 */
async function setReviewTrack(orf: CuratedOrf): Promise<void> {
  const ts = useTrackStore.getState()
  if (ts.tracks.some((t) => t.id === ORF_TRACK_ID)) ts.removeTrack(ORF_TRACK_ID)
  const adapter = new OrfListAdapter([orf])
  await adapter.initialize()
  ts.addTrack({
    id: ORF_TRACK_ID,
    name: `▶ Under review — ${orf.name}`,
    type: 'annotation',
    adapter,
    height: 70,
    color: '#0ea5e9',
    visible: true,
    settings: { displayMode: 'frame' },
  })
  orderCurationTracks()
}

interface StoredUser { id: number; username: string }

function loadStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredUser) : null
  } catch {
    return null
  }
}

interface CurationState {
  userId: number | null
  username: string | null

  project: Project | null
  orfs: CuratedOrf[]
  current: CuratedOrf | null
  progressCurrent: number
  progressTotal: number
  done: boolean

  loading: boolean
  error: string | null
  lastDecision: Decision | null
  strandFilter: boolean

  setUser: (username: string) => Promise<void>
  logout: () => void
  loadProject: (projectId: number) => Promise<void>
  loadNext: () => Promise<void>
  vote: (decision: Decision, notes: string | undefined, regionViewed: string | undefined, flagStartCodon?: boolean) => Promise<void>
  setStrandFilter: (on: boolean) => void
}

export const useCuration = create<CurationState>((set, get) => {
  const stored = loadStoredUser()
  return {
    userId: stored?.id ?? null,
    username: stored?.username ?? null,

    project: null,
    orfs: [],
    current: null,
    progressCurrent: 0,
    progressTotal: 0,
    done: false,

    loading: false,
    error: null,
    lastDecision: null,
    strandFilter: true,

    setUser: async (username: string) => {
      const user = await api.createOrGetUser(username.trim())
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ id: user.id, username: user.username }))
      set({ userId: user.id, username: user.username })
    },

    logout: () => {
      localStorage.removeItem(USER_STORAGE_KEY)
      set({ userId: null, username: null })
    },

    loadProject: async (projectId: number) => {
      set({ loading: true, error: null, done: false, current: null })
      try {
        const [project, orfs, baseSession] = await Promise.all([
          api.getProject(projectId),
          api.getOrfs(projectId),
          api.getBaseSession(projectId),
        ])

        // 1. Restore the admin-defined base session (shared tracks + viewport),
        //    if one is set. Then ensure the hg38 sequence track is present.
        if (baseSession && Array.isArray((baseSession as { tracks?: unknown[] }).tracks) &&
            (baseSession as { tracks: unknown[] }).tracks.length > 0) {
          const restoreErrors = await restoreSessionFromObject(resolveSessionUrls(baseSession))
          if (restoreErrors.length > 0) {
            console.warn(`Base session: ${restoreErrors.length} track(s) failed to load:`, restoreErrors)
          }
        }
        await ensureSequenceTrack()

        // 2. Add a dim context track showing ALL candidate ORFs (the one being
        //    judged is highlighted separately in loadNext via setReviewTrack).
        const ts = useTrackStore.getState()
        if (ts.tracks.some((t) => t.id === ALL_ORFS_TRACK_ID)) ts.removeTrack(ALL_ORFS_TRACK_ID)
        if (ts.tracks.some((t) => t.id === ORF_TRACK_ID)) ts.removeTrack(ORF_TRACK_ID)
        const allAdapter = new OrfListAdapter(orfs)
        await allAdapter.initialize()
        ts.addTrack({
          id: ALL_ORFS_TRACK_ID,
          name: `All candidate ORFs — ${project.name}`,
          type: 'annotation',
          adapter: allAdapter,
          height: 70,
          color: '#c4b5fd',
          visible: true,
          settings: { displayMode: 'frame' },
        })

        // 3. Enforce curation track order (context on top, sequence at bottom).
        orderCurationTracks()

        set({ project, orfs, loading: false })
        await get().loadNext()
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : String(err) })
      }
    },

    loadNext: async () => {
      const { project, userId } = get()
      if (!project || userId == null) return
      try {
        const next = await api.nextOrf(project.id, userId)
        set({
          current: next.orf,
          progressCurrent: next.progress_current,
          progressTotal: next.progress_total,
          done: next.done,
        })
        if (next.orf) {
          await setReviewTrack(next.orf)
          applyStrandVisibility(next.orf.strand, get().strandFilter)
          applySequenceStrand(next.orf.strand)
          viewWholeOrf(next.orf)
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
      }
    },

    vote: async (decision, notes, regionViewed, flagStartCodon) => {
      const { current, userId } = get()
      if (!current || userId == null) return
      set({ lastDecision: decision })
      try {
        await api.vote({
          user_id: userId,
          orf_id: current.id,
          decision,
          flag_start_codon: decision === 'good' ? !!flagStartCodon : false,
          notes: notes?.trim() || null,
          region_viewed: regionViewed ?? null,
        })
        await get().loadNext()
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
      }
    },

    setStrandFilter: (on: boolean) => {
      set({ strandFilter: on })
      applyStrandVisibility(get().current?.strand ?? null, on)
    },
  }
})
