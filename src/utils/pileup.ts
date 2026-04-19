export interface PileupItem<T> {
  feature: T
  row: number
  start: number
  end: number
}

/**
 * Greedy interval scheduling algorithm for read layout.
 * Assigns each feature to the first row where it fits without overlap.
 */
export function computePileup<T>(
  features: T[],
  getStart: (f: T) => number,
  getEnd: (f: T) => number,
  gap = 2,
): PileupItem<T>[] {
  const sorted = [...features].sort((a, b) => getStart(a) - getStart(b))
  const rowEnds: number[] = []
  const items: PileupItem<T>[] = []

  for (const feature of sorted) {
    const start = getStart(feature)
    const end = getEnd(feature)

    let row = 0
    while (row < rowEnds.length && rowEnds[row] + gap > start) {
      row++
    }
    if (row >= rowEnds.length) rowEnds.push(-Infinity)
    rowEnds[row] = end

    items.push({ feature, row, start, end })
  }

  return items
}

/**
 * Compute coverage histogram from features
 */
export function computeCoverage<T>(
  features: T[],
  getStart: (f: T) => number,
  getEnd: (f: T) => number,
  regionStart: number,
  regionEnd: number,
  bins: number,
): number[] {
  const binSize = (regionEnd - regionStart) / bins
  const coverage = new Array(bins).fill(0)

  for (const f of features) {
    const fStart = Math.max(getStart(f), regionStart)
    const fEnd = Math.min(getEnd(f), regionEnd)

    const startBin = Math.max(0, Math.floor((fStart - regionStart) / binSize))
    const endBin = Math.min(bins - 1, Math.floor((fEnd - regionStart) / binSize))

    for (let i = startBin; i <= endBin; i++) {
      coverage[i]++
    }
  }

  return coverage
}
