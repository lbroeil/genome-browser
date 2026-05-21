import { create } from 'zustand'
import type { TranscriptCoordinateMapper } from '@/utils/TranscriptCoordinateMapper'

interface CdsRange {
  txStart: number
  txEnd: number
}

interface TranscriptViewState {
  active: boolean
  mapper: TranscriptCoordinateMapper | null
  featureId: string | null
  featureName: string | null
  txStart: number
  txEnd: number
  cdsRange: CdsRange | null

  enter: (mapper: TranscriptCoordinateMapper, featureId: string, name: string, cds?: CdsRange) => void
  exit: () => void
  setTxRegion: (start: number, end: number) => void
  panTx: (deltaTx: number) => void
  zoomTx: (factor: number, center?: number) => void
}

export const useTranscriptViewStore = create<TranscriptViewState>((set, get) => ({
  active: false,
  mapper: null,
  featureId: null,
  featureName: null,
  txStart: 0,
  txEnd: 0,
  cdsRange: null,

  enter: (mapper, featureId, name, cds) => {
    set({
      active: true,
      mapper,
      featureId,
      featureName: name,
      txStart: 0,
      txEnd: mapper.txLength,
      cdsRange: cds ?? null,
    })
  },

  exit: () => {
    set({
      active: false,
      mapper: null,
      featureId: null,
      featureName: null,
      txStart: 0,
      txEnd: 0,
      cdsRange: null,
    })
  },

  setTxRegion: (start, end) => {
    const { mapper } = get()
    if (!mapper) return
    const cStart = Math.max(0, start)
    const cEnd = Math.min(mapper.txLength, end)
    if (cEnd - cStart < 10) return
    set({ txStart: cStart, txEnd: cEnd })
  },

  panTx: (deltaTx) => {
    const { mapper, txStart, txEnd } = get()
    if (!mapper) return
    const span = txEnd - txStart
    let newStart = txStart + deltaTx
    let newEnd = txEnd + deltaTx
    if (newStart < 0) { newStart = 0; newEnd = span }
    if (newEnd > mapper.txLength) { newEnd = mapper.txLength; newStart = newEnd - span }
    set({ txStart: Math.max(0, newStart), txEnd: Math.min(mapper.txLength, newEnd) })
  },

  zoomTx: (factor, center) => {
    const { mapper, txStart, txEnd } = get()
    if (!mapper) return
    const span = txEnd - txStart
    const c = center ?? (txStart + txEnd) / 2
    const newSpan = span * factor
    if (newSpan < 10 || newSpan > mapper.txLength) return
    const ratio = (c - txStart) / span
    let newStart = Math.round(c - newSpan * ratio)
    let newEnd = Math.round(c + newSpan * (1 - ratio))
    if (newStart < 0) { newStart = 0; newEnd = Math.round(newSpan) }
    if (newEnd > mapper.txLength) { newEnd = mapper.txLength; newStart = Math.round(newEnd - newSpan) }
    set({ txStart: Math.max(0, newStart), txEnd: Math.min(mapper.txLength, newEnd) })
  },
}))
