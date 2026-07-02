# Design Brief: Archive Series View

Status: **confirmed** 2026-07-02 (via `/impeccable shape archive series view`)

## 1. Feature Summary

Rebuild the archive as a minimal React workspace app that statically generates **two views of the same 372-sketch record**: the existing by-year chronology and a new by-series view exposing the drawer structure the repo already encodes (61 series + one-offs). A quiet type-to-filter island is the only client JavaScript. Everything ships as static HTML through the existing `npm run archive:site` flow.

## 2. Primary User Action

Find a specific sketch or series in seconds — by jumping to a year, opening the series drawer, or typing a few characters — then share a link that lands exactly there.

## 3. Design Direction

Unchanged and non-negotiable: DESIGN.md's **Flat File** system — achromatic chrome (Ink/Pencil/Hairline/Unprimed), system stack, tabular numerals, flat elevation, zero hue. Anchor references for the new pieces: the **drawer label tabs** of a flat file (view toggle, sticky section headers) and a **book's index page** (the series index — names + counts, nothing more). Light theme per PRODUCT.md scene. No new colors, no new typefaces.

## 4. Scope

Production-ready. New npm workspace `archive-app/` wired into `npm run archive:site`; breadth = the whole archive surface (both views, mobile through desktop); interactivity = static pages + one hydrated filter island; polish until it ships. The old `renderHtml()`/`renderCss()` string templates retire once output parity is verified.

## 5. Layout Strategy

- **By-year view** (`/archive/`): identical to today — masthead, byline, year sections, the one grid rule. The sticky year header gains quiet year-jump links: current year label left (Pencil, as now), other years right-aligned as links, inside the same single sticky element. No new chrome layer.
- **By-series view** (`/archive/series/`): same masthead and grid system. Top: the **series index** — a wrapping inline list, alphabetical, `name count` (name = Ink hairline-underline link, count = Pencil tabular), reading like a book index. Below: one section per series with ≥2 sketches (55 sections), ordered by most-recent activity (active drawers first), each with the same sticky Pencil header pattern (`series-name · 23`). Singletons and 1-item series collect in a final **One-offs** section (48 items).
- **View toggle**: a `By year · By series` pair in the header meta line, both views. Current view = plain Ink text; other = Ink hairline-underline link. Reads as a drawer label, not a tab bar.
- Within series sections, sketches run newest-first, consistent with the year view. Grid, gutters, card anatomy: untouched.

## 6. Key States

- **Default** (both views); existing Unprimed image-loading placeholders unchanged.
- **Filter active** — non-matching cards hidden (`hidden` attr, instant; inherently reduced-motion-safe), emptied sections hidden, live count `12 of 372` in Pencil tabular beside the input.
- **Filter, zero results** — one Pencil sentence: `No sketches match "xyz".`; input keeps focus; Escape clears.
- **No JS** — filter input never revealed (the island mounts it); all navigation, both views, and every anchor work fully. This is the progressive-enhancement contract.
- **Deep-link entry** — every section (`#2025`, `#nalee`) and every card (slugified id) has an anchor with `scroll-margin-top` clearing the sticky header. Gives per-sketch shareable archive links.
- **Empty archive** — existing `.empty` state carried over.

## 7. Interaction Model

Hover states unchanged (image → 0.65 opacity, Pencil → Ink). The series prefix in each year-view caption (`nalee/…`) links into `#nalee` on the series view. Explicit `:focus-visible` (2px Ink outline, 2px offset) replaces the browser-blue default. Filter: substring match on full sketch id, Escape clears. All view/section navigation is plain links — back/forward and cmd-click behave natively.

## 8. Content Requirements

Toggle labels `By year` / `By series`; series index entries (name + tabular count); `One-offs` label; filter placeholder `Filter by name…` (placeholder color ≥4.5:1 — `#767676`, not Pencil `#888`); result count `N of 372`; zero-result sentence; anchor slug scheme (series name; year; `series/sketch` per card). Imagery stays the Cloudinary thumbnails from `archive.json` — no new assets.

## 9. Recommended References

`layout.md` (two-view IA, index rhythm), `typeset.md` (the series index is a typography problem — one wrapping line-list done perfectly).

## 10. Technical Shape

Workspace `archive-app/`: React + Vite, added via `"workspaces": ["archive-app"]` in root package.json. Build = (1) Vite builds the one island entry (`filter.tsx`) and the ported design-system CSS to stable unhashed filenames, (2) a Node prerender script renders page components via `react-dom/server` `renderToStaticMarkup` from `archive/archive.json` and writes `archive/index.html` + `archive/series/index.html`. No meta-framework. Root `archive:site` delegates to the workspace build; `scripts/archive.ts` keeps owning rendering/upload/data. Verify output parity against the current page before deleting the string templates.

Series derivation: series = first path segment of the sketch id when nested; 372 total → 330 in 61 series, 42 singletons, 6 one-item series (fold into One-offs). Decisions asserted: series ordering by recency, alphabetical index, URL scheme above, no-JS contract.

## Related decisions on the same surface (from critique 2026-07-02)

- `vscode://` links: intentionally kept (owner decision, in `.impeccable/critique/ignore.md`).
- Deferred to `/impeccable harden archive`: favicon, meta description, OG tags, broken-image fallback.
- Deferred to `/impeccable polish archive`: `title` attrs on truncated names, Pencil → `#767676`, dead backdrop-filter on sticky header, back-to-top, `h1`/`<title>` mismatch. (Several of these come free in the rebuild — fold in during craft.)
