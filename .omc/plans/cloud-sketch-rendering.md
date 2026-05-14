# Plan: Run & Render ssam Sketches in claude.ai/code Sandbox

## Requirements Summary

Enable an iteration loop for ssam sketches inside the claude.ai/code web sandbox (ephemeral Linux container, Node + shell, no display server):

1. Spin up a sketch on demand against a specified `VITE_SKETCH` path.
2. Trigger an `/export` and have a PNG land in `./output/`.
3. Let Claude `Read` the PNG to view the result, then edit the sketch and re-render.
4. Keep the local workflow (real macOS browser via `npm run dev`) unchanged — the cloud path is additive.

Scope: still PNG only. 2D ssam sketches in scope as the primary target; WebGL added as a test fixture (see Step 6) since the repo has no WebGL sketches today. No video, no tweakpane UI control surface.

## RALPLAN-DR Summary

### Principles
1. **Fidelity over cleverness** — render with a real browser engine, not a Node canvas shim. ssam's API contract is a DOM canvas, and pixel parity with the local Mac render matters for an artist's iteration loop.
2. **Local workflow is sacred** — adding cloud support must be behavior-identical to the existing Mac dev/render flow. `package.json` may grow new scripts/deps, but no local command changes.
3. **First-render latency dominates UX** — the user feels every second between "edit sketch" and "see PNG"; setup cost belongs in invisible bootstrap, not the interactive path.
4. **Less persistent state is better** — every long-lived process in an ephemeral sandbox is a future surprise. Prefer ephemeral per-render processes when the speed cost is acceptable.
5. **Skill remains the surface** — `render-sketch` is the user-facing entry point; cloud is an implementation choice it makes, not a new vocabulary the user learns.

### Decision Drivers (top 3)
1. **Time-to-first-PNG on a fresh sandbox** — directly governs whether the loop feels usable.
2. **Sandbox state model uncertainty** — claude.ai/code may or may not preserve detached processes between tool calls; design must not assume it does.
3. **2D parity now, WebGL parity when sketches exist** — both modes must work, but the test surface today is 2D-only.

### Viable Options Considered

**Option A — Per-render ephemeral Chromium + provisioned `chrome-headless-shell`** ✅ chosen
- Pros: smallest persistent-state surface; ~60MB browser vs ~170MB; install cost moves to the setup hook; one PID file (Vite only).
- Cons: ~3-5s Chromium cold-start per render. Honest tension with Principle #3 (latency) — acknowledged below.

**Option B — Long-lived headless Chromium daemon (original draft)**
- Pros: subsequent renders ~1-2s instead of 3-5s; warm page state.
- Cons: a *second* long-lived process whose survival semantics we don't yet know. Sketch-switch reconnection logic; ws-endpoint staleness; zombie chromium failure modes.
- Why not chosen: B's marginal speed win is real (steelman: at 50 renders/session, ~100-150s saved), but until we actually measure claude.ai/code's process-survival contract, we'd be building reconnection logic on a guess. **Kept as a follow-up escape hatch in the ADR** — gated behind a `CLOUD_RENDER_WARM=1` env var if/when latency becomes painful.

**Option C — GitHub Action renders artifact**
- Pros: zero sandbox install burden; reproducible.
- Cons: ≥60s per iteration; requires push per preview. Violates Principle #3.
- Why not chosen: too slow for the iterate loop; viable disaster-recovery path only.

**Option D — Node-canvas / skia-canvas shim**
- Pros: no browser at all.
- Cons: violates Principle #1 (no pixel parity); doesn't cover future WebGL sketches; requires upstream ssam abstraction.
- Why not chosen: scope and fidelity cost not justified.

### Acknowledged Tension
Principles #3 (latency) and #4 (less persistent state) pull in opposite directions. Plan resolves it asymmetrically: Vite stays warm (saves ~5-8s/render), Chromium dies after each render (costs ~3-5s/render). Rationale: Vite is a Node-process that owns the HMR-coupled `/export` middleware — restarting it has higher hidden cost (HMR reconnect, plugin chain re-init) than restarting Chromium does. The asymmetry is explicit, not accidental.

