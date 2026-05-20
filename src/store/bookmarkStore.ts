import { create } from 'zustand'

export interface Bookmark {
  id: string
  name: string
  chromosome: string
  start: number
  end: number
  createdAt: number
}

interface BookmarkState {
  bookmarks: Bookmark[]
  add: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
}

const STORAGE_KEY = 'genome-browser-bookmarks'

function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveBookmarks(bookmarks: Bookmark[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
}

let counter = 0

export const useBookmarkStore = create<BookmarkState>((set) => ({
  bookmarks: loadBookmarks(),

  add: (bookmark) => set((s) => {
    const bookmarks = [...s.bookmarks, {
      ...bookmark,
      id: `bm-${Date.now()}-${++counter}`,
      createdAt: Date.now(),
    }]
    saveBookmarks(bookmarks)
    return { bookmarks }
  }),

  remove: (id) => set((s) => {
    const bookmarks = s.bookmarks.filter((b) => b.id !== id)
    saveBookmarks(bookmarks)
    return { bookmarks }
  }),

  rename: (id, name) => set((s) => {
    const bookmarks = s.bookmarks.map((b) => b.id === id ? { ...b, name } : b)
    saveBookmarks(bookmarks)
    return { bookmarks }
  }),
}))
