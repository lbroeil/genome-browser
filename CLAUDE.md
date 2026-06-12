# Genome Browser — Developer Handover

## Quick reference

- **Stack:** Tauri v2 (Rust) + React 19 + TypeScript + Vite 8 + Zustand + Tailwind CSS v4
- **Branch:** `feature/tauri-desktop` on `lbroeil/genome-browser`
- **Package manager:** pnpm (do NOT use npm — it breaks dependency resolution)
- **Dev:** `source "$HOME/.cargo/env" && pnpm tauri dev`
- **Build:** `source "$HOME/.cargo/env" && pnpm tauri build`
- **Output:** `src-tauri/target/release/bundle/macos/Genome Browser.app` and `.dmg`
- **No test suite** — verify changes by running the app and testing manually
- **TypeScript:** pre-existing type errors in adapter files; build skips `tsc` (Vite/esbuild handles transpilation)

## Architecture

### Data flow

```
File/URL → Adapter (parse format) → GenomicFeature[] / CoverageBin[]
  → Store (Zustand) → TrackView (React) → Canvas Renderer (live view)
                                         → SVG Renderer (export)
```

### Directory layout

```
src/
├── adapters/          # File format parsers, each implements GenomicAdapter interface
│   ├── types.ts       # Core types: GenomicFeature, GenomicAdapter, TrackType, etc.
│   ├── TauriFile.ts   # IPC bridge for native file access (replaces fetch for local files)
│   ├── BigWigAdapter   # Coverage data
│   ├── BedAdapter      # BED6/BED12 annotations
│   ├── GffAdapter      # GTF and GFF3 gene models
│   ├── BamAdapter      # Alignments (uses @gmod/bam)
│   ├── VcfAdapter      # Variants
│   ├── FastaAdapter    # Reference sequence
│   └── UcscSequenceAdapter  # Built-in hg38 sequence from UCSC API
├── components/
│   ├── Browser.tsx     # Top-level layout, session save/restore
│   ├── TrackPanel.tsx  # Track list, drag-to-reorder (HTML5 DnD on wrapper divs)
│   ├── TrackView.tsx   # THE BIG FILE (~660 lines): data fetching, canvas rendering,
│   │                   #   mouse interactions (pan, zoom, select, click-to-transcript-view)
│   ├── NavigationBar.tsx  # Chromosome selector, search bar, zoom controls
│   ├── FileLoader.tsx  # File open dialog, drag-drop, URL loading, adapter creation
│   ├── ExportDialog.tsx   # SVG/PNG/PDF export UI
│   ├── GenomeRuler.tsx    # Coordinate ruler + CDS frame bar in transcript view
│   └── BookmarkPanel.tsx  # Bookmark save/navigate
├── renderers/
│   ├── canvas/        # Live rendering (one per track type)
│   └── svg/           # Export rendering (mirrors canvas renderers)
├── store/             # Zustand stores (no Redux)
│   ├── genomeStore    # Viewport: chromosome, start, end, navigation history
│   ├── trackStore     # Track list, add/remove/update/reorder
│   ├── searchStore    # Feature search index + indexAdapterForSearch()
│   ├── transcriptViewStore  # Transcript view state + TranscriptCoordinateMapper
│   ├── crosshairStore # Crosshair line position
│   └── bookmarkStore  # Saved regions
├── utils/
│   ├── coordinates.ts # bpToPixel, pixelToBp, formatRegion, parseRegion, chromosome list
│   ├── TranscriptCoordinateMapper.ts  # Maps genomic ↔ transcript coordinates
│   ├── transcriptData.ts  # Fetches spliced coverage/sequence for transcript view
│   ├── session.ts     # Session serialization/deserialization
│   ├── colors.ts      # Strand colors, frame colors, track colors
│   ├── translation.ts # Codon table, 3-frame translation
│   ├── pileup.ts      # Alignment pileup layout
│   └── downsampling.ts
├── export/
│   ├── SvgComposer.ts # Builds multi-track SVG with rulers, legends, scale bars
│   └── SessionManager.ts
└── src-tauri/         # Rust backend
    └── src/lib.rs     # IPC commands: read_file_bytes, read_file_all, file_stat, file_exists, write_file
```

### Key types (src/adapters/types.ts)

