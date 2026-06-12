// API client for the ORF curation backend (FastAPI). In dev the backend runs
// on a separate origin (set VITE_API_BASE); in production it serves this build
// from the same origin, so the base is empty.

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export interface CurationUser {
  id: number
  username: string
}

export interface Project {
  id: number
  name: string
  description: string | null
  orf_count: number
  created_at: string
}

export interface CuratedOrf {
  id: number
  name: string
  orf_type: string
  gene_name: string | null
  chromosome: string | null
  start: number | null
  stop: number | null
  strand: string | null
  block_sizes: string | null
  block_starts: string | null
  thick_start: number | null
  thick_stop: number | null
  metadata_json: Record<string, unknown> | null
}

export interface NextOrf {
  orf: CuratedOrf | null
  done: boolean
  progress_current: number
  progress_total: number
}

export type Decision = 'good' | 'bad' | 'skip'

export interface VotePayload {
  user_id: number
  orf_id: number
  decision: Decision
  notes?: string | null
  region_viewed?: string | null
}

export interface OrfStatsRow {
  orf_id: number
  orf_name: string
  orf_type: string
  gene_name: string | null
  total_votes: number
  good_votes: number
  bad_votes: number
  skip_votes: number
  good_pct: number
  consensus: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* non-JSON error */ }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  apiBase: API_BASE,

  createOrGetUser: (username: string) =>
    req<CurationUser>('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }),

  listProjects: () => req<Project[]>('/api/projects'),

  createProject: (form: FormData) =>
    req<Project>('/api/projects', { method: 'POST', body: form }),

  deleteProject: (projectId: number) =>
    req<unknown>(`/api/projects/${projectId}`, { method: 'DELETE' }),

  getProject: (projectId: number) => req<Project>(`/api/projects/${projectId}`),

  getBaseSession: (projectId: number) =>
    req<Record<string, unknown>>(`/api/projects/${projectId}/base-session`),

  getOrfs: (projectId: number) => req<CuratedOrf[]>(`/api/projects/${projectId}/orfs`),

  nextOrf: (projectId: number, userId: number) =>
    req<NextOrf>(`/api/projects/${projectId}/next-orf?user_id=${userId}`),

  vote: (payload: VotePayload) =>
    req<unknown>('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getStats: (projectId: number) => req<OrfStatsRow[]>(`/api/projects/${projectId}/stats`),

  statsExportUrl: (projectId: number) => `${API_BASE}/api/projects/${projectId}/stats/export`,
}
