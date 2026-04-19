# genome-browser

A modern, web-based genome browser built from scratch with **clean, publication-ready SVG export** as a first-class feature. Unlike IGV's SVG exports (which produce messy output with hidden layers and non-semantic structure), this browser generates clean, editable SVGs with semantic grouping — ready to open in Illustrator or Inkscape without cleanup.

Everything runs client-side in the browser. No backend required. Your data stays local.

## Features

### Supported file formats
- **BigWig** — coverage tracks (area, bar, or reading-frame coloring for Ribo-seq)
- **BAM + BAI** — alignment tracks with read pileup, coverage histogram, and mismatch highlighting
- **BED** — annotation tracks
- **GTF / GFF3** — gene model tracks with exon/CDS/UTR structure
- **VCF + TBI** — variant tracks (SNV, INS, DEL, MNV)
- **FASTA + FAI** — reference sequence (or use the built-in hg38 from UCSC)

### Interactive viewing
- Smooth pan (click-drag) and zoom (Ctrl/Cmd + scroll)
- Shift-drag to select and zoom into a region
- Gene/feature search across loaded annotation tracks
- Per-track controls: height, color, display mode, strand colors
- Track reordering (move up/down) and renaming (double-click)
- Reading frame coloring for Ribo-seq data

### Sequence & translation
- Built-in hg38 reference sequence fetched on demand from UCSC (no file needed)
- Nucleotide display with colored bases when zoomed in (<200 bp)
- Three-frame translation with start (green) and stop (red) codon highlighting
- Strand selector: forward only, reverse only, or both

### SVG export
- Semantic SVG structure: every element has meaningful `id`, `class`, and `data-*` attributes
- Text rendered as `<text>` elements (not paths) — fully editable
- Left sidebar with track names, separated from the data area
- Per-track clipping to viewport boundaries (no oversized hidden elements)
- Configurable dimensions, label width, and DPI (for PNG)
- All text in Arial, black — publication-ready out of the box

### Session management
- Save and load sessions as JSON files
- Preserves viewport position, track order, colors, display modes, and all settings
- URL-loaded tracks are fully restorable; local file tracks noted for re-loading

## Quick start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

### Run locally
```bash
git clone https://github.com/lbroeil/genome-browser.git
cd genome-browser
pnpm install
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for deployment
```bash
pnpm build
```
The `dist/` folder contains static files you can serve from any web server (nginx, Apache, Python's `http.server`, GitHub Pages, etc.).

## Usage

1. **Load data** — Drop files onto the browser or paste a URL. BAM files need their `.bai` index dropped alongside. FASTA files need their `.fai` index.
2. **Navigate** — Type coordinates (e.g., `chr1:11,800,000-12,200,000`) or search for a gene name. Pan by dragging, zoom with Ctrl+scroll.
3. **Configure tracks** — Adjust height, colors, display modes, and strand settings in each track's header bar.
4. **Export** — Click "Export" to download an SVG or PNG of the current view.
5. **Save session** — Click "Save Session" to download a JSON file. Share it with collaborators or reload it later with "Load Session".

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| State | Zustand |
| Styling | Tailwind CSS v4 |
| Interactive rendering | Canvas 2D |
| Export rendering | Programmatic SVG (not canvas2svg) |
| File parsing | @gmod/bbi, @gmod/bam, @gmod/vcf, @gmod/tabix, @gmod/gff |

## Architecture

The browser uses a **dual renderer** architecture:
- **Canvas 2D** for interactive viewing — handles 10k+ reads without DOM overhead
- **Programmatic SVG** for export — generates clean, semantic SVG with proper grouping

Both renderers share data transformation (pileup layout, coverage binning) but draw independently. This avoids both SVG DOM performance issues and the messy output of canvas-to-SVG conversion libraries.

## License

MIT