## Constraints & Facts

- `vite.config.ts:23-41` — `/export` middleware is **stateful**: broadcasts `mcp:export` HMR event, waits ≤10s for an `ssam:export` reply. Without an HMR-connected browser running the sketch with the handler wired, it 504s.
- ssam (`ssam@0.18.1`) renders into a real DOM `HTMLCanvasElement`. No node-canvas shortcut.
- Dev server selects its sketch via `VITE_SKETCH` env var → dynamic import in `src/index.ts`. Switching sketches = restart Vite.
- The render-sketch skill (`.claude/skills/render-sketch/SKILL.md`) drives the existing flow assuming a browser tab is alive — the cloud path's only job is to provide that tab on demand.
- Repo state today: **all sketches are 2D**. `find src/sketches -name "*.ts" | xargs grep -l "mode: 'webgl"` returns nothing. WebGL parity is a future-proofing claim, not a today-claim. Step 6 authors a minimal WebGL test sketch as the asset that lets us verify the parity claim.

## Acceptance Criteria

1. **Cold first render (provisioning hook ran)**: in a freshly provisioned sandbox where `.claude/sandbox-setup.sh` (or the equivalent resolved in Step 0) has run, `npm run cloud:render -- sketches/<path>` returns a PNG path in ≤15s. Measurement recorded in Verification (no hand-waving).
2. **Warm subsequent render**: `cloud:render` against the same sketch with Vite already alive returns a PNG in ≤7s. (≤5s would be ideal; ≤7s is the budget that survives a sampled WebGL render + `__ssam_ready` wait + the 10s `/export` middleware timeout headroom.)
3. **Sketch switch**: `cloud:render -- sketches/<other>` succeeds in ≤15s; PNG matches the new sketch's identity (smoke test in Step 6 asserts this).
4. **Skill integration**: the render-sketch skill works in the cloud session by calling `cloud:render` — no other user-facing command needed.
5. **WebGL parity (using the test sketch authored in Step 6)**: the test WebGL sketch renders successfully via swiftshader; PNG is non-blank (pixel variance > 0 across a sampled row).
6. **Local workflow is behavior-identical**: on the Mac, `npm install && npm run dev` and render-sketch behave identically to today. New devDependencies (`playwright-core`, `tsx`) may appear but must not trigger a browser download by default.
7. **No leaked processes**: after a render completes, `pgrep -f chromium` returns nothing; at most one Vite PID remains.
8. **Provisioning-failure graceful path**: if the provisioning hook didn't run, `cloud:render` lazy-installs `chrome-headless-shell` on first call. Adds ~30-45s to that one render; surface progress on stdout; on install failure write `.cloud-render/install.log` and exit non-zero with an actionable error.

## Implementation Steps

### Step 0 — Resolve the provisioning-hook contract

Before any other step. The plan currently assumes `.claude/sandbox-setup.sh` is the right path; this is unverified.

- Look up claude.ai/code's actual project-level setup-hook convention (Anthropic docs, support pages, or by inspecting any provided sandbox-config schema).
- Outcomes:
  - **Hook supported**: record exact filename + invocation contract. Proceed to Step 2 with the verified path.
  - **No hook supported**: drop Step 2; rely entirely on the lazy-install fallback in Step 3 item 2; relax AC #1 to "≤45s on first render of a session, ≤15s on subsequent sessions where the browser cache is preserved."

Acceptance: a short note recorded at the top of `docs/cloud-rendering.md` stating which provisioning model the project uses and which AC applies.

### Step 1 — Add cloud-only dependencies and scripts

File: `package.json`

- Add to `devDependencies`:
  - `playwright-core` (driver only, ~5MB, no bundled browser).
  - `tsx` if not present.
- Add scripts:
  - `cloud:install`: `npx playwright install chromium-headless-shell` (~60MB; skip full Chromium).
  - `cloud:render`: `tsx scripts/cloud-render.ts`
  - `cloud:stop`: `tsx scripts/cloud-render.ts stop`
  - `cloud:smoke`: `tsx scripts/cloud-render-smoke.ts`

