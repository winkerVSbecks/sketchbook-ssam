# Design Brief: Light Table (output/ review page)

Status: **confirmed** 2026-07-02 (via `/impeccable shape` — review all exports in `output/`)

## 1. Feature Summary

A local-only, keyboard-first review surface for everything in `output/` (~5,650 files: 4,175 png / 1,455 mp4 / 24 svg / 1 gif, 22 GB). Exports group by day parsed from the filename datestamp — 252 distinct days, heavily skewed (busiest: 646 files on 2026.05.17). You flip through exports one at a time at full size, jump between days, orient via a toggleable contact-sheet minimap, and star keepers to a persisted shortlist. For Varun alone, at his desk, reviewing an evening's work or excavating an old idea.

## 2. Primary User Action

Hold `→` and watch exports flow past without touching the mouse. Everything else serves that.

## 3. Design Direction

- **Register: product** (dev tooling per PRODUCT.md's register split — like `gallery.html`, not the archive brand surface), but wearing the archive's system.
- **Theme: Gallery White** (owner decision — flipped from the proposed dark light table). The page extends DESIGN.md's **Flat File** exactly: `#ffffff` ground, Ink `#111` text, Pencil `#767676` metadata, 1px Hairlines `rgba(0,0,0,0.08)`, Unprimed `#f4f4f3` placeholder ground. The light table is a white viewing wall, not a darkroom. Zero hue in chrome (Borrowed Color Rule holds).
- Scene: *Varun at his desk in daylight, flipping through prints laid on white — the same drawer, opened to the day's pulls.*
- **Anchors:** Lightroom's loupe + grid toggle, Photo Mechanic's instant-flip speed, macOS Quick Look's zero-ceremony arrow-key browsing. They lend the interaction model, not the palette.
- Flat File discipline throughout: tabular numerals, hairline structure, one uniform grid rule, no shadows, no crossfades.

## 4. Scope

Production polish. One screen, two modes (loupe + contact sheet) plus a keepers-only filter mode. Shipped-quality interactivity. **Local-only**: a new `npm run review` command serves it with `output/` mounted; never part of the deployed `dist/`.

## 5. Layout Strategy

- **Loupe-first.** The focused export fills the viewport (`object-fit: contain`, never cropped) on white. One thin header row carries all chrome: day label left (`2026.05.17 · Sat · 312/646`), filename + sketch prefix center-right (`arcs-reduction · 2025.10.05-23.22.48.png`), overall position far right (`day 183/252`). All metadata Pencil tabular; filename Ink.
- Below the header a full-width hairline doubles as a **day scrubber** — a proportional Ink marker showing position within the day.
- **Contact sheet (`g`)** replaces the loupe: a dense uniform grid of the current day's thumbnails (virtualized — 646 cells must scroll smoothly), current export marked with an Ink ring, sticky day header in the archive's Section Header grammar. Arrow keys move in 2D; adjacent days reachable by scrolling past the boundary or `[` / `]`.
- No sidebars, no permanent filmstrip — the minimap is a mode, not furniture.

## 6. Key States

- **Loupe default** — export full-bleed, chrome quiet.
- **Video focused** — autoplays as a muted loop; `Space` pauses; small `mp4` marker (Pencil) in the header.
- **Contact sheet open** — fast toggle (≤200 ms; instant under `prefers-reduced-motion`).
- **Day boundary crossed** — header updates, day label ticks. No interstitial, no toast.
- **Starred** — Ink star glyph beside the filename in the header; small Ink corner dot on the export's contact-sheet cell. Achromatic, per the Borrowed Color Rule.
- **Keepers-only mode** — stream and sheet filter to starred items, day grouping preserved; header shows `keepers · 37`. Zero keepers → one Pencil sentence (`No keepers yet — press s on anything worth keeping.`).
- **First run / thumb cache building** — loupe works immediately from originals; sheet cells fill in as thumbnails generate, one-line Pencil progress note (`building thumbnails · 1,204/5,650`).
- **Unloadable file** — Unprimed placeholder cell with filename in Pencil; skipped by preload, not by navigation.
- **Undated files** — an `undated` group after the last day. CleanShot's `YYYY-MM-DD at HH.MM.SS` format parses as dated; only true strays (`Frame 1.png`, `nalee.png`, `mcp-*.png`) land here.
- **Empty `output/`** — one Pencil sentence, fix inline as code (matches the archive's empty state).

## 7. Interaction Model

| Key | Action |
|---|---|
| `→` / `←` (alias `j` / `k`) | next / previous export, continuous across days |
| `]` / `[` (alias `Shift+→/←`) | first export of next / previous day |
| `g` | toggle contact-sheet minimap |
| `Enter` (in sheet) | open selection in loupe; `Esc` cancels back without moving |
| `Home` / `End` | first / last export of current day |
| `Space` | play/pause focused video |
| `s` | toggle star on focused export (persists immediately) |
| `S` | toggle keepers-only mode |
| `c` / `o` | copy file path / reveal in Finder |
| `?` | shortcuts overlay |

Navigation is **instant swap — no crossfade**; speed is the feature (Photo Mechanic, not a slideshow). Neighbors ±3 preloaded and pre-decoded. URL hash tracks the focused file (`#2026.05.17-15.46.55`) so refresh resumes in place; keepers-only mode is session state, not URL. Hover states follow the archive's two sanctioned moves only.

## 8. Content Requirements

- Filename parsing: primary datestamp `YYYY.MM.DD-HH.MM.SS`; CleanShot `YYYY-MM-DD at HH.MM.SS`; optional sketch prefix (`arcs-reduction-…`, shown as its own label); optional trailing git short-hash (shown as-is, Pencil).
- Day labels tabular: `2026.05.17 · Sat · 646 exports`. Counters: `312/646`, `day 183/252`, `keepers · 37`.
- Media pipeline: gitignored thumbnail cache (~320 px WebP; sharp for images/gif, ffmpeg first-frame for mp4 — ffmpeg already a repo dependency), built incrementally at server start.
- Top-level files only (`sujni-nalee/` subfolder, `.DS_Store`, non-media ignored).
- Microcopy: empty state, keepers-empty state, thumb-build progress, unloadable-file label, shortcuts overlay.

## 9. Recommended References

`optimize.md` (5.6k-item media performance), `layout.md` (contact-sheet density), `animate.md` (the one sheet transition).

## 10. Technical Shape

- Lives in the `archive-app` workspace as a separate entry (`src/review/`), sharing `style.css` tokens and component idioms, but it is a client-side app (unlike the SSG pages) and is **excluded from the deployable build**.
- `npm run review` (root script) → scans `output/` top-level, builds the index (parse dates/prefixes/hashes, group by day), starts a local server: review page + `/output` static mount + endpoints for keeper toggles, reveal-in-Finder, and incremental thumb generation.
- Persistence: `output/.review/` (gitignored) holds `thumbs/` and `keepers.json`. Keeper toggles are optimistic client-side, persisted via the endpoint.
- Contact sheet virtualized; index shipped as JSON at startup.

Decisions asserted: white theme (owner), keepers in v1 (owner), videos autoplay when focused, instant swap over crossfade, top-level files only, keepers-mode not in URL. No open questions.
