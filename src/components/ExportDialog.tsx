import { useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useTrackStore } from '@/store/trackStore'
import { useTranscriptViewStore } from '@/store/transcriptViewStore'
import { renderCoverageSvg, type SvgCoverageDisplayMode } from '@/renderers/svg/SvgCoverageRenderer'
import { renderAnnotationSvg, type SvgAnnotationDisplayMode } from '@/renderers/svg/SvgAnnotationRenderer'
import { renderAlignmentSvg } from '@/renderers/svg/SvgAlignmentRenderer'
import { renderVariantSvg } from '@/renderers/svg/SvgVariantRenderer'
import { renderSequenceSvg } from '@/renderers/svg/SvgSequenceRenderer'
import type { TranslationStrand } from '@/renderers/canvas/CanvasSequenceRenderer'
import { composeSvg, svgToString, downloadSvg, downloadPng, type ComposerOptions } from '@/export/SvgComposer'
import { mapChromosomeName } from '@/utils/coordinates'
import { fetchTranscriptCoverage } from '@/utils/transcriptData'

type ExportFormat = 'svg' | 'png'

export interface ExportSettings {
  fontFamily: string
  fontSize: number
  showLabels: boolean
  showScaleBar: boolean
  showLegends: boolean
  highlightStart?: number
  highlightEnd?: number
  highlightColor: string
}

const FONT_OPTIONS = [
  'Arial, Helvetica, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Times New Roman, Times, serif',
  'Georgia, serif',
]

