import { useEffect } from 'react'
import { useTrackStore } from '@/store/trackStore'
import { UcscSequenceAdapter } from '@/adapters/UcscSequenceAdapter'

/**
 * Ensure the built-in hg38 sequence / translation track is present.
 * Idempotent and safe to call multiple times (e.g. after a session restore).
 */
export async function ensureSequenceTrack(): Promise<void> {
  if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return

  const adapter = new UcscSequenceAdapter()
  await adapter.initialize()
  // Re-check after async init — React StrictMode runs effects twice, so both
  // can pass the sync check before either finishes.
  if (useTrackStore.getState().tracks.some((t) => t.id === 'hg38-sequence')) return
  useTrackStore.getState().addTrack({
    id: 'hg38-sequence',
    name: 'hg38 Sequence / Translation',
    type: 'sequence',
    adapter,
    height: 160,
    color: '#6366f1',
    visible: true,
    settings: {},
  })
}

/** Hook wrapper: ensures the hg38 sequence track on first mount. */
export function useEnsureSequenceTrack() {
  useEffect(() => {
    void ensureSequenceTrack()
  }, [])
}
