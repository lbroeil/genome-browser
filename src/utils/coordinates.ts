import type { GenomicRegion } from '@/adapters/types'

// hg38 chromosome sizes
export const HG38_CHROMOSOMES: Record<string, number> = {
  chr1: 248956422,
  chr2: 242193529,
  chr3: 198295559,
  chr4: 190214555,
  chr5: 181538259,
  chr6: 170805979,
  chr7: 159345973,
  chr8: 145138636,
  chr9: 138394717,
  chr10: 133797422,
  chr11: 135086622,
  chr12: 133275309,
  chr13: 114364328,
  chr14: 107043718,
  chr15: 101991189,
  chr16: 90338345,
  chr17: 83257441,
  chr18: 80373285,
  chr19: 58617616,
  chr20: 64444167,
  chr21: 46709983,
  chr22: 50818468,
  chrX: 156040895,
  chrY: 57227415,
}

export const CHROMOSOME_LIST = Object.keys(HG38_CHROMOSOMES)

/**
 * Parse a region string like "chr1:1,000-2,000" or "chr1:1000-2000"
 */
export function parseRegion(input: string): GenomicRegion | null {
  const cleaned = input.replace(/,/g, '').trim()
  const match = cleaned.match(/^(chr[0-9XYM]+):(\d+)-(\d+)$/i)
  if (!match) {
    // Try just "chr1:1000" -> center on that position
    const posMatch = cleaned.match(/^(chr[0-9XYM]+):(\d+)$/i)
    if (posMatch) {
      const pos = parseInt(posMatch[2], 10)
      return {
        chromosome: posMatch[1],
        start: Math.max(0, pos - 500),
        end: pos + 500,
      }
    }
    return null
  }

  const chromosome = match[1]
  const start = parseInt(match[2], 10)
  const end = parseInt(match[3], 10)

  if (start >= end) return null

  return { chromosome, start, end }
}

export function formatRegion(region: GenomicRegion): string {
  return `${region.chromosome}:${formatNumber(region.start)}-${formatNumber(region.end)}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function regionWidth(region: GenomicRegion): number {
  return region.end - region.start
}

export function bpToPixel(bp: number, region: GenomicRegion, canvasWidth: number): number {
  return ((bp - region.start) / (region.end - region.start)) * canvasWidth
}

export function pixelToBp(px: number, region: GenomicRegion, canvasWidth: number): number {
  return region.start + (px / canvasWidth) * (region.end - region.start)
}

export function clampRegion(region: GenomicRegion, chromSize: number): GenomicRegion {
  const width = region.end - region.start
  let start = Math.max(0, region.start)
  let end = Math.min(chromSize, region.end)

  if (end - start < width) {
    if (start === 0) {
      end = Math.min(chromSize, start + width)
    } else {
      start = Math.max(0, end - width)
    }
  }

  return { chromosome: region.chromosome, start, end }
}

export function zoomRegion(region: GenomicRegion, factor: number, center?: number): GenomicRegion {
  const width = region.end - region.start
  const centerBp = center ?? (region.start + width / 2)
  const newWidth = width * factor
  const halfNew = newWidth / 2

  return {
    chromosome: region.chromosome,
    start: Math.round(centerBp - halfNew),
    end: Math.round(centerBp + halfNew),
  }
}

export function panRegion(region: GenomicRegion, deltaBp: number): GenomicRegion {
  return {
    chromosome: region.chromosome,
    start: region.start + deltaBp,
    end: region.end + deltaBp,
  }
}

/**
 * Generate nice tick positions for a coordinate axis
 */
export function generateTicks(start: number, end: number, maxTicks: number): number[] {
  const range = end - start
  const roughStep = range / maxTicks
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))

  let step: number
  const normalized = roughStep / magnitude
  if (normalized < 1.5) step = magnitude
  else if (normalized < 3.5) step = 2 * magnitude
  else if (normalized < 7.5) step = 5 * magnitude
  else step = 10 * magnitude

  const ticks: number[] = []
  const firstTick = Math.ceil(start / step) * step
  for (let t = firstTick; t <= end; t += step) {
    ticks.push(Math.round(t))
  }
  return ticks
}

/**
 * Format a bp position for axis labels (e.g., "1.5 Mb", "500 kb")
 */
export function formatBp(bp: number): string {
  if (bp >= 1_000_000) return `${(bp / 1_000_000).toFixed(bp % 1_000_000 === 0 ? 0 : 1)} Mb`
  if (bp >= 1_000) return `${(bp / 1_000).toFixed(bp % 1_000 === 0 ? 0 : 1)} kb`
  return `${bp} bp`
}

/**
 * Normalize a chromosome name to the "chr" prefix format used by UCSC/hg38.
 * Converts Ensembl-style names (1, 2, X, MT) to UCSC-style (chr1, chr2, chrX, chrM).
 */
export function normalizeChromosomeName(chr: string): string {
  if (chr.startsWith('chr')) return chr
  if (chr.toUpperCase() === 'MT') return 'chrM'
  if (/^(\d+|X|Y|M)$/i.test(chr)) return 'chr' + chr
  return chr
}

/**
 * Map a chromosome name to the format used by a specific adapter's reference names.
 * Handles chr1 <-> 1 and chrM <-> MT mismatches.
 */
export function mapChromosomeName(chromosome: string, refNames: string[]): string | null {
  if (refNames.includes(chromosome)) return chromosome
  if (chromosome.startsWith('chr')) {
    const withoutChr = chromosome.slice(3)
    if (refNames.includes(withoutChr)) return withoutChr
    if (chromosome === 'chrM' && refNames.includes('MT')) return 'MT'
  } else {
    const withChr = 'chr' + chromosome
    if (refNames.includes(withChr)) return withChr
    if (chromosome.toUpperCase() === 'MT' && refNames.includes('chrM')) return 'chrM'
  }
  return null
}
