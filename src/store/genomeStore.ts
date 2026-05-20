import { create } from 'zustand'
import type { GenomicRegion } from '@/adapters/types'
import { clampRegion, HG38_CHROMOSOMES, panRegion, zoomRegion } from '@/utils/coordinates'

const MAX_HISTORY = 50

interface GenomeState {
  chromosome: string
  start: number
  end: number

  // Derived
  region: GenomicRegion
  chromosomeSize: number

  // History (browser-style: stores visited positions, index = current)
  history: GenomicRegion[]
  historyIndex: number
  canGoBack: boolean
  canGoForward: boolean

  // Actions
  setRegion: (region: GenomicRegion) => void
  setChromosome: (chr: string) => void
  zoom: (factor: number, center?: number) => void
  pan: (deltaBp: number) => void
  back: () => void
  forward: () => void
}

const DEFAULT_CHR = 'chr1'
const DEFAULT_START = 11_800_000
const DEFAULT_END = 12_200_000

function applyRegion(
  state: GenomeState,
  clamped: GenomicRegion,
): Partial<GenomeState> {
  const newHistory = state.history.slice(0, state.historyIndex + 1)
  newHistory.push(clamped)
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  const newIndex = newHistory.length - 1

  return {
    chromosome: clamped.chromosome,
    start: clamped.start,
    end: clamped.end,
    history: newHistory,
    historyIndex: newIndex,
    canGoBack: newIndex > 0,
    canGoForward: false,
  }
}

const initialRegion: GenomicRegion = {
  chromosome: DEFAULT_CHR,
  start: DEFAULT_START,
  end: DEFAULT_END,
}

export const useGenomeStore = create<GenomeState>((set, get) => ({
  chromosome: DEFAULT_CHR,
  start: DEFAULT_START,
  end: DEFAULT_END,

  history: [initialRegion],
  historyIndex: 0,
  canGoBack: false,
  canGoForward: false,

  get region(): GenomicRegion {
    const { chromosome, start, end } = get()
    return { chromosome, start, end }
  },

  get chromosomeSize(): number {
    return HG38_CHROMOSOMES[get().chromosome] ?? 250_000_000
  },

  setRegion: (region: GenomicRegion) => {
    const state = get()
    const chromSize = HG38_CHROMOSOMES[region.chromosome] ?? 250_000_000
    const clamped = clampRegion(region, chromSize)
    set(applyRegion(state, clamped))
  },

  setChromosome: (chr: string) => {
    const size = HG38_CHROMOSOMES[chr]
    if (!size) return
    const state = get()
    const center = Math.round(size / 2)
    const halfSpan = Math.min(200_000, Math.round(size / 2))
    const clamped = { chromosome: chr, start: center - halfSpan, end: center + halfSpan }
    set(applyRegion(state, clamped))
  },

  zoom: (factor: number, center?: number) => {
    const state = get()
    const region = { chromosome: state.chromosome, start: state.start, end: state.end }
    const zoomed = zoomRegion(region, factor, center)
    const chromSize = HG38_CHROMOSOMES[state.chromosome] ?? 250_000_000
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

  back: () => {
    const state = get()
    if (state.historyIndex <= 0) return
    const newIndex = state.historyIndex - 1
    const target = state.history[newIndex]
    set({
      chromosome: target.chromosome,
      start: target.start,
      end: target.end,
      historyIndex: newIndex,
      canGoBack: newIndex > 0,
      canGoForward: true,
    })
  },

  forward: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const newIndex = state.historyIndex + 1
    const target = state.history[newIndex]
    set({
      chromosome: target.chromosome,
      start: target.start,
      end: target.end,
      historyIndex: newIndex,
      canGoBack: true,
      canGoForward: newIndex < state.history.length - 1,
    })
  },
}))