A default `npm install` on macOS pulls `playwright-core` only; the browser binary is gated behind `cloud:install`.

Acceptance: `npm run cloud:install` in the sandbox succeeds and prints `chromium-headless-shell … installed`. On the Mac, `npm install` does **not** download a browser.

### Step 2 — Provisioning hook (only if Step 0 confirmed it's supported)

File: as resolved in Step 0 (placeholder: `.claude/sandbox-setup.sh`).

```sh
#!/usr/bin/env bash
set -euo pipefail
export PLAYWRIGHT_BROWSERS_PATH="${PWD}/.cloud-render/browsers"
mkdir -p .cloud-render
npm install --no-audit --no-fund 2>&1 | tee .cloud-render/install.log
npm run cloud:install 2>&1 | tee -a .cloud-render/install.log
```

Adds `.cloud-render/` to `.gitignore`.

Acceptance: in a freshly provisioned sandbox, the resolved executable returned by `require('playwright-core').chromium.executablePath()` exists on disk before the user's first command.

### Step 3 — Build the per-render script

New file: `scripts/cloud-render.ts`

Behavior (one Node process per invocation; exits after the PNG is written or an error is reported). **Pseudocode is normative — implement this exactly.**

```text
cloud-render <sketchPath>:
  0. mkdir -p output  ;  mkdir -p .cloud-render
  1. Acquire exclusive lock on .cloud-render/render.lock (proper-lockfile or equivalent).
     Register SIGINT/SIGTERM handlers that release the lock and kill any child Chromium.
  2. Ensure Vite is running on 5173 with the requested VITE_SKETCH:
     a. Read .cloud-render/vite.pid if present.  Format: `{ pid, sketch, port }`.
     b. Validate liveness: kill -0 $pid  AND  /proc/$pid/cmdline contains "vite".
        If validation fails, treat as no Vite running and proceed.
     c. If validated AND recorded sketch === requested sketch → reuse.
     d. Otherwise (mismatch or dead):
        - If a stale Vite PID exists: kill -TERM, poll port 5173 (lsof or net check)
          until free OR 5s elapsed, then kill -KILL.
        - Spawn `npm run dev` detached with VITE_SKETCH=<sketchPath>,
          redirect stdout/stderr to .cloud-render/vite.log,
          write { pid, sketch, port: 5173 } to .cloud-render/vite.pid.
        - Poll http://localhost:5173/ until 200 (max 30s).
  3. Resolve PLAYWRIGHT_BROWSERS_PATH (default ./.cloud-render/browsers).
     Resolve chromium-headless-shell path via playwright-core API.
     If executable missing:
        - Print "installing browser (one-time)…" to stdout.
        - Run `npm run cloud:install`, tee output to .cloud-render/install.log.
        - On non-zero exit: print actionable error referencing the log path, release lock, exit 2.
  4. Launch chromium-headless-shell with:
       --use-gl=swiftshader --enable-unsafe-swiftshader
       --ignore-gpu-blocklist --no-sandbox --disable-dev-shm-usage
  5. Open page → http://localhost:5173/.  Wait for `() => window.__ssam_ready === true` (timeout 15s).
  6. From Node (NOT from inside the page): `fetch('http://localhost:5173/export')` with a 12s timeout.
     The page being open + handler wired is what makes the server's broadcast resolve;
     issuing the HTTP request from Node decouples request from the HMR response path
     and avoids any chance of in-page event-loop interference.
  7. Close Chromium.  Release lock.
  8. Print `{filename}` from the /export JSON response to stdout. Exit 0.

cloud-render stop:
  1. Read .cloud-render/vite.pid; if present, SIGTERM, port-free poll, SIGKILL.
  2. Remove .cloud-render/vite.pid.  Exit 0.
```

**Critical invariants**:
- The only long-lived state is the Vite process and its PID file. Chromium is created and killed every invocation.
- PID files are checked by `kill -0` AND `cmdline` match — never trusted on `kill -0` alone (PID reuse).
- The fetch to `/export` runs from Node, not the page — eliminates the HMR-roundtrip deadlock risk Architect flagged.