const FONT_LABELS: Record<string, string> = {
  'Arial, Helvetica, sans-serif': 'Arial',
  'Helvetica, Arial, sans-serif': 'Helvetica',
  'Times New Roman, Times, serif': 'Times New Roman',
  'Georgia, serif': 'Georgia',
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { chromosome, start, end } = useGenomeStore()
  const tracks = useTrackStore((s) => s.tracks)
  const txActive = useTranscriptViewStore((s) => s.active)
  const txMapper = useTranscriptViewStore((s) => s.mapper)
  const txStart = useTranscriptViewStore((s) => s.txStart)
  const txEnd = useTranscriptViewStore((s) => s.txEnd)
  const txFeatureName = useTranscriptViewStore((s) => s.featureName)
  const [format, setFormat] = useState<ExportFormat>('svg')
  const [width, setWidth] = useState(800)
  const [labelWidth, setLabelWidth] = useState(120)
  const [scale, setScale] = useState(2)
  const [exporting, setExporting] = useState(false)

  // A1: Track selection
  const [exportTracks, setExportTracks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tracks.map((t) => [t.id, t.visible])),
  )

  // A4: Font and style settings
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0])
  const [fontSize, setFontSize] = useState(1.0)
  const [showLabels, setShowLabels] = useState(true)

  // A2: Legends and scale bar
  const [showScaleBar, setShowScaleBar] = useState(true)
  const [showLegends, setShowLegends] = useState(true)

  // A3: Highlight region
  const [highlightEnabled, setHighlightEnabled] = useState(false)
  const [highlightStart, setHighlightStart] = useState('')
  const [highlightEnd, setHighlightEnd] = useState('')
  const [highlightColor, setHighlightColor] = useState('#fbbf2440')

  const region = { chromosome, start, end }
  const effectiveRegion = txActive && txMapper
    ? { chromosome: 'tx', start: txStart, end: txEnd }
    : region

  const toggleTrack = (id: string) => {
    setExportTracks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const trackElements: { element: SVGGElement; height: number; name: string }[] = []
      const dataWidth = width - labelWidth
      const selectedTracks = tracks.filter((t) => exportTracks[t.id])

      for (const track of selectedTracks) {
        if (txActive && txMapper) {
          if (track.type === 'coverage' && track.adapter.getCoverage) {
            const txSpan = txEnd - txStart
            const numBins = txSpan <= 5000 ? txSpan : dataWidth
            const bins = await fetchTranscriptCoverage(track.adapter, txMapper, txStart, txEnd, numBins)
            const element = renderCoverageSvg(bins, effectiveRegion, dataWidth, track.height, track.color, track.name, 'frame')
            trackElements.push({ element, height: track.height, name: track.name })
          }
          continue
        }

        const refNames = await track.adapter.getRefNames()
        const mappedChr = mapChromosomeName(region.chromosome, refNames)
        if (!mappedChr) continue
        const queryRegion = { ...region, chromosome: mappedChr }

        if (track.type === 'coverage' && track.adapter.getCoverage) {
          const covMode = (track.settings.displayMode as SvgCoverageDisplayMode) ?? 'area'
          const viewportBp = queryRegion.end - queryRegion.start
          const numBins = covMode === 'frame' && viewportBp <= 5000 ? viewportBp : dataWidth
          const bins = await track.adapter.getCoverage(queryRegion, numBins)
          const element = renderCoverageSvg(bins, region, dataWidth, track.height, track.color, track.name, covMode)
          trackElements.push({ element, height: track.height, name: track.name })
        } else if (track.type === 'alignment') {
          const [features, bins] = await Promise.all([
            track.adapter.getFeatures(queryRegion),
            track.adapter.getCoverage?.(queryRegion, dataWidth) ?? Promise.resolve([]),
          ])
          const element = renderAlignmentSvg(features, bins, region, dataWidth, track.height, track.color, track.name)
          trackElements.push({ element, height: track.height, name: track.name })
        } else if (track.type === 'variant') {
          const features = await track.adapter.getFeatures(queryRegion)
          const element = renderVariantSvg(features, region, dataWidth, track.height, track.color, track.name)
          trackElements.push({ element, height: track.height, name: track.name })
        } else if (track.type === 'sequence' && track.adapter.getSequence) {
          const viewportBp = queryRegion.end - queryRegion.start
          const seq = viewportBp <= 600 ? await track.adapter.getSequence(queryRegion) : ''
          const seqStrand = (track.settings.translationStrand as TranslationStrand) ?? 'forward'
          const element = renderSequenceSvg(seq, region, dataWidth, track.height, track.name, seqStrand)
          trackElements.push({ element, height: track.height, name: track.name })
        } else if (track.type === 'annotation' || track.type === 'gene_model') {
          const features = await track.adapter.getFeatures(queryRegion)
          const annMode = (track.settings.displayMode as SvgAnnotationDisplayMode) ?? 'expanded'
          const strandColors = track.settings.forwardColor && track.settings.reverseColor
            ? { forward: track.settings.forwardColor as string, reverse: track.settings.reverseColor as string }
            : undefined
          const element = renderAnnotationSvg(features, region, dataWidth, track.height, track.color, track.name, annMode, strandColors)
          trackElements.push({ element, height: track.height, name: track.name })
        }
      }

      const composerOpts: ComposerOptions = {
        width,
        trackElements,
        region: effectiveRegion,
        labelWidth: showLabels ? labelWidth : 0,
        fontFamily,
        fontScale: fontSize,
        showScaleBar,
        showLegends,
        highlight: highlightEnabled && highlightStart && highlightEnd
          ? { start: parseInt(highlightStart, 10), end: parseInt(highlightEnd, 10), color: highlightColor }
          : undefined,
      }

      const svg = composeSvg(composerOpts)

      const regionStr = txActive && txFeatureName
        ? `transcript_${txFeatureName.replace(/[^a-zA-Z0-9]/g, '_')}_${txStart}-${txEnd}`
        : `${chromosome}_${start}-${end}`

      if (format === 'svg') {
        const svgString = svgToString(svg)
        downloadSvg(svgString, `genome-browser_${regionStr}.svg`)
      } else {
        downloadPng(svg, `genome-browser_${regionStr}.png`, scale)
      }
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const selectedCount = Object.values(exportTracks).filter(Boolean).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg border border-border shadow-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Export Figure</h2>

        <div className="space-y-4">
          {/* Format */}
          <div>
            <label className="text-sm font-medium block mb-1">Format</label>
            <div className="flex gap-2">
              {(['svg', 'png'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 h-8 rounded border text-sm transition-colors ${
                    format === f
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Width (px)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 800)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                min={200}
                max={4000}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Sidebar (px)</label>
              <input
                type="number"
                value={labelWidth}
                onChange={(e) => setLabelWidth(parseInt(e.target.value) || 120)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                min={0}
                max={300}
              />
            </div>
          </div>

          {/* Scale (PNG only) */}
          {format === 'png' && (
            <div>
              <label className="text-sm font-medium block mb-1">
                Scale (DPI: {Math.round(96 * scale)})
              </label>
              <select
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              >
                <option value={1}>1x (96 DPI)</option>
                <option value={2}>2x (192 DPI)</option>
                <option value={3}>3x (288 DPI)</option>
                <option value={4}>4x (384 DPI - publication)</option>
              </select>
            </div>
          )}

          {/* A4: Font and style */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Font</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>{FONT_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Font scale</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(parseFloat(e.target.value))}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              >
                <option value={0.8}>Small (0.8x)</option>
                <option value={1.0}>Normal (1x)</option>
                <option value={1.2}>Large (1.2x)</option>
                <option value={1.5}>Extra large (1.5x)</option>
              </select>
            </div>
          </div>

          {/* A2 + A4: Toggles */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded"
              />
              Track labels
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={showScaleBar}
                onChange={(e) => setShowScaleBar(e.target.checked)}
                className="rounded"
              />
              Scale bar
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={showLegends}
                onChange={(e) => setShowLegends(e.target.checked)}
                className="rounded"
              />
              Legends
            </label>
          </div>

          {/* A3: Highlight region */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium mb-1">
              <input
                type="checkbox"
                checked={highlightEnabled}
                onChange={(e) => setHighlightEnabled(e.target.checked)}
                className="rounded"
              />
              Highlight region
            </label>
            {highlightEnabled && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={highlightStart}
                  onChange={(e) => setHighlightStart(e.target.value)}
                  placeholder="Start (bp)"
                  className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs font-mono"
                />
                <span className="text-xs text-muted-foreground">-</span>
                <input
                  type="text"
                  value={highlightEnd}
                  onChange={(e) => setHighlightEnd(e.target.value)}
                  placeholder="End (bp)"
                  className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs font-mono"
                />
                <input
                  type="color"
                  value={highlightColor.slice(0, 7)}
                  onChange={(e) => setHighlightColor(e.target.value + '40')}
                  className="w-7 h-7 rounded border border-input cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* A1: Track selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">
                Tracks ({selectedCount} selected)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportTracks(Object.fromEntries(tracks.map((t) => [t.id, true])))}
                  className="text-xs text-primary hover:underline"
                >
                  All
                </button>
                <button
                  onClick={() => setExportTracks(Object.fromEntries(tracks.map((t) => [t.id, false])))}
                  className="text-xs text-primary hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="space-y-0.5 max-h-40 overflow-y-auto border border-border rounded p-1">
              {tracks.map((track) => (
                <label
                  key={track.id}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent/50 cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={exportTracks[track.id] ?? false}
                    onChange={() => toggleTrack(track.id)}
                    className="rounded"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: track.color }}
                  />
                  <span className={exportTracks[track.id] ? '' : 'opacity-50'}>
                    {track.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {format === 'svg' && (
            <p className="text-xs text-muted-foreground">
              SVG exports have semantic layer grouping — open in Inkscape or Illustrator to edit elements.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded border border-input bg-background text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedCount === 0}
            className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
