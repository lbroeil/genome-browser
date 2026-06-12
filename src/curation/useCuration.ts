import { create } from 'zustand'
import { useTrackStore } from '@/store/trackStore'
import { restoreSessionFromObject } from '@/utils/session'
import { ensureSequenceTrack } from '@/hooks/useEnsureSequenceTrack'
import { OrfListAdapter } from './OrfListAdapter'
import { viewWholeOrf } from './navigation'
import { api, type Project, type CuratedOrf, type Decision } from './api'

const ORF_TRACK_ID = 'orf-list-track'
const USER_STORAGE_KEY = 'curation_user'

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

  setUser: (username: string) => Promise<void>
  logout: () => void
  loadProject: (projectId: number) => Promise<void>
  loadNext: () => Promise<void>
  vote: (decision: Decision, notes: string | undefined, regionViewed: string | undefined) => Promise<void>
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
          await restoreSessionFromObject(baseSession)
        }
        await ensureSequenceTrack()

        // 2. Add the ORFs-under-review annotation track (frame-colored).
        const ts = useTrackStore.getState()
        if (ts.tracks.some((t) => t.id === ORF_TRACK_ID)) ts.removeTrack(ORF_TRACK_ID)
        const adapter = new OrfListAdapter(orfs)
        await adapter.initialize()
        ts.addTrack({
          id: ORF_TRACK_ID,
          name: `ORFs under review — ${project.name}`,
          type: 'annotation',
          adapter,
          height: 80,
          color: '#0ea5e9',
          visible: true,
          settings: { displayMode: 'frame' },
        })

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
        if (next.orf) viewWholeOrf(next.orf)
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
      }
    },

    vote: async (decision, notes, regionViewed) => {
      const { current, userId } = get()
      if (!current || userId == null) return
      set({ lastDecision: decision })
      try {
        await api.vote({
          user_id: userId,
          orf_id: current.id,
          decision,
          notes: notes?.trim() || null,
          region_viewed: regionViewed ?? null,
        })
        await get().loadNext()
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  }
})
