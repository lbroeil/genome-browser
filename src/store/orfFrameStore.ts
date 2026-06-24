import { create } from 'zustand'

/**
 * Genomic coding anchor for the ORF currently under review, so generic tracks
 * (hg38 sequence/translation, P-site coverage) can be coloured relative to the
 * ORF's reading frame in *genomic* view. Transcript view already carries the
 * ORF coding region as `cdsRange` in transcriptViewStore, so this store is only
 * consulted in genomic view. Empty outside the curation flow — a no-op then.
 */
export interface OrfGenomicAnchor {
  chromosome: string
  /** Genomic start of the coding region, inclusive (thickStart). */
  codingStart: number
  /** Genomic end of the coding region, exclusive (thickEnd). */
  codingEnd: number
  strand: '+' | '-'
}

interface OrfFrameState {
  anchor: OrfGenomicAnchor | null
  setAnchor: (anchor: OrfGenomicAnchor | null) => void
}

export const useOrfFrameStore = create<OrfFrameState>((set) => ({
  anchor: null,
  setAnchor: (anchor) => set({ anchor }),
}))
