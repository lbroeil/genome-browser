import { useState, useRef, useCallback, useEffect } from 'react'
import { useTrackStore, type TrackConfig, type TrackType } from '@/store/trackStore'
import { BigWigAdapter } from '@/adapters/BigWigAdapter'
import { BedAdapter } from '@/adapters/BedAdapter'
import { GffAdapter } from '@/adapters/GffAdapter'
import { BamAdapter } from '@/adapters/BamAdapter'
import { VcfAdapter } from '@/adapters/VcfAdapter'
import { FastaAdapter } from '@/adapters/FastaAdapter'
import { isTauri } from '@/adapters/TauriFile'
import { TRACK_COLORS } from '@/utils/colors'
import { indexAdapterForSearch } from '@/store/searchStore'
import { DisplayModePicker, type PendingDisplayTrack } from './DisplayModePicker'

async function autoDetectIndex(_dataPath: string, candidates: string[]): Promise<string | undefined> {
  const { invoke } = await import('@tauri-apps/api/core')
  for (const candidate of candidates) {
    const exists: boolean = await invoke('file_exists', { path: candidate })
    if (exists) return candidate
  }
  return undefined
}

function detectFileType(name: string): { type: TrackType; format: string } | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.bw') || lower.endsWith('.bigwig')) return { type: 'coverage', format: 'bigwig' }
  if (lower.endsWith('.bed') || lower.endsWith('.bed.gz')) return { type: 'annotation', format: 'bed' }
  if (lower.endsWith('.gtf') || lower.endsWith('.gtf.gz')) return { type: 'gene_model', format: 'gtf' }
  if (lower.endsWith('.gff3') || lower.endsWith('.gff') || lower.endsWith('.gff3.gz') || lower.endsWith('.gff.gz'))
    return { type: 'gene_model', format: 'gff3' }
  if (lower.endsWith('.bam')) return { type: 'alignment', format: 'bam' }
  if (lower.endsWith('.bai')) return null // Index file, not a track
  if (lower.endsWith('.vcf') || lower.endsWith('.vcf.gz')) return { type: 'variant', format: 'vcf' }
  if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fna')) return { type: 'sequence', format: 'fasta' }
  if (lower.endsWith('.fai')) return null // Index file, not a track
  return null
}

function getDefaultColor(type: TrackType): string {
  switch (type) {
    case 'coverage': return TRACK_COLORS.coverage
    case 'annotation': return TRACK_COLORS.annotation
    case 'gene_model': return TRACK_COLORS.gene
    case 'alignment': return '#6b7280'
    case 'variant': return TRACK_COLORS.variant
    case 'sequence': return '#6366f1'
    default: return '#6366f1'
  }
}

function getDefaultHeight(type: TrackType): number {
  switch (type) {
    case 'coverage': return 120
    case 'annotation': return 80
    case 'gene_model': return 150
    case 'alignment': return 250
    case 'variant': return 60
    case 'sequence': return 160
    default: return 100
  }
}

let trackIdCounter = 0


const DISPLAY_MODE_TYPES: TrackType[] = ['coverage', 'annotation', 'gene_model']

