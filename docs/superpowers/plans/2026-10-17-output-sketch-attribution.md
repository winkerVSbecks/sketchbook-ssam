# Output → Sketch Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute each file in `output/` to the sketch that rendered it (git-history shortlist → Jev picks or abstains) into `output/.review/sketches.json`, and add a by-sketch Ledger view to the Light Table.

**Architecture:** A Node CLI (`scripts/tag-output.ts`) builds a per-file candidate shortlist from git history and filename prefixes/hashes. It asks Jev one Choice per file, with each candidate's archive render as its option picture, and stores the raw answers plus an accept decision. The Light Table reads the JSON through a new route. A pure `buildSketchTimeline` regroups the stream by sketch, which lets the existing sheet/loupe/`[ ]` navigation work unchanged. A new Ledger component lists the groups.

**Tech Stack:** TypeScript run by `tsx`; `@typesafe-ai/sdk@0.7.0`; `sharp` (already hoisted); `dotenv`; git CLI; React 19 + Vite 8 (archive-app review workspace); Node smoke suites (`node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-10-17-output-sketch-attribution-design.md`

## Global Constraints

- Never rename, move or write any file in `output/` except under `output/.review/`. Never change the dev runner or any sketch's `prefix`.
- An unconfident or `none` answer is stored as unlabelled. The UI never shows a guess.
- Model `jev-1.14.0`, pinned. Header `TypeSafe-Danger-Zone-Images: true` on every request. `TYPESAFE_API_KEY` comes from the repo `.env` via `import 'dotenv/config'`.
- Images sent to the API: PNG or JPEG, each side 280–1568 px, ≤ 32 MiB per request.
- Git window: commits from 2 days before to 3 days after the export timestamp. Timestamps are parsed as local time, as in `archive-app/src/review/model.ts`.
- A candidate is an entry file: its source matches `/\bssam\s*\(\s*sketch\b/`, under `src/sketches/`, excluding `_test`. Sketch id = `sketches/<path from src/sketches/ without .ts>`, matching `archive.json`.
- Renames are resolved forward to the HEAD path; `pathAtExport` keeps the original path. Files absent at HEAD are `deleted: true`.
- The thresholds are not guessed: the full run refuses to start until thresholds are stored or passed in.
- Never touch :5173. The script needs no dev server.
- Each commit: `npm run test && npm run typecheck` green. For tasks touching `archive-app/src/review/`, also run `npx tsc --noEmit -p archive-app`. Today that reports exactly one pre-existing error in `archive-app/src/atlas/model.ts(109,26)`, and no new error may appear. Format only changed files with `npm run format -- <files>`.

## Review Focus

1. **Interrupted run (Ctrl-C, crash, 429 storm):** the next run resumes where it stopped and the JSON is never truncated. _Pinned in Task 5 (`saves atomically and resumes`)._
2. **Exports made after the last run, and undated strays (`CleanShot …`, `w9-verify-…`):** these show up under Unlabelled in the view, and the script records them as `no-candidates` instead of crashing. _Pinned in Task 3 and Task 7._
3. **A file the API rejects (corrupt PNG, tiny image), or a bad key:** the first is recorded as unlabelled `reason: 'error'` and the run continues; a 401/403 aborts the run at once. _Pinned in Task 5._
4. **A missing or malformed `sketches.json` while the Light Table is open:** `v` shows the run-the-script note, and the app never crashes. _Pinned in Task 6 (route) and Task 8 (UI)._
5. **Keepers-only (`S`) combined with by-sketch mode:** the groups contain only keepers, and an empty sketch disappears from the ledger. _Pinned in Task 7._

---

### Task 1: Shared attribution types, accept rule and store

**Files:**

- Create: `archive-app/src/review/attribution.ts`
- Modify: `archive-app/src/review/model.ts` (export `parseName` and its `Parsed` type)
- Create: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Produces (in `attribution.ts`; all later tasks use these):
  - `type JevAnswer = { choice: string | null; confidence: number; probabilities: Record<string, number> }`
    - `choice` is a sketch id, or `null` for `none`.
    - `probabilities` are keyed by sketch id, plus `'none'`.
  - `type UnlabelledReason = 'no-candidates' | 'none' | 'low-confidence' | 'error' | 'unsupported' | 'pending'`
  - `type FileAttribution = { sketch: string | null; path: string | null; pathAtExport: string | null; deleted?: boolean; method: 'prefix' | 'jev' | 'unlabelled'; reason?: UnlabelledReason; confidence: number | null; candidates: string[]; answer?: JevAnswer; taggedAt: string }`
  - `type Thresholds = { default: number; byYear?: Record<string, number> }`
  - `type AttributionFile = { version: 1; model: string; thresholds: Thresholds | null; files: Record<string, FileAttribution> }`
    - This replaces the spec example's single `threshold`, to allow one threshold per period.
  - `thresholdFor(t: Thresholds, ts: number | null): number`
  - `applyAccept(entry: FileAttribution, ts: number | null, t: Thresholds, paths: Record<string, { path: string; pathAtExport: string | null; deleted: boolean }>): FileAttribution`
    - Re-derives `sketch`, `path`, `method`, `reason` and `confidence` from `entry.answer`.
    - Leaves `prefix` and `error` entries untouched.
  - `emptyAttributionFile(model: string): AttributionFile`
  - `mergeFiles(base: AttributionFile, updates: Record<string, FileAttribution>): AttributionFile`
- Produces (in `model.ts`): `export function parseName(name: string): Parsed` and `export type Parsed`.

- [ ] **Step 1: Write the failing tests** in `scripts/output-sketches-smoke.ts`. Use the `test()`/`passed` harness from `scripts/vite-runner-smoke.ts` and end with `console.log(`${passed} tests passed`)`.
  - `thresholdFor uses the year override`: `thresholdFor({ default: 0.7, byYear: { '2024': 0.85 } }, new Date(2024, 2, 1).getTime()) === 0.85`. A 2025 timestamp gives `0.7`, and `null` gives `0.7`.
  - `applyAccept labels at or above threshold`: an answer with `{ choice: 'sketches/a', confidence: 0.7 }` and `default: 0.7` gives `method: 'jev'` and `sketch: 'sketches/a'`, with `path` taken from `paths`.
  - `applyAccept leaves low confidence unlabelled`: confidence `0.69` gives `sketch: null`, `method: 'unlabelled'` and `reason: 'low-confidence'`. `confidence` is still `0.69`.
  - `applyAccept treats none as unlabelled`: `choice: null` gives `reason: 'none'`, even at confidence `1`.
  - `applyAccept keeps prefix entries`: an entry with `method: 'prefix'` comes back deep-equal.
  - `mergeFiles overwrites by name and keeps the rest`.
  - `parseName reads prefix, hash and stamp`:
    - `arcs-reduction-2025.10.05-19.59.49-b46dc92.png` gives `prefix: 'arcs-reduction'` and `hash: 'b46dc92'`.
    - `CleanShot 2022-04-15 at 17.31.04.mp4` gives a non-null `ts`.
    - `w9-verify-torsions-palette0.png` gives `ts: null`.
- [ ] **Step 2: Run `npx tsx scripts/output-sketches-smoke.ts`.** Expected: FAIL on the missing module.
- [ ] **Step 3: Implement `attribution.ts` and export `parseName`.** Pure TypeScript with no Node or DOM imports, because both the script and the browser import it.
- [ ] **Step 4: Run `npx tsx scripts/output-sketches-smoke.ts`.** Expected: `7 tests passed`. Then run `npm run test && npm run typecheck && npx tsc --noEmit -p archive-app`. Expected: only the pre-existing atlas error.
- [ ] **Step 5: Format and commit:** `feat(review): attribution types and accept rule`.

### Task 2: Git history model

**Files:**

- Create: `scripts/output-sketches/history.ts`
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Produces:
  - `type Commit = { sha: string; time: number /* epoch ms */; changes: { status: 'A' | 'M' | 'R' | 'D'; path: string; from?: string }[] }`
  - `parseGitLog(text: string): Commit[]`
    - Parses `git log -M --name-status --format=@%H %ct -- src/sketches` output.
    - `R100\told\tnew` becomes `{ status: 'R', from: old, path: new }`.
    - Other `R`/`C` scores are treated the same way.
  - `forwardRenames(commits: Commit[]): (path: string) => string`
    - Follows rename chains to the newest path.
    - Must survive a rename back to an earlier name (A→B→A) without looping.
  - `sketchIdOf(path: string): string` — `src/sketches/x/y.ts` gives `sketches/x/y`.
  - `type History = { commits: Commit[] /* ascending time */; current: (path: string) => string; existsAtHead: (path: string) => boolean; entryFilesAt: (sha: string) => Set<string>; importersAt: (sha: string, helperPath: string) => string[]; prefixFamilies: Map<string, Set<string> /* HEAD paths */> }`
  - `loadHistory(repoRoot: string): History`. Implementation notes:
    - Uses `execFileSync('git', …)`.
    - `entryFilesAt` runs `git grep -l -E '\bssam\s*\(\s*sketch\b' <sha> -- src/sketches`, memoised per sha, and strips the `<sha>:` prefix.
    - `importersAt` runs `git grep -l <helper basename without .ts> <sha> -- src/sketches`. It then keeps entry files whose `import … from '<spec>'` resolves, via `resolveImport`, to the helper.
    - `prefixFamilies` comes from `git log -G "prefix:" --format=@%H --name-only -- src/sketches`, then `git show sha:path`. Each prefix value matching `/prefix:\s*['"`]([^'"`]+)['"`]/`is stored with its trailing`-`stripped, mapped through`current`.
  - `resolveImport(fromPath: string, specifier: string): string | null`
    - Relative specifiers only. Adds `.ts` when the extension is missing.
    - Returns `null` for bare package specifiers.

- [ ] **Step 1: Write the failing tests:**
  - `parseGitLog reads adds, edits and renames`: a fixture string with two commits, one of them containing `R087\tsrc/sketches/differential-growth/windows.ts\tsrc/sketches/differential-growth/jali.ts`. Assert shas, `time === ct * 1000` and the change objects.
  - `forwardRenames follows chains`: A→B in commit 1 and B→C in commit 2 give `current(A) === C`. A→B followed by B→A terminates and gives A.
  - `sketchIdOf strips src and .ts`.
  - `resolveImport handles ./, ../ and bare`:
    - `resolveImport('src/sketches/nalee/a.ts', './walker') === 'src/sketches/nalee/walker.ts'`
    - `'../lib/x.ts'` resolves to `src/sketches/lib/x.ts`
    - `'d3'` gives `null`
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement `history.ts`.**
- [ ] **Step 4: Run the suite and the verify pair.** Expected: PASS. Then sanity-check the real repo with `npx tsx -e "import {loadHistory} from './scripts/output-sketches/history.ts'; const h=loadHistory(process.cwd()); console.log(h.commits.length, [...h.prefixFamilies].map(([k,v])=>k+':'+v.size))"`. It should list `arcs-reduction:3` and `gpu-million:1`.
- [ ] **Step 5: Commit:** `feat(review): git history model for output attribution`.

### Task 3: Shortlist

**Files:**

- Create: `scripts/output-sketches/shortlist.ts`
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: `Parsed` (Task 1); `History`, `sketchIdOf` (Task 2).
- Produces:
  - `type Candidate = { id: string; path: string /* HEAD path */; pathAtExport: string; deleted: boolean }`
  - `type Shortlist = { candidates: Candidate[]; source: 'prefix' | 'hash' | 'window' | 'prefix+window' | 'hash+window' | 'none' }`
  - `shortlist(file: Parsed, history: History, opts?: { withhold?: boolean }): Shortlist`
  - `WINDOW_BEFORE_MS = 2 * 86_400_000`, `WINDOW_AFTER_MS = 3 * 86_400_000`
- Rules (from the spec):
  - **Window:** entry files (per `entryFilesAt(sha)`) changed by `A`/`M`/`R` in commits with `time ∈ [ts − before, ts + after]`. A helper-only change contributes `importersAt(sha, helper)`.
  - **Prefix:** if the family for `file.prefix` exists, intersect it with the window. If the intersection is empty, use the family alone.
  - **Hash:** entry files in that commit, intersected with the window. If the intersection is empty, use the commit's files alone. An unknown hash falls back to the window.
  - **Unknown prefix** (for example `compressO`): window only.
  - **`withhold: true`:** ignores prefix and hash (used by the pilot).
  - **No timestamp and no usable prefix:** `source: 'none'` and an empty list.
  - Candidates are de-duplicated by HEAD id.

- [ ] **Step 1: Write the failing tests** against a hand-built fake `History` (no git):
  - `window includes 2 days before and 3 after`: commits at ts−2d and ts+3d are included; ts−2d−1s and ts+3d+1s are excluded.
  - `helper-only commit maps to importers`.
  - `prefix family narrows the window`: the family is {a, b}, the window is {a, c}, and the result is [a] with `source 'prefix+window'`.
  - `prefix family used alone when window misses it`: the result is the family and `source` is `'prefix'`.
  - `unknown hash falls back to window`.
  - `withhold ignores prefix`.
  - `undated stray has no candidates`: `parseName('w9-verify-torsions-palette0.png')` gives `source: 'none'` and `candidates: []`.
  - `renamed candidate reports both paths`: `pathAtExport` is the old path, `path` is the HEAD path, and the id comes from the HEAD path.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement `shortlist.ts`.**
- [ ] **Step 4: Run the suite and the verify pair.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(review): candidate shortlist for output files`.

### Task 4: Image preparation and the Jev question

**Files:**

- Create: `scripts/output-sketches/images.ts`, `scripts/output-sketches/jev.ts`
- Modify: `package.json` (add devDependency `"@typesafe-ai/sdk": "0.7.0"`)
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: `Candidate` (Task 3), `JevAnswer` (Task 1), `SketchEntry` (`scripts/archive-types.ts`).
- Produces (`images.ts`):
  - `prepareImage(input: Buffer): Promise<Buffer>`. Outputs a baseline JPEG at quality 90:
    1. Rotate the pixels upright.
    2. Fit inside 1568×1568 without enlarging.
    3. Pad any side under 280 with the median edge colour, centred.
  - `outputImageSource(name: string, outputDir: string): { kind: 'file' | 'thumb' | 'unsupported'; path: string | null }`
    - Images use the file itself.
    - Videos use `output/.review/thumbs/<name>.webp`, or `unsupported` if that thumbnail is missing.
    - `.svg` and others are `unsupported`.
  - `referenceUrl(cloudinaryUrl: string): string`
    - Inserts `w_384,c_limit,f_jpg/` after `/upload/`.
  - `loadReference(id: string, url: string, cacheDir: string): Promise<Buffer>`
    - Fetches once into `output/.review/refs/<id with / → __>.jpg`, then reads from disk.
- Produces (`jev.ts`):
  - `MODEL = 'jev-1.14.0'`, `IMAGE_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' }`, `BATCH_SIZE = 12`
  - `type AskFn = (req: SystemOneRequest) => Promise<{ answers: Record<string, ChoiceResponse>; usage: { input_tokens: number | null } }>`
  - `makeAsk(client: TypeSafeClient): AskFn`
    - Calls `client.systemOne({ ...req, model: MODEL }, { headers: IMAGE_HEADER })`.
  - `buildRequest(output: Buffer, exportedAt: string, options: { key: string; candidate: Candidate; reference: Buffer | null }[]): SystemOneRequest`. Request shape:
    - `state`: `{ output: image(output), exported_at }`
    - question `sketch`: a `choice`
    - instructions: ``"Which sketch rendered the image in `output`? Each option is a sketch file with a recent render of it. Earlier exports of the same sketch can differ in colour, density or parameters but share its structure and drawing method."``
    - criteria: each option key (`c00`, `c01`, …) maps to `{ path: candidate.path, render: image(reference) }`, or `{ path, render: 'no picture available' }` when there is no reference
    - `none: 'None of these sketches made this image.'`
  - `askSketch(ask: AskFn, output: Buffer, exportedAt: string, options: …same as above…): Promise<{ answer: JevAnswer; inputTokens: number }>`
    - With ≤ `BATCH_SIZE` options, it makes one request.
    - Otherwise, each batch of `BATCH_SIZE` gets its own request. Then a final request runs over the non-`none` batch winners, and its answer is returned (all `none` gives `choice: null`).
    - Option keys are mapped back to sketch ids in `choice` and `probabilities`.
    - `inputTokens` sums across requests.

- [ ] **Step 1: Write the failing tests:**
  - `prepareImage fits large images`: a sharp-generated 3000×2000 PNG becomes a 1568×1045 JPEG (check with `sharp(meta)`; the format is `jpeg`).
  - `prepareImage pads thin images`: 1600×200 becomes 1568×280.
  - `prepareImage keeps a 320 webp at 320`: the output is a 320×320 JPEG.
  - `referenceUrl inserts the transform`: `https://res.cloudinary.com/x/image/upload/v1/a.png` becomes `https://res.cloudinary.com/x/image/upload/w_384,c_limit,f_jpg/v1/a.png`.
  - `outputImageSource handles videos without thumbs and svgs`.
  - `askSketch maps keys back to ids`: a fake `AskFn` returns `choice: 'c01'`. Assert `answer.choice === candidates[1].id` and that `probabilities` is keyed by ids plus `'none'`.
  - `askSketch batches 30 candidates`: a fake `AskFn` records calls; there are 3 batch calls and 1 final call, and `inputTokens` is the sum.
  - `askSketch returns none when every batch says none`.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Install the SDK (`npm install -D @typesafe-ai/sdk@0.7.0`) and implement both files.**
- [ ] **Step 4: Run the suite and the verify pair.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(review): Jev sketch question with image prep and batching`.

### Task 5: The run loop and CLI

**Files:**

- Create: `scripts/output-sketches/run.ts`, `scripts/tag-output.ts`
- Modify: `package.json` (add `"tag:output": "tsx scripts/tag-output.ts"`)
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces:
  - `SKETCHES_JSON = 'output/.review/sketches.json'`
  - `readAttributions(path: string): AttributionFile`
    - A missing file gives `emptyAttributionFile(MODEL)`.
    - Malformed JSON throws with the path in the message (never silently resets).
  - `writeAttributions(path: string, data: AttributionFile): void` — writes `<path>.tmp`, then `renameSync`.
  - `type RunDeps = { ask: AskFn; history: History; archive: Map<string, SketchEntry>; loadOutput: (name: string) => Promise<Buffer | null>; loadRef: (c: Candidate) => Promise<Buffer | null>; now: () => string; save: (data: AttributionFile) => void }`
  - `tagFiles(names: string[], data: AttributionFile, deps: RunDeps, opts: { concurrency: number; withhold?: boolean; saveEvery: number }): Promise<{ data: AttributionFile; tokens: number; errors: number }>`
    - Skips names already in `data.files`.
    - A single-candidate prefix family gives `method: 'prefix'` without calling `ask`.
    - An empty shortlist gives unlabelled `no-candidates`.
    - When the loader returns `null`, the file is unlabelled `unsupported`.
    - Other files call `askSketch`, store the `answer`, then `applyAccept` if `data.thresholds` is set.
    - When thresholds are null (pilot), the file stays `unlabelled` with `reason: 'pending'` until a later re-threshold.
    - A `BadRequestError` or `UnprocessableEntityError` gives unlabelled `error`.
    - `AuthenticationError` or `PermissionDeniedError` rethrows (aborting the run) after a final save.
    - Calls `deps.save` every `saveEvery` files and at the end.
  - CLI `npm run tag:output -- [flags]`:
    - default: incremental run over all media in `output/`
    - `--force`: clears `files` first
    - `--limit N`
    - `--threshold 0.7`
    - `--threshold-year 2024=0.85` (repeatable)
    - `--rethreshold`: re-applies the stored or passed thresholds to stored answers, with no API calls
    - `--pilot N` / `--pilot-report`: see Task 9
  - The default run exits 1 with a message if neither stored nor passed thresholds exist.
  - Concurrency is 4 and `saveEvery` is 10.
  - On exit it prints totals: labelled by method, unlabelled by reason, input tokens and cost at $0.042 per Mtok.

- [ ] **Step 1: Write the failing tests**, using fakes for every dependency:
  - `single-member prefix family skips Jev`.
  - `api 400 is recorded and the run continues`: the fake `ask` throws `new BadRequestError(…)` for one file. The result has `reason: 'error'`, and the other files are processed.
  - `auth error aborts after saving`: the fake throws `AuthenticationError`. `tagFiles` rejects, and `save` was called with the files finished so far.
  - `saves atomically and resumes`: `writeAttributions` to a temp dir leaves no `.tmp` behind. A second `tagFiles` over the same names calls `ask` 0 times.
  - `readAttributions refuses malformed JSON`: it throws, and the message includes the path.
  - `rethreshold relabels without asking`.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement `run.ts` and the `tag-output.ts` CLI.**
- [ ] **Step 4: Run the suite and the verify pair.** Expected: PASS. Run `npm run tag:output` with no thresholds. Expected: exit 1 with the thresholds message, and no API call.
- [ ] **Step 5: Commit:** `feat(review): tag:output run loop and CLI`.

### Task 6: Server routes

**Files:**

- Modify: `archive-app/src/review/server/plugin.ts` (add the routes beside `/api/keepers`; update the header comment)

**Interfaces:**

- Produces:
  - `GET /api/sketches`:
    - returns `200` with the `AttributionFile` JSON
    - returns `404 { error: 'missing' }` when the file is absent
    - returns `503 { error: 'malformed' }` when parsing fails
  - `GET /api/pilot` returns `output/.review/pilot.json` (written by Task 9), with `404` if it's absent.
    - Shape: `{ files: { name: string; candidates: { id: string; path: string; ref: string | null }[] }[] }`
    - `ref` is the Cloudinary reference URL.
  - `GET /api/pilot-truth` returns `Record<string, string | null>`, or `{}` when the file is absent.
  - `POST /api/pilot-truth` takes `{ name, sketch: string | null }`:
    - validates `name` with `safeOutputPath`
    - writes `output/.review/pilot-truth.json` sorted, as keepers are written
    - `sketch: null` means "none of these / can't tell"

- [ ] **Step 1: Implement the four routes.**
- [ ] **Step 2: Verify by hand.** Run `npm run review` (port 5180 — never 5173), then:
  - `curl -s -o /dev/null -w '%{http_code}' localhost:5180/api/sketches` gives `404` with no file.
  - With `echo '{' > output/.review/sketches.json` it gives `503`. Remove that file afterwards.
  - A POST then GET of `/api/pilot-truth` round-trips.
  - Stop the review server afterwards.
- [ ] **Step 3: Run the verify pair and `npx tsc --noEmit -p archive-app`.** Expected: the pre-existing atlas error only.
- [ ] **Step 4: Commit:** `feat(review): sketches and pilot-truth routes`.

### Task 7: By-sketch timeline and ledger model

**Files:**

- Modify: `archive-app/src/review/model.ts`
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: `Timeline`, `Day`, `Item` (existing); `AttributionFile` (Task 1).
- Produces:
  - `UNLABELLED = 'unlabelled'`
  - `type LedgerSort = 'recent' | 'count'`
  - `buildSketchTimeline(names: string[], sketchOf: (name: string) => string | null, sort: LedgerSort): Timeline`
    - Returns the same `Timeline` shape as `buildTimeline`, with each `Day` being one sketch group.
    - `key` is the sketch id, or `UNLABELLED`.
    - `label` is the id without its `sketches/` prefix, or `'unlabelled'`.
    - Items within a group are chronological; `index`/`dayOf` cover the flattened stream in group order.
    - Group order:
      - `'recent'`: the newest item's `ts`, descending
      - `'count'`: item count descending, ties by recent
      - `UNLABELLED` always last
  - `type LedgerRow = { key: string; label: string; path: string | null; deleted: boolean; count: number; first: number | null; last: number | null; image: Item }`
  - `buildLedger(timeline: Timeline, keepers: Set<string>, files: AttributionFile['files']): LedgerRow[]`
    - One row per group, in group order.
    - `image` is the newest keeper in the group, else the newest item.
    - `path` and `deleted` come from any labelled file in the group.

- [ ] **Step 1: Write the failing tests:**
  - `groups by sketch with unlabelled last`.
  - `files missing from the JSON are unlabelled`: `sketchOf` returns `null` for unknown names.
  - `recent and count orders`.
  - `ledger image prefers a keeper`: a group with a keeper older than the latest item shows the keeper; a group without keepers shows the newest item.
  - `keepers-only input drops empty sketches`: build from `names.filter(isKept)`; a sketch with no keepers has no group.
  - `navigation indices are consistent`: for every item, `timeline.days[timeline.dayOf[i]].items` includes it.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement both functions.**
- [ ] **Step 4: Run the suite, the verify pair and the archive-app tsc.** Expected: PASS (atlas error only).
- [ ] **Step 5: Commit:** `feat(review): by-sketch timeline and ledger model`.

### Task 8: Ledger view in the Light Table

**Files:**

- Modify: `archive-app/src/review/app.tsx`, `archive-app/src/review/review.css`

**Interfaces:**

- Consumes: `AttributionFile` (Task 1); `buildSketchTimeline`, `buildLedger`, `UNLABELLED`, `LedgerSort` (Task 7); `GET /api/sketches` (Task 6).

**Behaviour** (from spec Part 2, Option B):

- **New state:** `mode: 'day' | 'sketch'`, `ledgerOpen: boolean`, `sort: LedgerSort`, `attributions: AttributionFile | null | 'missing'`.
- **Fetching:** `/api/sketches` is fetched alongside index and keepers. A 404/503 gives `'missing'`.
- **Active timeline:**
  - In `'sketch'` mode, `active` = `buildSketchTimeline` over the full or kept names.
  - `day` then means the sketch group, so `[`/`]`, Home/End, the sheet and the loupe work unchanged.
- **Keys:**
  - `v`:
    - toggles the mode
    - entering `'sketch'` opens the ledger
    - with `'missing'`, it shows `<p className="empty">No sketch labels yet — run <code>npm run tag:output</code>. <code>v</code> returns to days.</p>`
  - `n` toggles the sort while the ledger is open.
- **Ledger** (`<Ledger rows sort selectedKey onOpen>` component in `app.tsx`):
  - Rows are a 56 px thumbnail (`thumbUrl`), the name over a muted `src/sketches/…` path (a `deleted` row adds ` · deleted`), a right-aligned count, and `YYYY.MM.DD → YYYY.MM.DD`.
  - The `UNLABELLED` row is dimmed (`opacity: .45` on its image).
  - ↑/↓ and j/k move the selection; Enter or a click opens that group in the sheet (cursor on its first item, `sheetOpen = true`, `ledgerOpen = false`).
- **Escape:** in `'sketch'` mode, from the sheet or the loupe, it returns to the ledger with the current group selected.
- **Header:**
  - In sketch mode the left slot shows `{group label} · i/n`, and the right slot shows `sketch k/K` in place of `day k/K`.
  - With the ledger open, the centre shows `{K} sketches · sort: most recent|count` and the right shows `{n} unlabelled`.
- **Help:** `SHORTCUTS` gains `[['v'], 'group by day / by sketch']` and `[['n'], 'sort ledger: recent / count']`.
- **CSS:** per the mockup and DESIGN.md:
  - grid `56px 1fr auto auto`, 16 px gap
  - hairline `border-bottom: 1px solid var(--hairline)`
  - tabular numerals
  - the selected row uses `background: var(--img-bg)`
  - no new colours, and type sizes from the existing `review.css` steps only

- [ ] **Step 1: Implement the behaviour above.**
- [ ] **Step 2: Verify by hand** with `npm run review` on :5180 and a hand-written `output/.review/sketches.json` labelling about 20 recent files to 3 sketches (remove it after):
  - `v` shows 3 rows plus Unlabelled.
  - Enter opens the sheet with only that sketch's files.
  - `]` goes to the next sketch, and `esc` returns to the ledger.
  - `n` reorders the rows.
  - `S` limits the ledger to keepers.
  - With the file deleted, `v` shows the note.
  - The browser console is free of errors.
- [ ] **Step 3: Run the verify pair and the archive-app tsc.**
- [ ] **Step 4: Format `app.tsx` and `review.css`, then commit:** `feat(review): by-sketch ledger in the Light Table`.

### Task 9: Pilot — sampling, scoring and the labelling page

**Files:**

- Create: `scripts/output-sketches/pilot.ts`
- Modify: `scripts/tag-output.ts` (`--pilot N`, `--pilot-report`), `archive-app/src/review/app.tsx` (render `<PilotSheet>` when `location.pathname === '/pilot'`), `archive-app/src/review/review.css`
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: Tasks 1–6.
- Produces:
  - `type PilotGroup = 'prefix' | 'hash' | 'random' | 'hand'`
  - `type PilotItem = { name: string; group: PilotGroup; truth: string[] | null /* acceptable sketch ids: a prefix family, one hash sketch, or null */ }`
  - `samplePilot(names: string[], history: History, n: number, seed: number): PilotItem[]`. The sample contains:
    - every prefixed file whose family is known, except that October 2025 `arcs-reduction` is capped at 30 (stride-sampled)
    - every hash file whose commit touches exactly one entry file
    - 30 files from 2023–24 marked `hand`, stride-sampled across those years
    - random files from all years until `n` is reached
    - Deterministic for a given `seed`.
  - `scorePilot(items: PilotItem[], results: Record<string, FileAttribution>, truth: Record<string, string | null>, thresholds: number[]): Report`
    - Scored per group and at each threshold in `[0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]`.
    - Reports: `labelled` (accepted count), `correct` (accepted and in truth), `precision` = correct / labelled, and `coverage` = labelled / scored.
    - `hand` items use `pilot-truth.json`; a `null` truth counts as correct only when the file stays unlabelled.
  - `--pilot N`:
    - samples, then runs `tagFiles` with `withhold: true` on the pilot names
    - writes `output/.review/pilot-results.json` (an `AttributionFile`) and `output/.review/pilot.json` (the `hand` items with their shortlists and Cloudinary reference URLs)
    - prints the report for the `prefix` and `hash` groups, mean input tokens per file, and the projected cost of the full run
    - then prints: `Label the 2023–24 files at http://localhost:5180/pilot (npm run review), then run npm run tag:output -- --pilot-report`
  - `--pilot-report` re-prints the full report, including `hand`, from the stored files. It makes no API calls.
  - `<PilotSheet>` at `/pilot`:
    - one block per `hand` file: the image (`fileUrl`) at 320 px, then its candidates as 160 px reference pictures with paths, plus a "none of these / can't tell" button
    - clicking POSTs to `/api/pilot-truth` and marks the choice
    - a progress line `12/30 labelled`
    - Flat File styling

- [ ] **Step 1: Write the failing tests:**
  - `samplePilot is deterministic and capped`: the same seed gives the same names; there are ≤ 30 October 2025 `arcs-reduction` files; there are exactly 30 `hand` items from 2023–24.
  - `scorePilot counts family picks as correct`: a pick of any id in the `truth` family counts as correct.
  - `scorePilot precision and coverage by threshold`: a fixture with confidences 0.95, 0.75 and 0.45 (two correct) gives, at 0.7, `labelled 2`, `correct 2` and `coverage 2/3`.
  - `hand none truth rewards abstaining`.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement `pilot.ts`, the CLI flags and `<PilotSheet>`.**
- [ ] **Step 4: Run the suite, the verify pair and the archive-app tsc.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(review): pilot sampling, scoring and labelling page`.

### Task 10: Run the pilot and hand over

- [ ] **Step 1:** Run `npm run tag:output -- --pilot 300`. Expected: a report table for the prefix and hash groups, tokens per file and a cost projection. If any request is over the context limit, lower `BATCH_SIZE` in `jev.ts`, re-run the suite, commit, and rerun.
- [ ] **Step 2:** Run `npm run review` and check that `http://localhost:5180/pilot` lists 30 files with shortlists.
- [ ] **Step 3: Stop.** Hand Varun:
  - the report
  - the `/pilot` link to label
  - a recommended threshold per period from the precision table, chosen as the lowest threshold with precision ≥ 0.95 in both known groups
  - the projected cost of the full run

  The full run (`npm run tag:output -- --threshold … [--threshold-year 2023=… --threshold-year 2024=…]`) happens only after he labels the files, `--pilot-report` has been reviewed, and he signs off on the thresholds.

---

## Addendum (2026-10-18): label by series

Implements the spec's "Addendum: label by series, not by file". Global
Constraints above still apply. Raw Jev answers in stored JSON are unchanged,
so no task calls the API.

### Task 11: Series in the attribution model, accept rule and pilot scoring

**Files:**

- Modify: `archive-app/src/review/attribution.ts`, `scripts/output-sketches/run.ts`, `scripts/output-sketches/pilot.ts`, `scripts/tag-output.ts` (only if a call site changes)
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Produces (all in `attribution.ts`):
  - `seriesOf(id: string): string`
    - `sketches/a/b/c` → `sketches/a`
    - `sketches/a` → `sketches/a`
  - `FileAttribution` gains `series: string | null`.
  - `seriesProbabilities(answer: JevAnswer): Record<string, number>`
    - Sums `answer.probabilities` by `seriesOf(id)`.
    - The key `'none'` stays `'none'`.
- `applyAccept`, re-defined for answered `jev`/`unlabelled` entries:
  - Take the top bucket of `seriesProbabilities(answer)`. Break ties by key.
  - Accept when the top bucket isn't `'none'` and its sum ≥ `thresholdFor(t, ts)`.
  - When accepted:
    - `method` is `'jev'`, `series` is the bucket, and `confidence` is the bucket sum.
    - `sketch` is the highest-probability id inside that series.
    - `path`, `pathAtExport` and `deleted` come from `paths[sketch]`.
  - Otherwise the file is unlabelled:
    - `series`, `sketch`, `path` and `pathAtExport` are `null`.
    - `reason` is `'none'` when the top bucket is `'none'`, else `'low-confidence'`.
    - `confidence` is the top bucket's sum.
  - `prefix` and settled entries are untouched, except that a `prefix` entry missing `series` gets `seriesOf(sketch)`.
- `run.ts`: the `prefix` path sets `series: seriesOf(sketch)`. Pending and error entries set `series: null`.
- `pilot.ts` `scorePilot`: accepted at t and correct are judged on series:
  - accepted ⇔ the top series bucket isn't `'none'` and its sum ≥ t
  - correct ⇔ the bucket ∈ `truth.map(seriesOf)`
  - The hand-label rules are otherwise unchanged.
  - `noneShare` is still `choice === null` over scored.

- [ ] **Step 1: Write the failing tests:**
  - `seriesOf maps nested and one-off ids`:
    - `sketches/nalee/sketches/bipolar` → `sketches/nalee`
    - `sketches/gravura/basic` → `sketches/gravura`
    - `sketches/42-loc` → `sketches/42-loc`
  - `seriesProbabilities sums siblings`: `{ 'sketches/g/a': 0.4, 'sketches/g/b': 0.35, 'sketches/x': 0.15, none: 0.1 }` → `{ 'sketches/g': 0.75, 'sketches/x': 0.15, none: 0.1 }`.
  - `applyAccept labels the series and hints the top file`:
    - With that answer, choice `sketches/g/a`, confidence 0.4 and threshold 0.7: `method 'jev'`, `series 'sketches/g'`, `sketch 'sketches/g/a'`, `confidence 0.75`.
    - At threshold 0.8 the file is unlabelled, with `reason 'low-confidence'`.
  - `applyAccept none bucket wins → unlabelled none`.
  - `prefix entry gains series`.
  - `scorePilot scores at series level`: a pick of sibling `sketches/g/b` against truth `sketches/g/a` counts as correct.
  - Update any existing test whose expectations assumed file-level acceptance; say which in the report.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite and the verify pair.** Then run `npm run tag:output -- --pilot-report`, which makes no API call and reads the real stored pilot. Paste its output into the report: precision at 0.5 should match the spec addendum's table (97.7% prefixed, 100% hash).
- [ ] **Step 5: Commit:** `feat(review): label output files by series`.

### Task 12: The Ledger groups by series

**Files:**

- Modify: `archive-app/src/review/model.ts`, `archive-app/src/review/app.tsx`
- Test: `scripts/output-sketches-smoke.ts`

**Interfaces:**

- Consumes: `seriesOf` and `FileAttribution.series` (Task 11).
- `app.tsx`:
  - `sketchOf` becomes `name => files[name]?.series ?? (files[name]?.sketch ? seriesOf(files[name].sketch) : null)`. Old files without `series` still group.
  - `isUsableEntry` also accepts `series` as a string, null, or absent.
- `buildLedger`, for a labelled row:
  - `path` is `src/sketches/<series without sketches/>/` when any file in the group has a `sketch` deeper than the series.
  - Otherwise it is the file path (a one-off).
  - `deleted` is true only when every labelled file in the group is deleted.
- The UI copy says "series" where it counted sketches: the centre header reads `{K} series`, and the right slot in sheet mode reads `series k/K`. The help row for `v` reads `group by day / by series`.

- [ ] **Step 1: Write the failing tests:**
  - `ledger path is the folder for a series`.
  - `ledger path is the file for a one-off`.
  - `old entries without series still group via seriesOf(sketch)`. This tests the exported helper the app uses; export it from `model.ts` as `seriesKeyOf(entry)`.
- [ ] **Step 2: Run the suite.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify in the browser** on the throwaway :5190 server, with the same rules as Task 8. Use a temporary `sketches.json` labelling about 20 recent files across 2 series, plus one one-off. Then delete it, clean up `output/.review/`, and kill only your own PID. Take screenshots of the ledger and of a filtered sheet. Run the verify pair and the archive-app tsc.
- [ ] **Step 5: Commit:** `feat(review): ledger groups by series`.
