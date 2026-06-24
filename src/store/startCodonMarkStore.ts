import { create } from 'zustand'

interface StartCodonMarkState {
  enabled: boolean
  position: number | null
  setEnabled: (on: boolean) => void
  setPosition: (pos: number | null) => void
  reset: () => void
}

export const useStartCodonMarkStore = create<StartCodonMarkState>((set) => ({
  enabled: false,
  position: null,
  setEnabled: (on) => set({ enabled: on, position: on ? null : null }),
  setPosition: (pos) => set({ position: pos }),
  reset: () => set({ enabled: false, position: null }),
}))