export function FileLoader() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [pendingDisplayTracks, setPendingDisplayTracks] = useState<PendingDisplayTrack[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingBam = useRef<File | null>(null)
  const addTrack = useTrackStore((s) => s.addTrack)
  const updateTrack = useTrackStore((s) => s.updateTrack)
  const addTrackFromAdapter = useCallback(async (
    adapter: TrackConfig['adapter'],
    type: TrackType,
    name: string,
    source?: Record<string, string>,
  ) => {
    const id = `track-${++trackIdCounter}`
    const settings: Record<string, unknown> = {}
    if (source) settings.source = source

    const track: TrackConfig = {
      id,
      name,
      type,
      adapter,
      height: getDefaultHeight(type),
      color: getDefaultColor(type),
      visible: true,
      settings,
    }
    addTrack(track)

    indexAdapterForSearch(adapter, type)

    if (DISPLAY_MODE_TYPES.includes(type)) {
      setPendingDisplayTracks((prev) => [...prev, { id, name, type }])
    }
  }, [addTrack])

  const loadFiles = useCallback(async (files: File[]) => {
    setLoading(true)
    setError(null)

    try {
      // Separate BAM/BAI and FASTA/FAI files
      const bamFiles: File[] = []
      const baiFiles: File[] = []
      const fastaFiles: File[] = []
      const faiFiles: File[] = []
      const otherFiles: File[] = []

      for (const file of files) {
        const lower = file.name.toLowerCase()
        if (lower.endsWith('.bam')) bamFiles.push(file)
        else if (lower.endsWith('.bai') || lower.endsWith('.bam.bai')) baiFiles.push(file)
        else if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fna')) fastaFiles.push(file)
        else if (lower.endsWith('.fai')) faiFiles.push(file)
        else otherFiles.push(file)
      }

      // Handle BAM+BAI pairs
      for (const bamFile of bamFiles) {
        // Try to find matching BAI
        const baseName = bamFile.name.replace(/\.bam$/i, '')
        const matchingBai = baiFiles.find((f) => {
          const baiName = f.name.toLowerCase()
          return baiName === `${baseName.toLowerCase()}.bam.bai` || baiName === `${baseName.toLowerCase()}.bai`
        })

        if (matchingBai) {
          const adapter = new BamAdapter({ file: bamFile, index: matchingBai })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'alignment', bamFile.name)
        } else if (pendingBam.current) {
          // Previous pending BAM, no BAI found for either
          setError('BAM files require a matching .bai index file. Drop both files together.')
          pendingBam.current = null
        } else {
          pendingBam.current = bamFile
          setError('BAM file detected. Please also drop the matching .bai index file.')
        }
      }

      // Handle lone BAI files (match with pending BAM)
      for (const baiFile of baiFiles) {
        if (pendingBam.current && !bamFiles.length) {
          const adapter = new BamAdapter({ file: pendingBam.current, index: baiFile })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'alignment', pendingBam.current.name)
          pendingBam.current = null
          setError(null)
        }
      }

      // Handle FASTA+FAI pairs
      for (const fastaFile of fastaFiles) {
        const baseName = fastaFile.name
        const matchingFai = faiFiles.find((f) => {
          const faiName = f.name.toLowerCase()
          return faiName === `${baseName.toLowerCase()}.fai`
        })

        if (matchingFai) {
          const adapter = new FastaAdapter({ file: fastaFile, index: matchingFai })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'sequence', fastaFile.name)
        } else {
          setError('FASTA files require a matching .fai index file. Drop both files together.')
        }
      }

      // Handle other files
      for (const file of otherFiles) {
        const detected = detectFileType(file.name)
        if (!detected) {
          setError(`Unsupported file type: ${file.name}`)
          continue
        }

        let adapter: BigWigAdapter | BedAdapter | GffAdapter
        switch (detected.format) {
          case 'bigwig':
            adapter = new BigWigAdapter(file)
            break
          case 'bed':
            adapter = new BedAdapter(file)
            break
          case 'gtf':
            adapter = new GffAdapter(file, 'gtf')
            break
          case 'gff3':
            adapter = new GffAdapter(file, 'gff3')
            break
          default:
            continue
        }

        await adapter.initialize()
        addTrackFromAdapter(adapter, detected.type, file.name)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }, [addTrackFromAdapter])

  const loadFilePaths = useCallback(async (paths: string[]) => {
    setLoading(true)
    setError(null)

    const bamPaths: string[] = []
    const baiPaths: string[] = []
    const fastaPaths: string[] = []
    const faiPaths: string[] = []
    const vcfPaths: string[] = []
    const tbiPaths: string[] = []
    const otherPaths: string[] = []

    for (const p of paths) {
      const lower = p.toLowerCase()
      if (lower.endsWith('.bam')) bamPaths.push(p)
      else if (lower.endsWith('.bai') || lower.endsWith('.bam.bai')) baiPaths.push(p)
      else if (lower.endsWith('.fa') || lower.endsWith('.fasta') || lower.endsWith('.fna')) fastaPaths.push(p)
      else if (lower.endsWith('.fai')) faiPaths.push(p)
      else if (lower.endsWith('.vcf.gz')) vcfPaths.push(p)
      else if (lower.endsWith('.tbi')) tbiPaths.push(p)
      else otherPaths.push(p)
    }

    const tasks: Promise<void>[] = []

    for (const bamPath of bamPaths) {
      const baseName = bamPath.replace(/\.bam$/i, '')
      let matchingBai = baiPaths.find((b) => {
        const bl = b.toLowerCase()
        return bl === `${baseName.toLowerCase()}.bam.bai` || bl === `${baseName.toLowerCase()}.bai`
      })
      if (!matchingBai && isTauri()) {
        matchingBai = await autoDetectIndex(bamPath, [`${bamPath}.bai`, `${baseName}.bai`])
      }
      if (matchingBai) {
        tasks.push((async () => {
          const adapter = new BamAdapter({ bamPath, baiPath: matchingBai })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'alignment', bamPath.split('/').pop()!, { format: 'bam', bamPath, baiPath: matchingBai })
        })())
      } else {
        setError('BAM files require a matching .bai index file. Select both files together.')
      }
    }

    for (const fastaPath of fastaPaths) {
      let matchingFai = faiPaths.find((f) =>
        f.toLowerCase() === `${fastaPath.toLowerCase()}.fai`,
      )
      if (!matchingFai && isTauri()) {
        matchingFai = await autoDetectIndex(fastaPath, [`${fastaPath}.fai`])
      }
      if (matchingFai) {
        tasks.push((async () => {
          const adapter = new FastaAdapter({ faPath: fastaPath, faiPath: matchingFai })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'sequence', fastaPath.split('/').pop()!, { format: 'fasta', faPath: fastaPath, faiPath: matchingFai })
        })())
      } else {
        setError('FASTA files require a matching .fai index file. Select both files together.')
      }
    }

    for (const vcfPath of vcfPaths) {
      let matchingTbi = tbiPaths.find((t) =>
        t.toLowerCase() === `${vcfPath.toLowerCase()}.tbi`,
      )
      if (!matchingTbi && isTauri()) {
        matchingTbi = await autoDetectIndex(vcfPath, [`${vcfPath}.tbi`])
      }
      if (matchingTbi) {
        tasks.push((async () => {
          const adapter = new VcfAdapter({ vcfPath, tbiPath: matchingTbi })
          await adapter.initialize()
          addTrackFromAdapter(adapter, 'variant', vcfPath.split('/').pop()!, { format: 'vcf', vcfPath, tbiPath: matchingTbi })
        })())
      } else {
        setError('VCF files require a matching .tbi index file. Select both files together.')
      }
    }

    for (const p of otherPaths) {
      const filename = p.split('/').pop() || p
      const detected = detectFileType(filename)
      if (!detected) {
        setError(`Unsupported file type: ${filename}`)
        continue
      }

      tasks.push((async () => {
        let adapter: BigWigAdapter | BedAdapter | GffAdapter
        switch (detected.format) {
          case 'bigwig':
            adapter = new BigWigAdapter(p)
            break
          case 'bed':
            adapter = new BedAdapter(p)
            break
          case 'gtf':
            adapter = new GffAdapter(p, 'gtf')
            break
          case 'gff3':
            adapter = new GffAdapter(p, 'gff3')
            break
          default:
            return
        }
        await adapter.initialize()
        addTrackFromAdapter(adapter, detected.type, filename, { format: detected.format, path: p })
      })())
    }

    const results = await Promise.allSettled(tasks)
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed.length > 0) {
      setError(failed.map((r) => r.reason?.message ?? String(r.reason)).join('; '))
    }

    setLoading(false)
  }, [addTrackFromAdapter])

  const loadUrl = useCallback(async () => {
    if (!urlInput.trim()) return
    setLoading(true)
    setError(null)

    try {
      const url = urlInput.trim()
      const filename = url.split('/').pop() || url
      const detected = detectFileType(filename)
      if (!detected) {
        setError(`Cannot detect file type from URL: ${filename}`)
        return
      }

      let adapter: BigWigAdapter | BedAdapter | GffAdapter | BamAdapter | VcfAdapter | FastaAdapter
      switch (detected.format) {
        case 'bigwig':
          adapter = new BigWigAdapter(url)
          break
        case 'bed':
          adapter = new BedAdapter(url)
          break
        case 'gtf':
          adapter = new GffAdapter(url, 'gtf')
          break
        case 'gff3':
          adapter = new GffAdapter(url, 'gff3')
          break
        case 'bam': {
          const baiUrl = url + '.bai'
          adapter = new BamAdapter({ bamUrl: url, baiUrl })
          break
        }
        case 'vcf': {
          const tbiUrl = url + '.tbi'
          adapter = new VcfAdapter({ vcfUrl: url, tbiUrl })
          break
        }
        case 'fasta': {
          const faiUrl = url + '.fai'
          adapter = new FastaAdapter({ faUrl: url, faiUrl })
          break
        }
        default:
          setError(`Unsupported format: ${detected.format}`)
          return
      }

      await adapter.initialize()
      const source: Record<string, string> = { format: detected.format, url }
      if (detected.format === 'bam') source.baiUrl = url + '.bai'
      if (detected.format === 'vcf') source.tbiUrl = url + '.tbi'
      if (detected.format === 'fasta') source.faiUrl = url + '.fai'
      addTrackFromAdapter(adapter, detected.type, filename, source)
      setUrlInput('')
      setShowUrlInput(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load URL')
    } finally {
      setLoading(false)
    }
  }, [urlInput, addTrackFromAdapter])

  const handleOpenClick = useCallback(async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Genomic Files',
          extensions: ['bw', 'bigwig', 'bed', 'gtf', 'gff', 'gff3', 'bam', 'bai', 'vcf.gz', 'tbi', 'fa', 'fasta', 'fna', 'fai'],
        }],
      })
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        loadFilePaths(paths)
      }
    } else {
      fileInputRef.current?.click()
    }
  }, [loadFilePaths])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    loadFiles(files)
  }, [loadFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    loadFiles(files)
    e.target.value = ''
  }, [loadFiles])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
      getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragOver(true)
        } else if (event.payload.type === 'drop') {
          setIsDragOver(false)
          loadFilePaths(event.payload.paths)
        } else {
          setIsDragOver(false)
        }
      }).then((fn) => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [loadFilePaths])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('menu-open-file', () => handleOpenClick()).then((fn) => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [handleOpenClick])

  const handleDisplayModeDone = useCallback((modes: Record<string, string>) => {
    for (const [id, mode] of Object.entries(modes)) {
      const track = useTrackStore.getState().tracks.find((t) => t.id === id)
      if (track) {
        updateTrack(id, { settings: { ...track.settings, displayMode: mode } })
      }
    }
    setPendingDisplayTracks([])
  }, [updateTrack])

  return (
    <div className="px-4 py-2 border-b border-border">
      <div
        className={`flex items-center gap-3 rounded-lg border-2 border-dashed p-2 transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <button
          onClick={handleOpenClick}
          className="h-7 px-3 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Open File'}
        </button>

        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="h-7 px-3 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
        >
          URL
        </button>

        <span className="text-xs text-muted-foreground">
          Drop files here (BigWig, BED, GTF, GFF3, BAM+BAI, FASTA+FAI)
        </span>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".bw,.bigwig,.bed,.gtf,.gff,.gff3,.bam,.bai,.vcf,.fa,.fasta,.fna,.fai"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
            placeholder="https://example.com/data.bigwig"
            className="flex-1 h-7 px-2 rounded border border-input bg-background text-xs font-mono"
          />
          <button
            onClick={loadUrl}
            disabled={loading}
            className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Load
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}

      {pendingDisplayTracks.length > 0 && (
        <DisplayModePicker tracks={pendingDisplayTracks} onDone={handleDisplayModeDone} />
      )}
    </div>
  )
}
