import { create } from 'zustand'
import type { GenomicRegion } from '@/adapters/types'

export interface SearchableFeature {
  name: string
  chromosome: string
  start: number
  end: number
  type: string // 'gene', 'annotation', etc
}

interface SearchState {
  features: SearchableFeature[]
  addFeatures: (features: SearchableFeature[]) => void
  clearFeatures: () => void
  search: (query: string, limit?: number) => SearchableFeature[]
  getRegionForFeature: (feature: SearchableFeature, padding?: number) => GenomicRegion
}

export const useSearchStore = create<SearchState>((set, get) => ({
  features: [],

  addFeatures: (newFeatures: SearchableFeature[]) => {
    set((state) => {
      // Deduplicate by name+chromosome+start
      const existing = new Set(
        state.features.map((f) => `${f.name}:${f.chromosome}:${f.start}`),
      )
      const unique = newFeatures.filter(
        (f) => !existing.has(`${f.name}:${f.chromosome}:${f.start}`),
      )
      return { features: [...state.features, ...unique] }
    })
  },

  clearFeatures: () => set({ features: [] }),

  search: (query: string, limit = 20): SearchableFeature[] => {
    const q = query.toLowerCase().trim()
    if (!q) return []

    const { features } = get()

    // Exact matches first, then prefix matches, then contains matches
    const exact: SearchableFeature[] = []
    const prefix: SearchableFeature[] = []
    const contains: SearchableFeature[] = []

    for (const f of features) {
      const name = f.name.toLowerCase()
      if (name === q) {
        exact.push(f)
      } else if (name.startsWith(q)) {
        prefix.push(f)
      } else if (name.includes(q)) {
        contains.push(f)
      }

      if (exact.length + prefix.length + contains.length >= limit * 2) break
    }

    return [...exact, ...prefix, ...contains].slice(0, limit)
  },

  getRegionForFeature: (feature: SearchableFeature, padding = 0.2): GenomicRegion => {
    const span = feature.end - feature.start
    const pad = Math.max(100, Math.round(span * padding))
    return {
      chromosome: feature.chromosome,
      start: Math.max(0, feature.start - pad),
      end: feature.end + pad,
    }
  },
}))
