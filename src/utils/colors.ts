// Strand colors
export const STRAND_COLORS = {
  forward: '#4285f4', // blue
  reverse: '#ea4335', // red
  unknown: '#9e9e9e', // grey
} as const

// Nucleotide colors
export const NUCLEOTIDE_COLORS: Record<string, string> = {
  A: '#22c55e', // green
  T: '#ef4444', // red
  C: '#3b82f6', // blue
  G: '#f59e0b', // amber
  N: '#9ca3af', // grey
}

// Variant type colors
export const VARIANT_COLORS = {
  SNV: '#3b82f6',
  INS: '#22c55e',
  DEL: '#ef4444',
  MNV: '#8b5cf6',
  OTHER: '#9ca3af',
} as const

// Track default colors
export const TRACK_COLORS = {
  coverage: '#6366f1', // indigo
  annotation: '#0ea5e9', // sky
  gene: '#8b5cf6', // violet
  variant: '#f97316', // orange
} as const

// Reading frame colors for Ribo-seq p-site visualization
export const FRAME_COLORS = ['#e74c3c', '#2ecc71', '#3498db'] as const // Frame 0: red, 1: green, 2: blue

// Colorblind-safe palette (Wong 2011)
export const COLORBLIND_SAFE = [
  '#000000',
  '#E69F00',
  '#56B4E9',
  '#009E73',
  '#F0E442',
  '#0072B2',
  '#D55E00',
  '#CC79A7',
] as const

export function qualityToOpacity(quality: number, maxQuality = 60): number {
  return Math.max(0.2, Math.min(1, quality / maxQuality))
}

/** Darken a #rrggbb hex color by `amount` (0–1). Used to set CDS apart from UTR. */
export function darken(hex: string, amount = 0.3): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const f = Math.max(0, Math.min(1, 1 - amount))
  const r = Math.round(((n >> 16) & 0xff) * f)
  const g = Math.round(((n >> 8) & 0xff) * f)
  const b = Math.round((n & 0xff) * f)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
