import { useEffect, useCallback } from 'react'

const STORAGE_KEY = 'curation_help_seen'

function hasSeenHelp(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function markSeen(): void {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
}

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dismiss = useCallback(() => { markSeen(); onClose() }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={dismiss}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-[640px] max-h-[85vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">ORF Curation Guide</h2>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
        </div>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">What you're looking at</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Each card shows a candidate open reading frame (ORF) detected from ribosome profiling (Ribo-seq) data,
            displayed over GENCODE gene models. Your job is to judge whether the ORF is likely real
            (actively translated) or a false positive.
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">What to evaluate</h3>
          <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc ml-4">
            <li><strong>3-nucleotide periodicity</strong> &mdash; Real translation produces P-site peaks every 3 bases (one per codon), mostly in the first reading frame.</li>
            <li><strong>Frame consistency</strong> &mdash; In frame-colored mode, a translated ORF should show a dominant single color (green = in-frame) rather than a mix.</li>
            <li><strong>Start / stop codon signal</strong> &mdash; Look for a sharp increase at the start codon and drop-off at the stop codon.</li>
            <li><strong>Coverage level</strong> &mdash; Some signal is needed; complete absence <em>may</em> indicate low mappability rather than non-translation &mdash; check the Mappability track.</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Voting</h3>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p><span className="inline-block w-14 font-medium text-green-600">Good</span> The ORF looks real &mdash; clear periodicity and frame signal.</p>
            <p><span className="inline-block w-14 font-medium text-red-600">Bad</span> Likely a false positive &mdash; no clear translation evidence.</p>
            <p><span className="inline-block w-14 font-medium text-foreground">Skip</span> Unsure or not enough data to judge &mdash; defer for now.</p>
            <p className="pt-1">Use the <strong>Uncertain</strong> toggle when you lean one way but aren't confident. This records your certainty level alongside the decision.</p>
            <p>Check <strong>"start codon may be wrong"</strong> if the ORF looks real but the annotated start position seems off. You can then click on the track to mark where you think the real start is.</p>
          </div>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Keyboard shortcuts</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Vote Good</span><kbd className="font-mono bg-secondary px-1.5 rounded">D</kbd> or <kbd className="font-mono bg-secondary px-1.5 rounded">&rarr;</kbd></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vote Bad</span><kbd className="font-mono bg-secondary px-1.5 rounded">A</kbd> or <kbd className="font-mono bg-secondary px-1.5 rounded">&larr;</kbd></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Skip</span><kbd className="font-mono bg-secondary px-1.5 rounded">S</kbd> or <kbd className="font-mono bg-secondary px-1.5 rounded">&darr;</kbd></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Undo last vote</span><kbd className="font-mono bg-secondary px-1.5 rounded">Z</kbd> or <kbd className="font-mono bg-secondary px-1.5 rounded">Backspace</kbd></div>
          </div>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Navigation & controls</h3>
          <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc ml-4">
            <li><strong>Pan</strong> &mdash; Click and drag on the track area.</li>
            <li><strong>Zoom</strong> &mdash; Scroll wheel, or use the +/&minus; buttons. <strong>Shift + drag</strong> to zoom into a specific region.</li>
            <li><strong>View modes</strong> &mdash; Switch between Whole ORF, Start codon, Stop codon, and Transcript view (multi-exon only).</li>
            <li><strong>Crosshair</strong> &mdash; Toggle a vertical guide line to align P-sites with exact codon positions.</li>
            <li><strong>Strand filter</strong> &mdash; Hides P-site tracks from the opposite strand for cleaner viewing.</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Tips</h3>
          <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc ml-4">
            <li>For multi-exon ORFs, always check the <strong>Transcript view</strong> &mdash; it splices out introns so you can see the full coding region at once.</li>
            <li>Use the <strong>crosshair</strong> to verify that P-site peaks align with the expected reading frame.</li>
            <li>If you see no P-site signal at all, check the <strong>Mappability track</strong> &mdash; low mappability means reads may exist but can't be uniquely placed.</li>
            <li>You can add your own tracks (bigWig, BED, BAM) via the "+ Add my tracks" button in the header.</li>
          </ul>
        </section>

        <div className="pt-2 flex justify-end">
          <button onClick={dismiss}
            className="h-8 px-4 rounded bg-primary text-primary-foreground text-xs font-medium">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export { hasSeenHelp }
