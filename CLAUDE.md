# Sketchbook-SSAM Project Guide

## Commands
- Run a sketch: `VITE_SKETCH="sketches/<sketch_path>" npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Verifying sketch changes
- After any code change to a sketch, use the `verify-sketch` skill (LSP diagnostics + render a frame via `/export`) — not Playwright, not a manually invented curl/browser flow. It's proactive: invoke it after `implement-sketch`, `clrs`, `fork-sketch`, `create-sketch`, or any other edit that changes visual output, without waiting to be asked.

## Archive
- `npm run archive` — incremental: renders only sketches whose last git commit changed (or new ones), uploads PNGs to Cloudinary, regenerates `archive-app/archive.json` + the site in `archive-app/dist/`.
- `npm run archive:site` — regenerate the static site from existing `archive.json` only (no rendering or uploads). Useful for tweaking HTML/CSS.
- `npm run archive:dev` — rebuild the site and serve it locally (opens the browser; `/` = by year, `/series/` = by series).
- `npm run archive:force` — re-render and re-upload every sketch.
- `npm run archive -- --only <pattern>` — restrict to sketches whose id contains the pattern or starts with it as a folder prefix (`--only sketches/canvas-ui`, `--only canvas-ui`).
- `npm run archive -- --dry-run` — print the plan without rendering.
- Requires `.env` at repo root with `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`.

## Light Table (output review)
- `npm run review` — local-only, keyboard-first review of everything in `output/`, grouped by day (port 5180; `?` shows shortcuts). Loupe + `g` contact sheet; `s` stars keepers, `S` filters to them.
- Source: `archive-app/src/review/` (client app + Vite dev-server plugin). Never part of the deployed archive build.
- Cache/state: `output/.review/` (thumbnails + `keepers.json`, gitignored with `output/`). Thumbnails prewarm on server start (sharp for images, repo ffmpeg for video first-frames).

## Atlas (map of the work)
- `npm run atlas` — local-only infinite-canvas map of every archived sketch (port 5181; `?` shows shortcuts). Four lenses: `1` Clusters (thematic rooms), `2` Series (folders, chronological), `3` Timeline (months × cluster lanes), `4` Spectrum (measured color: hue wheel + achromatic column). Drag pans, ⌃-scroll/pinch zooms, double-click zooms in on a point (⇧ out), `f` fits. The rail lists clusters, cross-series threads, opportunity insights, and `r` recent (the 20 newest sketches grouped by directory); selecting a node opens a detail panel with tags, nearby (cross-series similarity), and a copyable run command.
- Source: `archive-app/src/atlas/` (pure client app, no server plugin). Never part of the deployed archive build. Data: `archive-app/atlas.json` (tracked).
- Data pipeline: `scripts/atlas/` — per-sketch code + vision records are agent-generated (tagging contracts in `scripts/atlas/tagging/`), color metrics are computed by `visual-metrics.ts`, and `assemble.ts` deterministically rebuilds `atlas.json` (similarity edges, tag counts). See `scripts/atlas/README.md` to regenerate after archiving new sketches.

## Canvas UI (sketch chrome)
- `src/ui/` — dependency-free canvas controls in "The Flat File" aesthetic: grid rulers with world-coordinate graduations (`drawGridMarkers`), camera (`createCamera`), windows (`createWindow`), toggle groups (`createToggleGroup`), ranges (`createRange`), magnifying-glass loupe (`createLoupe`), and `createShell` which wires them all so a sketch only supplies `drawScene(ctx, cam, view)`.
- Full example: `src/sketches/canvas-ui/controls-demo.ts` (`VITE_SKETCH="sketches/canvas-ui/controls-demo" npm run dev`).
- New sketch with the shell: use the `create-ui-sketch` skill (template + scaffold live in `.claude/skills/create-ui-sketch/`).

## Terminal UI (character-grid desktop)
- `src/tui/` — a second dependency-free canvas UI system in the terminal-chart aesthetic: a ROWS×COLS glyph buffer (`createGlyphBuffer`, `createMetrics`, `themeFromPalette`), box-drawing windows with `[–][□][×]`, title drag and corner resize (`createTuiWindow`), a system menu bar (`createMenuBar`), glyph controls (`createButton`, `createToggleGroup`, `createRange`), a settings popup menu hung off the bar (`createPopupMenu`), and `createDesktop` which wires them so a sketch only supplies `draw(buf, inner, win)` per window; `desktop.resize(width, height)` follows the viewport (wire to `wrap.resize`). Reuses `attachPointer`/`createUI` from `src/ui`.
- Full example: `src/sketches/terminal-ui/layered-compositions.ts` (`VITE_SKETCH="sketches/terminal-ui/layered-compositions" npm run dev`). Node smoke tests: `npx tsx scripts/tui-smoke.ts`.
- New sketch on the desktop: use the `create-tui-sketch` skill (template + scaffold live in `.claude/skills/create-tui-sketch/`).

## Code Style Guidelines
- **TypeScript**: Use strict typing with interfaces/types for complex objects
- **Imports**: Group by external libraries first, then project modules
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Sketch Structure**: Follow patterns in existing sketches using ssam's `SketchProps` and `SketchSettings`
- **Canvas Drawing**: Use context operations with appropriate type annotations
- **Error Handling**: Use optional chaining and nullish coalescing for potential nulls
- **Comments**: Document complex algorithms or non-obvious implementations
- **Color Management**: Use existing color utilities from project (clrs, texel-colors)
- **Animation**: When animating, use requestAnimationFrame-compatible approaches

SSAM is a generative art framework - reference existing sketches when creating new ones.

## Design Context
- `PRODUCT.md` (repo root) holds the design strategy: register, users, brand personality ("quiet, precise, systematic"), anti-references, and principles. `DESIGN.md` holds the visual system ("The Flat File": achromatic chrome, hairlines, tabular numerals).
- Register split: the archive site is **brand** (design is the presentation of the art); dev tooling (`gallery.html`, sketch runner) is **product**.
- The archive site is generated by the `archive-app` npm workspace (React SSG): everything in `archive-app/dist/` is build output (gitignored) — edit `archive-app/src/`, then run `npm run archive:site`. The data lives at `archive-app/archive.json` (tracked).