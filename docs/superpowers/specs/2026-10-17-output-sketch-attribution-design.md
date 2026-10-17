# Output → sketch attribution, and a by-sketch Light Table view

Date: 2026-10-17 · Status: draft, pending builder check

## Why

`output/` is one flat folder: ~4,900 PNGs and ~1,460 videos since Dec 2023,
almost all named only by a timestamp (`2025.05.28-11.06.20.png`). Varun can't
tell which sketch file made what. He wants each file attributed to the sketch
that generated it, and a Light Table view that shows the work grouped by
sketch.

This is also his first real use of TypeSafe's image models (Jev, behind the
`TypeSafe-Danger-Zone-Images: true` header), so the script should show the
pattern clearly: code builds a shortlist, Jev selects from it.

## Goals

- A re-runnable script that writes an attribution for every file in
  `output/` it can attribute with confidence, to JSON.
- A "group by sketch" mode in the Light Table: a ledger of sketches, each
  opening the existing contact sheet filtered to that sketch.

## Non-goals

- Renaming, moving or rewriting anything in `output/`. **Filenames are never
  modified** — not existing files, and not future exports (no change to the
  dev runner or to sketches' `prefix` settings).
- Calling TypeSafe from the Light Table. The UI only reads the JSON.
- Attributing every file. Coverage below 100% is expected and fine.

## Anti-goals (would make this a failure even if it works)

- **A wrong label shown as a label.** When the script can't tell, the file is
  _unlabelled_ — no best guess, no "probably" in the UI (Varun's decision).
- Touching :5173 or any running dev server; the script needs none.

## Constraints

- TypeSafe images are "dreamer-ready" (experimental). Pin the model
  (`jev-1.14.0`; `jev-latest` moves to 1.14 around 2026-10-21 anyway).
- Image limits: PNG/JPEG only, each side 280–1568 px, 32 MiB per request,
  64k-token per-request context by default. Images are rejected, not resized.
- Price is $0.042 per million input tokens; output tokens are free. A full
  run is expected to cost single-digit dollars — the pilot measures it.
- `TYPESAFE_API_KEY` lives in the repo `.env` (load with `dotenv/config`, as
  `scripts/archive.ts` does). Node is v26, so `@typesafe-ai/sdk@0.7.0`
  (Node ≥ 22) works.
- Repo rules (AGENTS.md): `npm run test && npm run typecheck` green before
  each commit; commit each unit as it verifies; format only changed files with
  `npm run format -- <files>`.

## Part 1 — the attribution script

### Signals, in order of authority

1. **Filename prefix** (`gpu-million-…`, `arcs-reduction-…`). Comes from a
   sketch's ssam `prefix` setting. It names a _family_, not always a file:
   `arcs-reduction-` is set by three files in `paint-without-thinking/`.
   The prefix restricts the candidate set to the sketch files that have ever
   set that prefix (find them with `git log -G"prefix:"`). If exactly one
   file matches, attribute directly with method `prefix` — no Jev call.
2. **Git short-hash suffix** (`…-b46dc92`). When present, the candidates
   are the sketch files changed in that commit.
3. **Git time window.** Otherwise, candidates are the sketch files (`src/sketches/**/*.ts`,
   excluding `_test`) added, modified or renamed in commits from **2 days
   before to 3 days after** the file's timestamp. Measured on the current
   history: median 11 candidates, p90 34, max 58; 93 of 6,744 files have
   none. On the 187 prefixed files, the true family was in the window 145
   times (78%). The misses are revisits of old, already-committed sketches,
   and they stay unlabelled.

Signals 1 and 2 intersect with 3 when both apply; if the intersection is
empty, use the narrower signal alone. A prefix that matches no sketch file
(`compressO-` is a screen-recorder, not a sketch) or a hash commit that
touches no sketch file falls back to the time window.

### What counts as a candidate (Claude's call)

- **Sketch entry files only**, by the archive's own rule: the source contains
  `ssam(sketch` (`scripts/archive.ts`). Helper modules (`nalee/walker.ts`,
  `trochoidal-wave/dither.ts`, …) can't render anything, so they are never
  options. A commit that touches only a helper contributes the entry files
  that import it, using the imports at that commit.
- **Renames are followed forward** to the current path (`git log -M`; there
  are ~72 renames under `src/sketches`). The current path is used for the id,
  the ledger row and the archive reference picture. Without this, one sketch
  would show up as two ledger rows, and older candidates would lose their
  pictures. The export-time path is also stored, as `pathAtExport`.
- **Deleted sketches** keep their last path as the id, with no reference
  picture, and are marked `deleted: true`. They can still win, but only on
  their path and the timing evidence.

### The Jev question

One System One request per output file:

- `state`: the output image, plus its timestamp.
- One **Choice**: "Which sketch rendered `output`?" Each candidate is an
  option keyed by a short safe id (for example `c07`) and described by its
  path and its **reference picture**: the sketch's archive render from
  `archive-app/archive.json` → Cloudinary URL. Request a small Cloudinary
  transform (≈320–512 px) so references are cheap; they must stay ≥ 280 px.
  Candidates with no archive render (deleted or never-archived files) are
  described by path only.
- A `none` option: "None of these sketches made this image."
- Model `jev-1.14.0`, header `TypeSafe-Danger-Zone-Images: true`.

If a shortlist is too large for the context window (the pilot shows where
that line is), split it into batches, ask each batch with its own `none`,
then ask a final Choice across the batch winners.

**Accept rule:** a Jev answer becomes a label only when the choice is not
`none` and `confidence ≥ THRESHOLD`. The threshold is set from the pilot,
not guessed in advance. Everything else is recorded as unlabelled.

### Inputs

- Images: read from `output/`. Downscale anything over 1568 px (sharp is
  already a dependency of `archive-app`).
- Videos: use the Light Table's existing first-frame thumbnail
  (`output/.review/thumbs/<name>.webp`, 320 px WebP) and convert it to JPEG.
  If the thumbnail doesn't exist yet, skip the file (it's picked up on the
  next run).
- SVGs and other strays: skip.

### Output: `output/.review/sketches.json`

Gitignored with the rest of `output/`, next to `keepers.json`. One entry per
file the script has processed, labelled or not:

```json
{
  "version": 1,
  "model": "jev-1.14.0",
  "threshold": 0.7,
  "files": {
    "2026.10.10-19.32.55.png": {
      "sketch": "sketches/differential-growth/khidki",
      "path": "src/sketches/differential-growth/khidki.ts",
      "pathAtExport": "src/sketches/differential-growth/windows.ts",
      "method": "jev",
      "confidence": 0.91,
      "candidates": ["sketches/differential-growth/khidki", "…"],
      "taggedAt": "2026-10-17T20:00:00Z"
    },
    "2024.03.02-10.11.12.png": {
      "sketch": null,
      "method": "unlabelled",
      "reason": "no-candidates | none | low-confidence",
      "confidence": 0.41,
      "candidates": ["…"],
      "taggedAt": "…"
    }
  }
}
```

Sketch ids use the archive's form (`sketches/<path without .ts>`). Raw Jev
answers (probabilities, confidence) are kept, so a new threshold can be
applied later without new API calls.

### Runs

- `npm run tag:output` — incremental: skips files already in the JSON. Write
  the JSON as it goes (or in small batches) so an interrupted run loses
  little.
- `--pilot N` — a scored sample. Ground truth, all from 2025–2026:
  - **Prefixed files, prefix withheld.** Ask Jev using only the time-window
    shortlist. A pick anywhere in the prefix's family counts as correct
    (`arcs-reduction-` is three files). Cap the October 2025 arcs-reduction
    files so one family doesn't dominate the score.
  - **Hash-suffixed files whose commit touches exactly one sketch entry
    file** (72 of the 111), with the hash withheld.
  - A random spread across 2023–2026 with no ground truth, for the
    confidence distribution and for review by eye.
  - **About 30 files from 2023–24, hand-labelled by Varun.** These are the
    only ground truth for the years where reference pictures are least
    alike. The pilot picks them spread across both years, then serves a
    one-page labelling sheet from the Light Table server (Claude's call on
    the mechanism: a `/pilot` page plus a `POST /api/pilot-truth` route).
    The sheet shows each file with its shortlist (names and reference
    pictures) and a "none of these / can't tell" button. Answers are saved
    to `output/.review/pilot-truth.json`, and Jev is scored on them
    separately. If 2023–24 needs a stricter threshold than 2025–26, the
    accept rule takes a threshold per period.

  It prints, per group: accuracy at a range of thresholds, the share of
  `none` answers, `usage.input_tokens` per request, and a cost projection for
  the full run.

- `--force` re-tags everything; `--rethreshold` re-applies a threshold to
  stored answers without API calls.
- Concurrency stays modest; the SDK already retries 429s.

### Pilot gate

Before the full run, Varun looks at the pilot results: the numbers, plus the
pilot's groups in the new Light Table view (where wrong attributions are easy
to spot). He signs off on the threshold before the ~6,400-file run.