Acceptance:
- After a successful render: `cat .cloud-render/vite.pid` shows the running PID and sketch path; `pgrep -f chromium` returns nothing.
- Re-render with same sketch: same PID, ≤7s wall-clock (verified by Step 6 smoke timer).
- Re-render with different sketch: new PID, old port-free poll observed in `.cloud-render/vite.log`.
- Killing the script mid-render (Ctrl-C) leaves no orphaned Chromium and no held lock.

### Step 4 — Sketch readiness signal

File: `src/index.ts`

After ssam's first frame has rendered, set `(window as any).__ssam_ready = true`. The current file does `await import(...)`; the import resolving does **not** mean the canvas has painted. Hook into the first wrap render:

- If ssam exposes a `wrap.on('first-render', ...)`-style callback, use it.
- If not, wrap the dynamic-import path so the imported sketch's `wrap.render` is monkey-patched to set the flag inside the first invocation (then restore original).
- Gate the assignment behind `import.meta.env.DEV` so the production build is unaffected.

Acceptance: in both an existing 2D sketch (e.g. `no-250.ts`) and the WebGL test sketch authored in Step 6, `await page.waitForFunction(() => window.__ssam_ready)` resolves within 5s of `page.goto`. Re-loading the same page via HMR does not leave `__ssam_ready` stuck at `true` from a previous mount.

### Step 5 — Skill update: cloud branch

File: `.claude/skills/render-sketch/SKILL.md`

Update "Step 2: Check the dev server is up" with explicit cloud branching:

```
1. curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
2. If 200 AND .cloud-render/vite.pid is missing → local Mac browser flow (today's behavior, unchanged).
3. If 200 AND .cloud-render/vite.pid exists:
   - Read the file, compare its `sketch` field against the target sketch path.
   - Match → just curl /export (the in-sandbox Chromium is gone, but Vite is up; the
     skill must trigger cloud:render anyway because /export needs a live browser tab).
     **Correction: in cloud, never curl /export directly — always go through cloud:render.**
   - Mismatch → npm run cloud:render -- <sketchPath>.
4. If not 200 → npm run cloud:render -- <sketchPath>.
```

Detection rule: the **presence of `.cloud-render/vite.pid`** is the canonical "we are in the cloud workflow" signal. No env vars, no host sniffing.

