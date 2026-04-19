import { create } from 'zustand'
import type { GenomicRegion } from '@/adapters/types'
import { clampRegion, HG38_CHROMOSOMES, panRegion, zoomRegion } from '@/utils/coordinates'

interface GenomeState {
  chromosome: string
  start: number
  end: number

  // Derived
  region: GenomicRegion
  chromosomeSize: number

  // Actions
  setRegion: (region: GenomicRegion) => void
  setChromosome: (chr: string) => void
  zoom: (factor: number, center?: number) => void
  pan: (deltaBp: number) => void
}

const DEFAULT_CHR = 'chr1'
const DEFAULT_START = 11_800_000
const DEFAULT_END = 12_200_000

export const useGenomeStore = create<GenomeState>((set, get) => ({
  chromosome: DEFAULT_CHR,
  start: DEFAULT_START,
  end: DEFAULT_END,

  get region(): GenomicRegion {
    const { chromosome, start, end } = get()
    return { chromosome, start, end }
  },

  get chromosomeSize(): number {
    return HG38_CHROMOSOMES[get().chromosome] ?? 250_000_000
  },

  setRegion: (region: GenomicRegion) => {
    const chromSize = HG38_CHROMOSOMES[region.chromosome] ?? 250_000_000
    const clamped = clampRegion(region, chromSize)
    set({
      chromosome: clamped.chromosome,
      start: clamped.start,
      end: clamped.end,
    })
  },

  setChromosome: (chr: string) => {
    const size = HG38_CHROMOSOMES[chr]
    if (!size) return
    const center = Math.round(size / 2)
    const halfSpan = Math.min(200_000, Math.round(size / 2))
    set({
      chromosome: chr,
      start: center - halfSpan,
      end: center + halfSpan,
    })
  },

  zoom: (factor: number, center?: number) => {
    const state = get()
    const region = { chromosome: state.chromosome, start: state.start, end: state.end }
    const zoomed = zoomRegion(region, factor, center)
    const chromSize = HG38_CHROMOSOMES[state.chromosome] ?? 250_000_000
    // Limit zoom: min 50bp, max chromosome size
    const width = zoomed.end - zoomed.start
    if (width < 50 || width > chromSize) return
    const clamped = clampRegion(zoomed, chromSize)
    set({ start: clamped.start, end: clamped.end })
  },

  pan: (deltaBp: number) => {
    const state = get()
    const region = { chromosome: state.chromosome, start: state.start, end: state.end }
    const panned = panRegion(region, deltaBp)
    const chromSize = HG38_CHROMOSOMES[state.chromosome] ?? 250_000_000
    const clamped = clampRegion(panned, chromSize)
    set({ start: clamped.start, end: clamped.end })
  },
}))
