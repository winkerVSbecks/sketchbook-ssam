# Sketchbook-SSAM

A generative art sketchbook built on [ssam](https://github.com/cdaein/ssam).
The sections down to [Archive](#archive) are the contract — what you must do.
Everything from there on is reference: what the tools are and where things live.

## Commands

- Run a sketch: `VITE_SKETCH="sketches/<sketch_path>" npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Verify: `npm run test && npm run typecheck`
- Format: `npm run format -- <files you changed>`

## Verify before every commit

```sh
npm run test && npm run typecheck
```

That is the whole ritual. `npm run test` (`scripts/run-smoke-suites.ts`) runs
every Node smoke suite in `scripts/` — discovered by filename as
`scripts/*smoke*.ts`, so a new suite needs no registration — and prints a
per-suite table. `npm run typecheck` is `tsc --noEmit` on the whole tree and is
expected to be green. Never hand-roll a list of suites and never grep `tsc`
output for "your" files — if either command is red, the tree is red.

`npm run cloud:smoke` (`scripts/cloud-render-smoke.ts`) is the one suite kept
out of `test`: it needs Playwright + Chromium and spawns the detached Vite on
:6173. Run it when you touch `scripts/cloud-render.ts`, `scripts/vite-runner.ts`
or the archive renderer.

## Commit each unit as soon as it verifies

The moment a logical unit passes the pair above, commit it. Do not batch
several units into one commit and do not hold verified work for a final
sweep: verified-but-uncommitted work is lost when a session is killed.

## Rendering has side effects outside the working tree

`npm run archive`, `npm run cloud:render` and the archive site's play button
all spawn a **detached** Vite dev server on **:6173** (`scripts/vite-runner.ts`)
and write `.cloud-render/vite.pid` (plus `vite.log`). That server outlives the
command that started it.

- **:5173 belongs to the human's `npm run dev`. Never start, stop, probe or
  kill anything on it.**
- The runner only ever signals a process it recorded in
  `.cloud-render/vite.pid`. If :6173 is held by anything else it refuses and
  says so — do not "free the port" yourself.
- `npm run cloud:stop` is the cleanup. Run it when you are done rendering.

## Format with the repo config

```sh
npm run format -- <files you changed>
```

Prettier reads the repo `.prettierrc` (single quotes, semicolons, width 100,
trailing commas). Never run Prettier with its defaults and never reformat
files you did not change. `src/sketches` is ignored on purpose: sketches are
formatted by hand.

## Sketch work goes through the skills

After any code change to a sketch, use the `verify-sketch` skill (LSP
diagnostics + render a frame via `/export`) — not Playwright, not a manually
invented curl/browser flow. It is proactive: invoke it after `implement-sketch`,
`clrs`, `fork-sketch`, `create-sketch`, or any other edit that changes visual
output, without waiting to be asked.

The entries in `.claude/skills/` are the source of truth for their flows.
Follow them instead of reconstructing the steps:

| Skill               | Use it when                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `verify-sketch`     | after any change to a sketch — diagnostics plus a rendered frame |
| `render-sketch`     | you need to see what a running sketch looks like                 |
| `create-sketch`     | a new plain ssam sketch                                          |
| `create-ui-sketch`  | a new sketch on the canvas-UI shell (`src/ui`)                   |
| `create-tui-sketch` | a new sketch on the terminal desktop (`src/tui`)                 |
| `fork-sketch`       | a variant of an existing sketch                                  |
| `implement-sketch`  | turning an idea into code in an existing sketch                  |

## Archive

- `npm run archive` — incremental: renders only sketches whose last git commit changed (or new ones), uploads PNGs to Cloudinary, regenerates `archive-app/archive.json` + the site in `archive-app/dist/`.
- `npm run archive:site` — regenerate the static site from existing `archive.json` only (no rendering or uploads). Useful for tweaking HTML/CSS.
- `npm run archive:dev` — rebuild the site and serve it locally (opens the browser; `/` = by year, `/series/` = by series).
- `npm run archive:force` — re-render and re-upload every sketch.
- `npm run archive -- --only <pattern>` — restrict to sketches whose id contains the pattern or starts with it as a folder prefix (`--only sketches/canvas-ui`, `--only canvas-ui`).
- `npm run archive -- --dry-run` — print the plan without rendering.
- Requires `.env` at repo root with `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`.
- Rendering runs its own detached Vite on :6173 — see [Rendering has side effects outside the working tree](#rendering-has-side-effects-outside-the-working-tree).

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
- Full example: `src/sketches/terminal-ui/layered-compositions.ts` (`VITE_SKETCH="sketches/terminal-ui/layered-compositions" npm run dev`). Node smoke tests (`scripts/tui-smoke*.ts`, `scripts/growth-viewport-smoke.ts`) run under `npm run test`.
- Palette picker: `src/sketches/terminal-ui/palette-picker.ts` (`VITE_SKETCH="sketches/terminal-ui/palette-picker" npm run dev`) browses every colour system in `src/colors` (clrs, auto-albers, mindful, found, uchu, riso, oklch, hsluv) as desktop windows — systems → library → swatches (hex · OKLCH · contrast · theme role) → derived `TuiTheme` → copyable code — and retints the desktop with the pick. The system registry lives in `palette-systems.ts` beside it; add a system there.
- New sketch on the desktop: use the `create-tui-sketch` skill (template + scaffold live in `.claude/skills/create-tui-sketch/`).

## cusphanger colour system (P3 ground + contrast tiers)

- `src/colors/cusphanger.ts` — `cuspPalette({ hue?, angle?, count?, shuffle?, saturation?, coolWarm?, ground?, gamut? })` builds a tinted ground plus foreground colours grouped by WCAG contrast into `high` (≈9:1 ink), `mid` (≈4.5:1 accent) and `low` (≈1.6:1 wash) tiers. Hues come off a ring: from the base hue (which tints the ground) a hue every `angle` degrees round the wheel, shuffled, `count` taken and sorted — harmony is a dial (small angle ≈ analogous, 120 ≈ triad, 180 ≈ complement) and the shuffle leaves gaps instead of an arc (`shuffle: false` takes the first `count` in sequence); each hue's ramp is `cusphanger`'s Wijffelaars Bézier through the cusp, gamut-clamped by `nutelch` (`oklchP3` default). `colors` is the `[bg, ...fg]` array sketches expect, as `oklch()` strings — pair with `settings.attributes = { colorSpace: 'display-p3' }` for a P3 canvas. Smoke test (`scripts/cusphanger-smoke.ts`) runs under `npm run test`.
- Explorer: `src/sketches/terminal-ui/cusp-hanger.ts` (`VITE_SKETCH="sketches/terminal-ui/cusp-hanger" npm run dev`) — parameters, palette table, hue strip, the focused hue's chroma–lightness slice (sRGB shell solid, P3 reach hatched), a specimen on the palette's own ground and a copyable snippet; the chrome stays black and white so only the swatches carry colour. Also listed in the palette picker.

## Code Style Guidelines

Prettier owns formatting and `tsc --noEmit` under `strict` owns typing; neither is
restated here. What follows is what the tools cannot check for you.

- **Types**: Name complex shapes with a `type`/`interface` rather than repeating inline anonymous objects
- **Imports**: Group by external libraries first, then project modules
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Sketch Structure**: Follow patterns in existing sketches using ssam's `SketchProps` and `SketchSettings`
- **Nulls**: `strict` makes you handle them; prefer optional chaining and nullish coalescing over if-guards
- **Comments**: Document complex algorithms or non-obvious implementations
- **Color Management**: Use the existing palettes and helpers in `src/colors/` (clrs, auto-albers, mindful, uchu, riso, cusphanger, …) rather than hand-picked hex
- **Animation**: ssam drives the loop — animate inside `wrap.render` off `playhead`, never a hand-rolled `requestAnimationFrame`

ssam is a generative art framework — reference existing sketches when creating new ones.

## Design Context

- `PRODUCT.md` (repo root) holds the design strategy: register, users, brand personality ("quiet, precise, systematic"), anti-references, and principles. `DESIGN.md` holds the visual system ("The Flat File": achromatic chrome, hairlines, tabular numerals).
- Register split: the archive site is **brand** (design is the presentation of the art); dev tooling (`gallery.html`, sketch runner) is **product**.
- The archive site is generated by the `archive-app` npm workspace (React SSG): everything in `archive-app/dist/` is build output (gitignored) — edit `archive-app/src/`, then run `npm run archive:site`. The data lives at `archive-app/archive.json` (tracked).