Acceptance: same `/render` user request produces a PNG locally (via the user's Mac browser) and in the cloud (via `cloud:render`) with no user-facing command difference.

### Step 6 — Smoke test, including the WebGL test sketch

New files:
- `src/sketches/_test/cloud-render-2d.ts` — a deterministic 2D sketch (e.g. a sweep of colored bars) with known pixel signature.
- `src/sketches/_test/cloud-render-webgl.ts` — a minimal `mode: 'webgl'` sketch (e.g. a fullscreen quad with a non-uniform gradient shader) — exists specifically so AC #5's WebGL parity claim is testable. Until this file exists, the repo has zero WebGL sketches.
- `scripts/cloud-render-smoke.ts` — runner.

Smoke runner behavior:
- For each test sketch: invoke the same code paths as `cloud-render`, then assert:
  - PNG exists at the reported path.
  - File size > 1KB.
  - Pixel variance > 0 across a sampled row near the middle (catches blank-canvas failures).
- **Record wall-clock timings** for each render and print a table at the end. This is what proves AC #1, #2, #3 — no other step measures.
- Exit 0 only if all assertions pass AND the recorded wall-clocks are within the AC budgets (allow 20% slack for sandbox jitter).

Wire up `npm run cloud:smoke`.

Acceptance: `npm run cloud:smoke` exits 0; the printed table shows times satisfying the ACs.

### Step 7 — Sandbox bootstrap doc

New file: `docs/cloud-rendering.md` (~60 lines):

- One-paragraph overview.
- The provisioning model resolved in Step 0 (which hook fired, or "no hook — lazy-install path").
- Manual session bootstrap (in case provisioning didn't run): `npm install && npm run cloud:install`.
- Debugging: `tail .cloud-render/vite.log`, `cat .cloud-render/install.log`, where Chromium errors print.
- Local users: "Ignore this file — it's only relevant in claude.ai/code."

Acceptance: a contributor following the doc produces a PNG in ≤5 minutes from a fresh sandbox.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `chrome-headless-shell` WebGL fidelity differs from full Chromium | Smoke test in Step 6 asserts non-blank WebGL render via the dedicated test sketch. On failure, swap `cloud:install` to `playwright install chromium`. |
| claude.ai/code's provisioning-hook contract differs from `.claude/sandbox-setup.sh` | Step 0 resolves the contract before any other work. Lazy-install fallback in Step 3 ensures the workflow functions even with no hook. |
| `cloud:install` itself fails (network egress blocked, disk full, npm/registry timeout) | Step 3 item 3 captures exit code, writes `.cloud-render/install.log`, surfaces an actionable error to stdout, exits non-zero. No silent proceed-to-launch. |
| Cold Vite startup > 10s on a slow sandbox | Acceptable on first render only. If sustained, add a `cloud:warm` script. |
| Stale `vite.pid` survives a sandbox restart with reused PID | Step 3 item 2b validates against `/proc/$pid/cmdline` containing `"vite"`, not just `kill -0`. |
| Vite respawn races against the previous Vite holding port 5173 | Step 3 item 2d: SIGTERM → port-free poll (≤5s) → SIGKILL. |
| Lock file held by a crashed script blocks all future renders | proper-lockfile auto-stales after a configurable TTL; SIGINT/SIGTERM handlers release explicitly. |
| `__ssam_ready` stuck at true after HMR re-mount | Step 4 sets the flag inside the first-frame callback, not at import time. Set-once semantics with HMR-reset hook. |
| Two `cloud:render` invocations race | `.cloud-render/render.lock` (proper-lockfile) — Step 3 item 1. |
| `--no-sandbox` security note | We only ever navigate to localhost inside an ephemeral sandbox. Documented in `docs/cloud-rendering.md`. |
| `playwright-core` (~5MB) added to local devDependencies | Acceptable. Documented. Browser binaries gated. |
| `mcp:export` handler missing from a freshly-edited sketch | render-sketch skill already injects it; no change. Smoke test covers it. |
| `output/` directory missing on a fresh clone | Step 3 item 0 does `mkdir -p output`. |
| `PLAYWRIGHT_BROWSERS_PATH` doesn't survive across sessions | Tested in Verification step 8. If it doesn't, first render of every new session pays the ~45s install — acceptable, surfaced as a tradeoff in `docs/cloud-rendering.md`. |

## Verification Steps

1. **Local regression**: on the Mac, `npm install` does not download a browser; `npm run dev` and render-sketch behave identically to today.
2. **Cold sandbox cycle**: in a fresh claude.ai/code session, verify Step 0's resolved hook path; verify `.cloud-render/browsers/chromium-headless-shell-*/` exists after provisioning. Run `cloud:render -- sketches/siep-van-den-berg/no-250`; PNG path stdout in ≤15s; `Read` the PNG → non-blank image.
3. **Warm iteration**: edit `no-250.ts`, re-run `cloud:render` → new PNG, ≤7s, visibly different.
4. **Sketch switch**: `cloud:render -- src/sketches/_test/cloud-render-2d`; new PNG in ≤15s. Confirm old Vite PID rotated; `.cloud-render/vite.log` shows the port-free poll line.
5. **WebGL parity**: `cloud:render -- src/sketches/_test/cloud-render-webgl`; non-blank PNG with variance > 0.
6. **Skill integration**: trigger render-sketch end-to-end in a cloud session — same UX as local; presence of `.cloud-render/vite.pid` is the only signal that drove the cloud branch.
7. **No leaked processes**: `pgrep -f chromium` returns nothing; `pgrep -f vite` returns exactly one PID.
8. **Browser-cache survival**: simulate a new session (or wait for a real one). Verify whether `.cloud-render/browsers/` is preserved. Record outcome in `docs/cloud-rendering.md`.
9. **Failure paths**: temporarily break network access; run `cloud:render` from clean state → expect non-zero exit, `.cloud-render/install.log` contains the failure, stdout has actionable error.
10. **Smoke test**: `npm run cloud:smoke` exits 0 with the wall-clock table satisfying the AC budgets.

## ADR

- **Decision**: Per-render ephemeral `chrome-headless-shell` driven by `scripts/cloud-render.ts`, with browser install moved to a sandbox provisioning hook (or lazy-installed on first render if no hook). Vite is the only long-lived process. `.cloud-render/vite.pid` is the cloud-mode signal.

- **Drivers**: time-to-first-PNG, sandbox process-survival uncertainty, today's all-2D test surface (WebGL test sketch authored in Step 6).

- **Alternatives considered**: Option B (long-lived Chromium daemon), Option C (GitHub Action), Option D (node-canvas shim). See RALPLAN-DR Summary.

- **Why chosen**: smallest persistent-state surface that meets the goal. Avoids committing to a Chromium-survival contract we haven't yet measured. The 2-3s/render savings of Option B are real but premature — we can revisit once the per-render flow has run in anger.

- **Consequences**:
  - Every render pays ~3-5s of Chromium cold-start.
  - Vite remains the only long-lived process; `vite.pid` is the canonical cloud-mode marker.
  - `playwright-core` + `tsx` join devDependencies.
  - `src/index.ts` gains a dev-only `__ssam_ready` flag set on first-frame.
  - The render-sketch skill grows a cloud branch but no new user-facing command.

- **Follow-ups**:
  - After measuring real-world session iteration counts: if average renders/session × 2.5s/render > 60s, gate Option B behind `CLOUD_RENDER_WARM=1`. Keep Option A as default.
  - Author additional WebGL sketches once the framework is in use; revisit AC #5 once a non-synthetic WebGL sketch exists.
  - If claude.ai/code provides a richer provisioning model (image baked, persistent volumes), move the Chromium binary out of the project tree.

## Changelog (consensus review)

**Architect findings applied:**
- Step 3 item 6: `/export` fetch issued from Node, not from page context.
- Step 3 item 1: `.cloud-render/render.lock` promoted from Risks table to pseudocode with explicit SIGINT/SIGTERM cleanup.
- Step 4: `__ssam_ready` is set inside the first-frame callback (not after dynamic import); gated behind `import.meta.env.DEV`.
- Step 5: sketch-match detection defined — read `.cloud-render/vite.pid` (which now stores `{pid, sketch, port}`); presence of the file is the cloud-mode signal.
- Step 3 item 2b: PID validation strengthened — `kill -0` AND `/proc/$pid/cmdline` contains `vite`.
- Step 3 item 2d / Step 2 hook: explicit Vite stdout/stderr redirection to `.cloud-render/vite.log`.

**Critic findings applied:**
- Step 0 added — resolve claude.ai/code's provisioning-hook contract before any other work; ACs degrade gracefully if no hook is supported.
- Step 6 authors `src/sketches/_test/cloud-render-webgl.ts` — the test asset that makes AC #5 satisfiable (repo has zero WebGL sketches today).
- Step 3 item 2d: SIGTERM → port-free poll (≤5s) → SIGKILL escalation specified.
- Step 3 item 3: `cloud:install` failure path made explicit — capture exit code, write `.cloud-render/install.log`, surface actionable error.
- AC #2 relaxed to ≤7s; AC #6 reworded to "behavior-identical" (devDeps may change); new AC #8 covers provisioning-failure graceful path.
- Step 6 records wall-clock timings — proves AC #1/#2/#3 rather than asserting them.
- Step 3 item 0: `mkdir -p output` to handle a fresh clone.
- Verification step 8: explicit check for `PLAYWRIGHT_BROWSERS_PATH` survival across sessions.
- ADR Follow-ups: warm-Chromium escape hatch (Option B) explicitly noted as the path forward if latency proves painful.
