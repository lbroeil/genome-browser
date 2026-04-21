import { create } from 'zustand'

interface CrosshairState {
  enabled: boolean
  x: number | null // pixel x relative to the track/ruler container
  toggle: () => void
  setX: (x: number | null) => void
}

export const useCrosshairStore = create<CrosshairState>((set) => ({
  enabled: false,
  x: null,
  toggle: () => set((s) => ({ enabled: !s.enabled, x: null })),
  setX: (x) => set({ x }),
}))
