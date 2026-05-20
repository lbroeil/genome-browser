import { useState, useRef, useEffect } from 'react'
import { useBookmarkStore, type Bookmark } from '@/store/bookmarkStore'
import { useGenomeStore } from '@/store/genomeStore'
import { formatRegion, formatBp } from '@/utils/coordinates'

export function BookmarkPanel() {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const { chromosome, start, end } = useGenomeStore()
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const addBookmark = useBookmarkStore((s) => s.add)
  const removeBookmark = useBookmarkStore((s) => s.remove)
  const renameBookmark = useBookmarkStore((s) => s.rename)
  const setRegion = useGenomeStore((s) => s.setRegion)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        setNaming(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (naming) nameInputRef.current?.focus()
  }, [naming])

  const handleAdd = () => {
    setNaming(true)
    const region = { chromosome, start, end }
    setNameInput(formatRegion(region))
  }

  const confirmAdd = () => {
    if (!nameInput.trim()) return
    addBookmark({ name: nameInput.trim(), chromosome, start, end })
    setNaming(false)
    setNameInput('')
  }

  const handleJump = (bm: Bookmark) => {
    setRegion({ chromosome: bm.chromosome, start: bm.start, end: bm.end })
  }

  const startRename = (bm: Bookmark) => {
    setEditingId(bm.id)
    setEditInput(bm.name)
  }

  const confirmRename = () => {
    if (editingId && editInput.trim()) {
      renameBookmark(editingId, editInput.trim())
    }
    setEditingId(null)
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
          open
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground hover:bg-accent'
        }`}
        title="Saved loci"
      >
        Bookmarks{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-lg z-50">
          {/* Add bookmark */}
          <div className="p-2 border-b border-border">
            {naming ? (
              <div className="flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmAdd()
                    if (e.key === 'Escape') { setNaming(false); setNameInput('') }
                  }}
                  placeholder="Bookmark name"
                  className="flex-1 h-6 px-2 rounded border border-input bg-background text-xs"
                />
                <button
                  onClick={confirmAdd}
                  className="h-6 px-2 rounded bg-primary text-primary-foreground text-xs font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => { setNaming(false); setNameInput('') }}
                  className="h-6 px-2 rounded bg-secondary text-secondary-foreground text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleAdd}
                className="w-full h-7 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
              >
                + Bookmark current region
              </button>
            )}
          </div>

          {/* Bookmark list */}
          <div className="max-h-72 overflow-y-auto">
            {bookmarks.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No bookmarks yet</p>
            ) : (
              bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent/50 transition-colors group"
                >
                  {editingId === bm.id ? (
                    <input
                      autoFocus
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={confirmRename}
                      className="flex-1 h-5 px-1 rounded border border-input bg-background text-xs"
                    />
                  ) : (
                    <button
                      onClick={() => handleJump(bm)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="text-xs font-medium truncate block">{bm.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {bm.chromosome}:{formatBp(bm.start)}-{formatBp(bm.end)}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => startRename(bm)}
                    className="text-muted-foreground hover:text-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    title="Rename"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    className="text-muted-foreground hover:text-destructive text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