## Part 2 — the Light Table "by sketch" view (Option B, Ledger)

- `v` toggles between grouping by day (today's view) and by sketch.
- **Ledger:** one row per sketch, with:
  - a 56 px image
  - the sketch name, with its `src/sketches/…` path below in muted text
  - the file count
  - the date span (first → last output)
- **Sort:** by most recent output (default), with a toggle to sort by count.
  The key is the builder's choice; it must not clash with the existing keys
  (`o` already reveals the file in Finder).
- **The row's image:** a starred keeper from that sketch if there is one,
  otherwise its most recent output. This is Claude's call.
- **Unlabelled** is the last row, dimmed, with its count.
- **Opening a sketch:** click a row, or arrow to it and press Enter, to open
  the existing contact sheet filtered to that sketch.
  - The loupe, arrows, `s`/`S` and video work unchanged.
  - `[`/`]` step to the previous or next sketch, and `esc` returns to the
    ledger.
  - The header shows `<sketch> · i/n` where the day label normally goes.
- **Data:** a new `GET /api/sketches` route in
  `archive-app/src/review/server/plugin.ts` serves `sketches.json`. If the
  file is missing, `v` shows a one-line note on how to run `npm run tag:output`,
  styled like the existing empty-keepers message.
- **Visual system:** "The Flat File" per DESIGN.md and the existing
  `review.css` tokens: achromatic chrome, hairlines and tabular numerals. The
  exports supply all the colour.
- The `?` help overlay lists the new keys.

## Testing

- A new `scripts/*smoke*.ts` suite (auto-discovered by `npm run test`)
  covers the pure parts:
  - parsing prefixes and hashes
  - the git-window shortlist, tested against a fixture commit list
  - prefix-family narrowing
  - the accept rule and re-thresholding
  - incremental merge of the JSON
- The grouping logic for the by-sketch view goes in
  `archive-app/src/review/model.ts` as pure functions, so the same suite can
  cover it.
- No smoke test calls the TypeSafe API.

## Also in scope

- Add `.superpowers/` to `.gitignore`. The brainstorm mockups live there.

## Left to the builder

- File and module names for the script; the default keys are suggested above.
- How the git history is cached during one run.
- Concurrency level and batch-split mechanics.
- Exact Cloudinary transform for references, within the 280 px minimum.
