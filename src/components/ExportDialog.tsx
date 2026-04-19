import { useState } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useTrackStore } from '@/store/trackStore'
import { renderCoverageSvg, type SvgCoverageDisplayMode } from '@/renderers/svg/SvgCoverageRenderer'
import { renderAnnotationSvg, type SvgAnnotationDisplayMode } from '@/renderers/svg/SvgAnnotationRenderer'
import { renderAlignmentSvg } from '@/renderers/svg/SvgAlignmentRenderer'
import { renderVariantSvg } from '@/renderers/svg/SvgVariantRenderer'
import { renderSequenceSvg } from '@/renderers/svg/SvgSequenceRenderer'
import type { TranslationStrand } from '@/renderers/canvas/CanvasSequenceRenderer'
import { composeSvg, svgToString, downloadSvg, downloadPng } from '@/export/SvgComposer'
import { mapChromosomeName } from '@/utils/coordinates'

type ExportFormat = 'svg' | 'png'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { chromosome, start, end } = useGenomeStore()
  const tracks = useTrackStore((s) => s.tracks)
  const [format, setFormat] = useState<ExportFormat>('svg')
  const [width, setWidth] = useState(800)
  const [labelWidth, setLabelWidth] = useState(120)
  const [scale, setScale] = useState(2)
  const [exporting, setExporting] = useState(false)

  const region = { chromosome, start, end }

  const handleExport = async () => {
    setExporting(true)
    try {
      const trackElements: { element: SVGGElement; height: number; name: string }[] = []
      const dataWidth = width - labelWidth

      for (const track of tracks) {
        if (!track.visible) continue

        // Map chromosome name for this adapter
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
          const annMode = (track.settings.displayMode as SvgAnnotationDisplayMode) ?? 'collapsed'
          const strandColors = track.settings.forwardColor && track.settings.reverseColor
            ? { forward: track.settings.forwardColor as string, reverse: track.settings.reverseColor as string }
            : undefined
          const element = renderAnnotationSvg(features, region, dataWidth, track.height, track.color, track.name, annMode, strandColors)
          trackElements.push({ element, height: track.height, name: track.name })
        }
      }

      const svg = composeSvg({
        width,
        trackElements,
        region,
        labelWidth,
      })

      const regionStr = `${chromosome}_${start}-${end}`

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg border border-border shadow-lg p-6 w-96"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Export Figure</h2>

        <div className="space-y-4">
          {/* Format */}
          <div>
            <label className="text-sm font-medium block mb-1">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('svg')}
                className={`flex-1 h-8 rounded border text-sm transition-colors ${
                  format === 'svg'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                }`}
              >
                SVG
              </button>
              <button
                onClick={() => setFormat('png')}
                className={`flex-1 h-8 rounded border text-sm transition-colors ${
                  format === 'png'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                }`}
              >
                PNG
              </button>
            </div>
          </div>

          {/* Width */}
          <div>
            <label className="text-sm font-medium block mb-1">Total width (px)</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value) || 800)}
              className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              min={200}
              max={4000}
            />
          </div>

          {/* Label sidebar width */}
          <div>
            <label className="text-sm font-medium block mb-1">Label sidebar width (px)</label>
            <input
              type="number"
              value={labelWidth}
              onChange={(e) => setLabelWidth(parseInt(e.target.value) || 120)}
              className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              min={0}
              max={300}
            />
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

          {/* Tracks */}
          <div>
            <label className="text-sm font-medium block mb-1">
              Tracks ({tracks.filter((t) => t.visible).length} visible)
            </label>
            <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
              {tracks.map((track) => (
                <div key={track.id} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: track.visible ? track.color : '#ccc' }}
                  />
                  <span className={track.visible ? '' : 'line-through opacity-50'}>
                    {track.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          {format === 'svg' && (
            <p className="text-xs text-muted-foreground">
              SVG exports have clean, semantic layer grouping. Open in Inkscape or Illustrator
              to edit individual elements.
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
            disabled={exporting || tracks.filter((t) => t.visible).length === 0}
            className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
