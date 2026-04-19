import { useSyncExternalStore } from 'react'

interface ThemeColors {
  background: string
  foreground: string
  card: string
  border: string
  muted: string
  mutedForeground: string
}

function getColors(): ThemeColors {
  if (typeof window === 'undefined') return getDefaults()

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return isDark
    ? {
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: '#0a0a0a',
        border: '#262626',
        muted: '#262626',
        mutedForeground: '#a3a3a3',
      }
    : {
        background: '#ffffff',
        foreground: '#0a0a0a',
        card: '#ffffff',
        border: '#e5e5e5',
        muted: '#f5f5f5',
        mutedForeground: '#737373',
      }
}

function getDefaults(): ThemeColors {
  return {
    background: '#ffffff',
    foreground: '#0a0a0a',
    card: '#ffffff',
    border: '#e5e5e5',
    muted: '#f5f5f5',
    mutedForeground: '#737373',
  }
}

let cachedColors = getDefaults()

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    cachedColors = getColors()
    callback()
  }
  mq.addEventListener('change', handler)
  // Also update on first call
  cachedColors = getColors()
  return () => mq.removeEventListener('change', handler)
}

function getSnapshot(): ThemeColors {
  return cachedColors
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getSnapshot)
}
