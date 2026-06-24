import { useEffect, useState, useRef, useCallback } from 'react'
import { navigate } from './router'
import { api, type OrfStatsRow } from './api'

const consensusColor: Record<string, string> = {
  good: 'text-green-600',
  bad: 'text-red-600',
  mixed: 'text-amber-600',
  unreviewed: 'text-muted-foreground',
}

const CONSENSUS_FILL: Record<string, string> = {
  good: '#16a34a',
  bad: '#dc2626',
  mixed: '#d97706',
  unreviewed: '#94a3b8',
}

function DonutChart({ counts }: { counts: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const size = 120
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) return
    const cx = size / 2, cy = size / 2, r = 48, inner = 30
    let angle = -Math.PI / 2

    for (const [key, count] of Object.entries(counts)) {
      if (count === 0) continue
      const slice = (count / total) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, angle, angle + slice)
      ctx.arc(cx, cy, inner, angle + slice, angle, true)
      ctx.closePath()
      ctx.fillStyle = CONSENSUS_FILL[key] ?? '#6b7280'
      ctx.fill()
      angle += slice
    }

    ctx.fillStyle = getComputedStyle(canvas).color || '#1f2937'
    ctx.font = 'bold 16px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(total), cx, cy)
  }, [counts])

  useEffect(() => { draw() }, [draw])
  return <canvas ref={canvasRef} className="text-foreground" />
}

function TypeBreakdown({ rows }: { rows: OrfStatsRow[] }) {
  const types = new Map<string, Record<string, number>>()
  for (const r of rows) {
    if (!types.has(r.orf_type)) types.set(r.orf_type, { good: 0, bad: 0, mixed: 0, unreviewed: 0 })
    const t = types.get(r.orf_type)!
    t[r.consensus] = (t[r.consensus] ?? 0) + 1
  }
  const maxCount = Math.max(...[...types.values()].map((t) => Object.values(t).reduce((a, b) => a + b, 0)), 1)

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground mb-1">By ORF type</p>
      {[...types.entries()].map(([type, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        return (
          <div key={type} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate text-muted-foreground" title={type}>{type}</span>
            <div className="flex-1 h-4 bg-secondary rounded overflow-hidden flex">
              {(['good', 'bad', 'mixed', 'unreviewed'] as const).map((c) =>
                counts[c] > 0 ? (
                  <div key={c} style={{ width: `${(counts[c] / maxCount) * 100}%`, backgroundColor: CONSENSUS_FILL[c] }}
                    title={`${c}: ${counts[c]}`} />
                ) : null
              )}
            </div>
            <span className="w-8 text-right text-muted-foreground">{total}</span>
          </div>
        )
      })}
    </div>
  )
}

export function StatsView({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<OrfStatsRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getStats(projectId).then(setRows).catch((e) => setError(String(e)))
  }, [projectId])

  const reviewed = rows.filter((r) => r.consensus !== 'unreviewed').length

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/curate/${projectId}`)} className="text-xs text-muted-foreground hover:text-foreground">← Curate</button>
          <h1 className="text-sm font-semibold">Results · project {projectId}</h1>
          <span className="text-xs text-muted-foreground">{reviewed}/{rows.length} reviewed</span>
        </div>
        <a href={api.statsExportUrl(projectId)}
          className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center">
          Export CSV
        </a>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        {/* Dashboard summary */}
        {rows.length > 0 && (() => {
          const consCounts: Record<string, number> = { good: 0, bad: 0, mixed: 0, unreviewed: 0 }
          let flaggedStarts = 0
          let uncertainTotal = 0
          for (const r of rows) {
            consCounts[r.consensus] = (consCounts[r.consensus] ?? 0) + 1
            if (r.good_flagged_start > 0) flaggedStarts++
            uncertainTotal += r.good_uncertain + r.bad_uncertain
          }
          return (
            <div className="flex items-start gap-6 mb-6 pb-4 border-b border-border">
              <div className="flex flex-col items-center gap-1">
                <DonutChart counts={consCounts} />
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  {Object.entries(consCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CONSENSUS_FILL[k] }} />
                      {k} ({v})
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <TypeBreakdown rows={rows} />
              </div>
              <div className="flex flex-col gap-2 text-xs">
                {flaggedStarts > 0 && (
                  <div className="px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30">
                    <span className="font-semibold text-amber-700 dark:text-amber-300">{flaggedStarts}</span>
                    <span className="text-muted-foreground ml-1">ORFs with flagged start codons</span>
                  </div>
                )}
                {uncertainTotal > 0 && (
                  <div className="px-3 py-2 rounded bg-secondary border border-border">
                    <span className="font-semibold">{uncertainTotal}</span>
                    <span className="text-muted-foreground ml-1">uncertain votes cast</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-3">ORF</th>
              <th className="py-1.5 pr-3">Type</th>
              <th className="py-1.5 pr-3">Gene</th>
              <th className="py-1.5 pr-3 text-right">Good</th>
              <th className="py-1.5 pr-3 text-right" title="Of the Good votes, how many flagged a likely-wrong start codon">Good (start?)</th>
              <th className="py-1.5 pr-3 text-right">Bad</th>
              <th className="py-1.5 pr-3 text-right" title="Uncertain votes (good / bad)">Uncertain</th>
              <th className="py-1.5 pr-3 text-right">Skip</th>
              <th className="py-1.5 pr-3 text-right">Good %</th>
              <th className="py-1.5">Consensus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orf_id} className="border-b border-border/50">
                <td className="py-1 pr-3 font-mono">{r.orf_name}</td>
                <td className="py-1 pr-3">{r.orf_type}</td>
                <td className="py-1 pr-3 text-muted-foreground">{r.gene_name ?? '—'}</td>
                <td className="py-1 pr-3 text-right">{r.good_votes}</td>
                <td className={`py-1 pr-3 text-right ${r.good_flagged_start > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                  {r.good_flagged_start > 0 ? r.good_flagged_start : '—'}
                </td>
                <td className="py-1 pr-3 text-right">{r.bad_votes}</td>
                <td className={`py-1 pr-3 text-right ${(r.good_uncertain + r.bad_uncertain) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {(r.good_uncertain + r.bad_uncertain) > 0
                    ? `${r.good_uncertain} / ${r.bad_uncertain}`
                    : '—'}
                </td>
                <td className="py-1 pr-3 text-right">{r.skip_votes}</td>
                <td className="py-1 pr-3 text-right">{r.total_votes > 0 ? `${r.good_pct}%` : '—'}</td>
                <td className={`py-1 font-medium ${consensusColor[r.consensus] ?? ''}`}>{r.consensus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
