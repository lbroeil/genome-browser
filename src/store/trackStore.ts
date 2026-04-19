import { create } from 'zustand'
import type { GenomicAdapter } from '@/adapters/types'

export type TrackType = 'coverage' | 'annotation' | 'gene_model' | 'alignment' | 'variant' | 'sequence'

export interface TrackConfig {
  id: string
  name: string
  type: TrackType
  adapter: GenomicAdapter
  height: number
  color: string
  visible: boolean
  settings: Record<string, unknown>
}

interface TrackState {
  tracks: TrackConfig[]
  addTrack: (track: TrackConfig) => void
  removeTrack: (id: string) => void
  updateTrack: (id: string, updates: Partial<TrackConfig>) => void
  reorderTracks: (fromIndex: number, toIndex: number) => void
}

export const useTrackStore = create<TrackState>((set) => ({
  tracks: [],

  addTrack: (track: TrackConfig) => {
    set((state) => ({ tracks: [...state.tracks, track] }))
  },

  removeTrack: (id: string) => {
    set((state) => {
      const track = state.tracks.find((t) => t.id === id)
      track?.adapter.dispose()
      return { tracks: state.tracks.filter((t) => t.id !== id) }
    })
  },

  updateTrack: (id: string, updates: Partial<TrackConfig>) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  reorderTracks: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const tracks = [...state.tracks]
      const [moved] = tracks.splice(fromIndex, 1)
      tracks.splice(toIndex, 0, moved)
      return { tracks }
    })
  },
}))
