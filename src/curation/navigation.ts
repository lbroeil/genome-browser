import { useGenomeStore } from '@/store/genomeStore'
import { useTranscriptViewStore } from '@/store/transcriptViewStore'
import { TranscriptCoordinateMapper } from '@/utils/TranscriptCoordinateMapper'
import { orfToFeature } from './OrfListAdapter'
import type { CuratedOrf } from './api'

const FLANK_FRACTION = 0.2     // padding around the whole ORF
const CODON_WINDOW = 60        // bp shown on each side of a start/stop codon
const MIN_PAD = 20

function hasCoords(orf: CuratedOrf): orf is CuratedOrf & { chromosome: string; start: number; stop: number } {
  return !!orf.chromosome && orf.start != null && orf.stop != null
}

/** Does this ORF have >1 exon (spliced)? Transcript view is only meaningful then. */
export function hasSplicedStructure(orf: CuratedOrf): boolean {
  const blocks = (orf.block_sizes ?? '').split(',').filter((x) => x.trim().length > 0)
  return blocks.length > 1
}

/** Land on the whole ORF with flanking padding (the default curation view). */
export function viewWholeOrf(orf: CuratedOrf): void {
  if (!hasCoords(orf)) return
  useTranscriptViewStore.getState().exit()
  const span = Math.max(1, orf.stop - orf.start)
  const pad = Math.max(MIN_PAD, Math.round(span * FLANK_FRACTION))
  useGenomeStore.getState().setRegion({
    chromosome: orf.chromosome,
    start: orf.start - pad,
    end: orf.stop + pad,
  })
}

function centerWindow(chromosome: string, pos: number): void {
  useTranscriptViewStore.getState().exit()
  useGenomeStore.getState().setRegion({
    chromosome,
    start: pos - CODON_WINDOW,
    end: pos + CODON_WINDOW,
  })
}

/** Zoom to the start codon (strand-aware: 5' end of the ORF). */
export function viewStartCodon(orf: CuratedOrf): void {
  if (!hasCoords(orf)) return
  const pos = orf.strand === '-' ? orf.stop : orf.start
  centerWindow(orf.chromosome, pos)
}

/** Zoom to the stop codon (strand-aware: 3' end of the ORF). */
export function viewStopCodon(orf: CuratedOrf): void {
  if (!hasCoords(orf)) return
  const pos = orf.strand === '-' ? orf.start : orf.stop
  centerWindow(orf.chromosome, pos)
}

/** Enter the spliced transcript view for this ORF, with the CDS frame bar. */
export function enterTranscriptView(orf: CuratedOrf): void {
  const feature = orfToFeature(orf)
  const mapper = TranscriptCoordinateMapper.fromBed12(feature)

  let cds: { txStart: number; txEnd: number } | undefined
  if (orf.thick_start != null && orf.thick_stop != null) {
    const a = mapper.genomicToTranscript(orf.thick_start)
    const b = mapper.genomicToTranscript(orf.thick_stop - 1)
    if (a != null && b != null) cds = { txStart: Math.min(a, b), txEnd: Math.max(a, b) + 1 }
  }

  useTranscriptViewStore.getState().enter(mapper, feature.id, orf.name, cds)
}

export function zoomOut(): void {
  useGenomeStore.getState().zoom(1.6)
}

export function zoomIn(): void {
  useGenomeStore.getState().zoom(0.625)
}
