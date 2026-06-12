import type { GenomicAdapter, CoverageBin, GenomicFeature } from '@/adapters/types'
import type { TranscriptCoordinateMapper } from './TranscriptCoordinateMapper'
import { reverseComplement } from './translation'
import { mapChromosomeName } from './coordinates'

/**
 * Fetch coverage data from an adapter and remap it to transcript coordinates
 * with per-bin reading frame tags.
 */
export async function fetchTranscriptCoverage(
  adapter: GenomicAdapter,
  mapper: TranscriptCoordinateMapper,
  txStart: number,
  txEnd: number,
  pixelWidth: number,
): Promise<CoverageBin[]> {
  if (!adapter.getCoverage) return []

  const genomicRegions = mapper.getGenomicRegionsForTranscriptRange(txStart, txEnd)
  if (genomicRegions.length === 0) return []

  const refNames = await adapter.getRefNames()
  const allBins: CoverageBin[] = []

  for (const region of genomicRegions) {
    const mappedChr = mapChromosomeName(region.chromosome, refNames)
    if (!mappedChr) continue
    const queryRegion = { ...region, chromosome: mappedChr }
    const regionBp = region.end - region.start
    // Allocate bins proportionally to the region's share of the transcript viewport
    const regionBins = Math.max(1, Math.round(pixelWidth * (regionBp / (txEnd - txStart))))
    const bins = await adapter.getCoverage(queryRegion, regionBins)

    for (const bin of bins) {
      const txPos = mapper.genomicToTranscript(bin.start)
      if (txPos === null) continue

      const binLen = bin.end - bin.start
      // For minus strand, the transcript end is at a lower transcript position
      let txBinEnd: number
      if (mapper.strand === '-') {
        // bin.end - 1 is the last base; map it and the range goes from there to txPos
        const txEnd2 = mapper.genomicToTranscript(bin.end - 1)
        if (txEnd2 !== null) {
          txBinEnd = Math.max(txPos, txEnd2) + 1
        } else {
          txBinEnd = txPos + binLen
        }
      } else {
        txBinEnd = txPos + binLen
      }

      allBins.push({
        start: Math.min(txPos, txBinEnd - 1),
        end: Math.max(txPos + 1, txBinEnd),
        value: bin.value,
        frame: mapper.getFrame(bin.start) ?? 0,
      })
    }
  }

  return allBins.sort((a, b) => a.start - b.start)
}

/**
 * Fetch the spliced transcript sequence for a transcript range.
 * Fetches each exonic segment from the adapter, concatenates in transcript order,
 * and reverse-complements for minus-strand transcripts.
 */
export async function fetchTranscriptSequence(
  adapter: GenomicAdapter,
  mapper: TranscriptCoordinateMapper,
  txStart: number,
  txEnd: number,
): Promise<string> {
  if (!adapter.getSequence) return ''

  const genomicRegions = mapper.getGenomicRegionsForTranscriptRange(txStart, txEnd)
  if (genomicRegions.length === 0) return ''

  const refNames = await adapter.getRefNames()
  const segments: string[] = []
  for (const region of genomicRegions) {
    const mappedChr = mapChromosomeName(region.chromosome, refNames)
    if (!mappedChr) continue
    const seq = await adapter.getSequence({ ...region, chromosome: mappedChr })
    segments.push(seq)
  }

  let spliced = segments.join('')

  if (mapper.strand === '-') {
    spliced = reverseComplement(spliced)
  }

  return spliced
}

/**
 * Remap annotation features to transcript coordinates.
 * Features that don't overlap the mapper's exons are excluded.
 */
export function remapFeaturesToTranscript(
  features: GenomicFeature[],
  mapper: TranscriptCoordinateMapper,
): GenomicFeature[] {
  const result: GenomicFeature[] = []

  for (const feature of features) {
    const txStart = mapper.genomicToTranscript(feature.start)
    const txEnd = mapper.genomicToTranscript(Math.max(feature.start, feature.end - 1))

    if (txStart === null && txEnd === null) continue

    const start = txStart ?? 0
    const end = (txEnd ?? mapper.txLength - 1) + 1

    result.push({
      ...feature,
      chromosome: 'tx',
      start: Math.min(start, end),
      end: Math.max(start, end),
    })
  }

  return result
}
