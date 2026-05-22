# Genome Browser — Quick Start Guide

A desktop genome browser built for Ribo-seq and non-canonical ORF research. This guide covers the key features your labmates need to know.

## Features

- **Multi-format support** — load BigWig, BED, GTF, GFF3, BAM, VCF, and FASTA files via drag-and-drop or file picker
- **Reading frame coloring** — visualize Ribo-seq P-site signal in 3-color reading frame mode; color ORF annotations by frame
- **Transcript view** — click any gene or BED12 feature to enter spliced transcript coordinates; introns are removed and all tracks remap to transcript space
- **CDS frame reference** — in transcript view, a color-coded bar shows the CDS reading frame relative to the ruler
- **Built-in hg38 sequence & translation** — automatic 3-frame translation display, no FASTA file needed
- **Publication-quality export** — SVG, PNG, and PDF export with track selection, highlight regions, legends, and scale bars
- **Session save/restore** — save your entire workspace (tracks, view, settings) to a file and share it
- **Gene search** — type-ahead search across all loaded gene names, transcript IDs, and ORF names
- **Fully offline** — runs as a standalone desktop app; no data leaves your machine
- **Strand-aware rendering** — forward/reverse strand coloring with customizable colors per track
- **Bookmarks** — save and revisit interesting genomic regions

## Getting Started

1. **Open the app** — double-click `Genome Browser.app` (macOS). First launch: right-click > Open to bypass Gatekeeper.
2. **Load files** — click "Open File" or drag-and-drop files onto the file loader bar. Supported formats:
   - **BigWig** (.bw) — coverage tracks (e.g. Ribo-seq signal)
   - **BED** (.bed) — annotations, ORF predictions
   - **GTF/GFF3** (.gtf, .gff3) — gene models
   - **BAM + BAI** — alignments (drop both files together)
   - **FASTA + FAI** — reference sequence (drop both together)
   - **VCF** (.vcf.gz + .tbi) — variants
3. **Built-in hg38 sequence** — a sequence/translation track loads automatically (fetched from UCSC).

## Navigation

| Action | How |
|--------|-----|
| **Go to a region** | Type coordinates in the search bar, e.g. `chr1:1,000,000-1,100,000`, then press Enter or click Go |
| **Search by gene name** | Type a gene name (e.g. `ACTB`, `TP53`) — suggestions appear as you type |
| **Pan** | Click and drag on any track |
| **Zoom in/out** | Use the +/− buttons, or Ctrl/Cmd+scroll on a track |
| **Zoom 10x** | Use the "10x" and "/10" buttons for quick jumps |
| **Zoom to selection** | Hold **Shift** + click-drag to select a region, then release to zoom in |
| **Back/Forward** | Use the ← → buttons to revisit previous views |

## Track Management

- **Rename** — double-click the track name in the header
- **Change height** — edit the number in the header (30–500 px), or annotation/gene tracks auto-resize to fit
- **Remove** — click the × button in the track header
- **Move up/down** — use the ▲/▼ arrows on the left of each track header

## Display Modes

### Gene/Annotation tracks (GTF, GFF3, BED)
- **Expanded** (default) — each transcript on its own row
- **Collapsed** — all features stacked in minimal rows
- **Frame (ORF)** — colored by reading frame (start position mod 3)

### Coverage tracks (BigWig)
- **Area** — filled area plot
- **Bar** — bar chart
- **Frame (Ribo-seq)** — 3-color reading frame display, ideal for Ribo-seq P-site data

### Sequence track
- **+ Strand / − Strand / Both** — choose which translation frames to display

## Transcript View

Click on any multi-exon feature (gene model or BED12 annotation) to enter **Transcript View**. This remaps all tracks into spliced transcript coordinates:

- Introns are removed — exons are shown end-to-end
- Coverage tracks show signal in transcript space (great for seeing Ribo-seq P-site periodicity across junctions)
- A CDS reference frame bar appears in the ruler (green/blue/red = frame 0/1/2)
- The sequence track shows the spliced mRNA sequence and translation

**In expanded mode**, each transcript is clickable individually — click the specific transcript you want.

**Exit** transcript view by clicking the red "Exit Transcript View" button or pressing **Escape**.

## Strand Colors

Gene/annotation tracks color features by strand:
- **Blue** = forward (+) strand
- **Red** = reverse (−) strand

You can customize these with the color pickers in the track header.

## Crosshair

Click the "Crosshair" button in the top bar to enable a vertical red line that follows your cursor across all tracks. Useful for aligning P-site positions with codons in the sequence track.

## Sessions

- **Save Session** — saves your current view, tracks, and settings to a `.gbsession` file
- **Load Session** — restores a saved session (file paths must still be accessible)

## Export

Click "Export" to generate publication-quality figures:
- **SVG** — vector format, editable in Illustrator/Inkscape
- **PNG** — raster image at configurable resolution
- **PDF** — vector PDF
- Choose which tracks to include, add a highlight region, and customize dimensions

## Bookmarks

Use the Bookmarks panel (top bar) to save interesting genomic regions for quick navigation.

## Tips

- The app works entirely offline once files are loaded — no data leaves your machine
- For large GTF files, initial loading may take a few seconds while features are indexed for search
- BED12 files with thick/thin regions are rendered as CDS/UTR structures, just like gene models
- Sessions remember display settings (strand colors, display mode, track order)
