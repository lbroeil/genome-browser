import { useEffect } from 'react'
import { useTrackStore } from '@/store/trackStore'
import { UcscSequenceAdapter } from '@/adapters/UcscSequenceAdapter'

/**
 * Ensures the built-in hg38 sequence / translation track is present.
 * Used by both the full Browser shell and the curation view so both
 * get the sequence track on first mount. Idempotent.
 */
export function useEnsureSequenceTrack() {
  const addTrack = useTrackStore((s) => s.addTrack)

  useEffect(() => {
    if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return

    const adapter = new UcscSequenceAdapter()
    adapter.initialize().then(() => {
      // Re-check after async init — React StrictMode runs effects twice,
      // so both can pass the sync check before either finishes.
      if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return
      addTrack({
        id: 'hg38-sequence',
        name: 'hg38 Sequence / Translation',
        type: 'sequence',
        adapter,
        height: 160,
        color: '#6366f1',
        visible: true,
        settings: {},
      })
    })
  }, [addTrack])
}
