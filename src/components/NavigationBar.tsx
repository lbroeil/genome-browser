import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useGenomeStore } from '@/store/genomeStore'
import { useSearchStore, type SearchableFeature } from '@/store/searchStore'
import { CHROMOSOME_LIST, formatRegion, parseRegion, regionWidth, formatBp } from '@/utils/coordinates'

export function NavigationBar() {
  const { chromosome, start, end, setRegion, setChromosome, zoom } = useGenomeStore()
  const { search, getRegionForFeature } = useSearchStore()
  const region = { chromosome, start, end }
  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<SearchableFeature[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const handleGo = () => {
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

  const displayValue = inputFocused ? inputValue : formatRegion(region)
  const spanWidth = regionWidth(region)

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
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

      {/* Region / Gene search input */}
      <div className="relative flex items-center gap-1" ref={suggestionsRef}>
        <input
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
          placeholder="chr1:1,000-2,000 or gene name"
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

      {/* Zoom controls */}
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => zoom(0.5)}
          className="h-8 w-8 rounded border border-input bg-background text-sm font-bold hover:bg-accent transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => zoom(2)}
          className="h-8 w-8 rounded border border-input bg-background text-sm font-bold hover:bg-accent transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => zoom(0.1)}
          className="h-8 px-2 rounded border border-input bg-background text-xs hover:bg-accent transition-colors"
          title="Zoom in 10x"
        >
          10x
        </button>
        <button
          onClick={() => zoom(10)}
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