- `GenomicAdapter` — interface all adapters implement: `initialize()`, `getFeatures()`, `getCoverage?()`, `getSequence?()`
- `GenomicFeature` — id, chromosome, start, end, strand, data (union of AnnotationData | GeneModelData | AlignmentData | VariantData)
- `TrackConfig` — id, name, type, adapter, height, color, visible, settings
- `TrackType` — `'coverage' | 'annotation' | 'gene_model' | 'alignment' | 'variant' | 'sequence'`

### Rendering pattern

Each track type has a canvas renderer (live) and SVG renderer (export). They share the same layout logic but are separate implementations. The canvas renderers are called from `TrackView.tsx`'s `render()` callback. The SVG renderers are called from `SvgComposer.ts` during export.

**When modifying rendering:** changes must be made in both canvas and SVG renderers to stay consistent. The annotation renderers (`CanvasAnnotationRenderer.ts` and `SvgAnnotationRenderer.ts`) are the most complex — they handle gene models with exons/CDS/UTR, intron lines, strand arrows, and label overlap prevention.

### Transcript view

Clicking a multi-exon feature (gene model or BED12) creates a `TranscriptCoordinateMapper` and enters transcript view. The mapper converts between genomic and spliced transcript coordinates. In transcript view:
- `effectiveRegion` in TrackView becomes `{ chromosome: 'tx', start: txStart, end: txEnd }` instead of the genomic region
- Coverage adapters are called per-exon and results concatenated (`fetchTranscriptCoverage`)
- Sequence is fetched per-exon and spliced (`fetchTranscriptSequence`)
- Annotation features are fetched from overlapping genomic regions and remapped (`remapFeaturesToTranscript`)

### Session save/restore

Sessions serialize track metadata (file paths, format, display settings) but NOT adapters or cached data. On restore (`session.ts:restoreSession`), adapters are recreated from source paths/URLs. **Important:** any side effect that happens during fresh file loading (e.g., search indexing) must also happen during session restore — see `Browser.tsx:handleLoadSession`.

## Patterns and gotchas

### HTML5 drag-and-drop vs mouse handlers
The track header uses HTML5 DnD (`draggable` attribute) for reorder. The canvas area uses custom mouse handlers for pan/zoom/select. These MUST be isolated:
- Canvas div: `draggable={false}`, `onDragOver={(e) => { e.preventDefault() }}` (so parent drop targets work)
- Track header: `draggable`, with tag checks to skip BUTTON/INPUT/SELECT elements
- Drop handler reads source index from `e.dataTransfer.getData()`, not React state (avoids stale closures)

### Coordinate system
All coordinates are 0-based, end-exclusive (BED-style). `bpToPixel` and `pixelToBp` in `coordinates.ts` handle the conversion. Chromosome names are normalized with `normalizeChromosomeName` and matched with `mapChromosomeName` (handles chr1 vs 1 mismatches between files).

### Tauri IPC
Local file access goes through Rust IPC commands (`read_file_bytes`, `read_file_all`). The `TauriFile` class wraps these as a `GenericFilehandle`-compatible interface for the @gmod libraries. Check `isTauri()` before using Tauri APIs — the app can also run as a plain web app with URL-based file access.

### Auto-resize
Annotation and gene_model tracks auto-resize based on how many rows the layout algorithm produces. The height is computed by `getAnnotationTrackHeight()` in `CanvasAnnotationRenderer.ts`, capped at 500px, minimum 60px. The sequence track auto-resizes based on zoom level and strand setting (`getSequenceTrackHeight()`).

### Label overlap prevention
Both canvas and SVG annotation renderers track `rowLabelEnds` — a per-row record of where the last label ended. Labels that would overlap are skipped. Canvas uses `measureText()` for exact width; SVG estimates at ~6px per character.

## Known issues

- Type errors in `BamAdapter.ts` and `BigWigAdapter.ts` — `ArrayBuffer` vs `SharedArrayBuffer` mismatch with @gmod library types. Doesn't affect runtime.
- App is unsigned — macOS Gatekeeper requires right-click > Open on first launch
- Build is Apple Silicon only (aarch64); no cross-compilation configured
- SVG export doesn't support 8-digit hex colors (#RRGGBBAA) — must split into fill + fill-opacity
- WKWebView (Tauri macOS) handles some DOM APIs differently — prefer simple approaches over `requestAnimationFrame` tricks
