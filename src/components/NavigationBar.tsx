import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useTranscriptViewStore } from '@/store/transcriptViewStore'
import { useSearchStore, type SearchableFeature } from '@/store/searchStore'
import { CHROMOSOME_LIST, formatRegion, parseRegion, regionWidth, formatBp } from '@/utils/coordinates'

export function NavigationBar() {
  const { chromosome, start, end, setRegion, setChromosome, zoom, back, forward, canGoBack, canGoForward } = useGenomeStore()
  const txActive = useTranscriptViewStore((s) => s.active)
  const txFeatureName = useTranscriptViewStore((s) => s.featureName)
  const txMapper = useTranscriptViewStore((s) => s.mapper)
  const txStart = useTranscriptViewStore((s) => s.txStart)
  const txEnd = useTranscriptViewStore((s) => s.txEnd)
  const txExit = useTranscriptViewStore((s) => s.exit)
  const txZoom = useTranscriptViewStore((s) => s.zoomTx)
  const txSetRegion = useTranscriptViewStore((s) => s.setTxRegion)
  const { search, getRegionForFeature } = useSearchStore()
  const region = { chromosome, start, end }
  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<SearchableFeature[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Escape key exits transcript view
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && useTranscriptViewStore.getState().active) {
        useTranscriptViewStore.getState().exit()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleGo = () => {
    if (txActive) {
      // In transcript view, parse "100-500" or "tx:100-500" as transcript coords
      const cleaned = inputValue.replace(/^tx:/, '').trim()
      const match = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)$/)
      if (match) {
        txSetRegion(parseInt(match[1], 10), parseInt(match[2], 10))
        setInputValue('')
        return
      }
      return
    }

    // Try as region first
    const parsed = parseRegion(inputValue)
    if (parsed) {
      setRegion(parsed)
      setInputValue('')
      setSuggestions([])
      return
    }

    // Try as gene/feature search
    const results = search(inputValue)
    if (results.length > 0) {
      const target = results[0]
      setRegion(getRegionForFeature(target))
      setInputValue('')
      setSuggestions([])
      return
    }
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setSelectedIdx(-1)

    if (txActive) return // No gene search in transcript view

    // Only search if it doesn't look like a coordinate
    if (value.trim().length >= 2 && !value.includes(':')) {
      const results = search(value)
      setSuggestions(results)
    } else {
      setSuggestions([])
    }
  }

  const handleSelectSuggestion = (feature: SearchableFeature) => {
    setRegion(getRegionForFeature(feature))
    setInputValue('')
    setSuggestions([])
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.max(prev - 1, -1))
        return
      }
      if (e.key === 'Enter' && selectedIdx >= 0) {
        e.preventDefault()
        handleSelectSuggestion(suggestions[selectedIdx])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        return
      }
    }
    if (e.key === 'Enter') handleGo()
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const txSpan = txEnd - txStart
  const displayValue = txActive
    ? (inputFocused ? inputValue : `tx:${txStart}-${txEnd}`)
    : (inputFocused ? inputValue : formatRegion(region))
  const spanWidth = txActive ? txSpan : regionWidth(region)

  const handleZoomIn = () => txActive ? txZoom(0.5) : zoom(0.5)
  const handleZoomOut = () => txActive ? txZoom(2) : zoom(2)
  const handleZoomIn10x = () => txActive ? txZoom(0.1) : zoom(0.1)
  const handleZoomOut10x = () => txActive ? txZoom(10) : zoom(10)

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
      {txActive ? (
        <>
          {/* Transcript view indicator */}
          <div className="flex items-center gap-2">
            <span className="h-8 px-2 flex items-center rounded bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 text-sm font-medium">
              {txFeatureName ?? 'Transcript'}
              {txMapper && (
                <span className="ml-1 text-xs opacity-75">
                  ({txMapper.strand === '+' ? '+' : '\u2212'} strand, {txMapper.txLength}bp)
                </span>
              )}
            </span>
            <button
              onClick={txExit}
              className="h-8 px-3 rounded bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              title="Exit transcript view (Esc)"
            >
              Exit Transcript View
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Chromosome selector */}
          <select
            value={chromosome}
            onChange={(e) => setChromosome(e.target.value)}
            className="h-8 px-2 rounded border border-input bg-background text-sm cursor-pointer"
          >
            {CHROMOSOME_LIST.map((chr) => (
              <option key={chr} value={chr}>
                {chr}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Region / Gene search input */}
      <div className="relative flex items-center gap-1" ref={suggestionsRef}>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            setInputFocused(true)
            setInputValue('')
          }}
          onBlur={() => {
            setInputFocused(false)
            // Delay hiding suggestions so click can register
            setTimeout(() => setSuggestions([]), 200)
          }}
          onKeyDown={handleKeyDown}
          placeholder={txActive ? 'tx:100-500' : 'chr1:1,000-2,000 or gene name'}
          className="h-8 px-2 w-72 rounded border border-input bg-background text-sm font-mono"
        />
        <button
          onClick={handleGo}
          className="h-8 px-3 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Go
        </button>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {suggestions.map((feature, i) => (
              <button
                key={`${feature.name}-${feature.chromosome}-${feature.start}`}
                onClick={() => handleSelectSuggestion(feature)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center justify-between ${
                  i === selectedIdx ? 'bg-accent' : ''
                }`}
              >
                <span className="font-medium">{feature.name}</span>
                <span className="text-xs text-muted-foreground">
                  {feature.chromosome}:{formatBp(feature.start)}-{formatBp(feature.end)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Back / Forward */}
      {!txActive && (
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={back}
            disabled={!canGoBack}
            className="h-8 w-8 rounded border border-input bg-background text-sm hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-default"
            title="Back"
          >
            &#x2190;
          </button>
          <button
            onClick={forward}
            disabled={!canGoForward}
            className="h-8 w-8 rounded border border-input bg-background text-sm hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-default"
            title="Forward"
          >
            &#x2192;
          </button>
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={handleZoomIn}
          className="h-8 w-8 rounded border border-input bg-background text-sm font-bold hover:bg-accent transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="h-8 w-8 rounded border border-input bg-background text-sm font-bold hover:bg-accent transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleZoomIn10x}
          className="h-8 px-2 rounded border border-input bg-background text-xs hover:bg-accent transition-colors"
          title="Zoom in 10x"
        >
          10x
        </button>
        <button
          onClick={handleZoomOut10x}
          className="h-8 px-2 rounded border border-input bg-background text-xs hover:bg-accent transition-colors"
          title="Zoom out 10x"
        >
          /10
        </button>
      </div>

      {/* Current span indicator */}
      <span className="ml-auto text-xs text-muted-foreground">
        {formatBp(spanWidth)} span
      </span>
    </div>
  )
}
