import { useEffect, useState } from 'react'
import { navigate } from './router'
import { api, type OrfStatsRow } from './api'

const consensusColor: Record<string, string> = {
  good: 'text-green-600',
  bad: 'text-red-600',
  mixed: 'text-amber-600',
  unreviewed: 'text-muted-foreground',
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
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-3">ORF</th>
              <th className="py-1.5 pr-3">Type</th>
              <th className="py-1.5 pr-3">Gene</th>
              <th className="py-1.5 pr-3 text-right">Good</th>
              <th className="py-1.5 pr-3 text-right">Bad</th>
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
                <td className="py-1 pr-3 text-right">{r.bad_votes}</td>
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
