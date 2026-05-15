---
name: render-sketch
description: >
  Triggers an image render of a running ssam sketch and views the result.
  Use this skill whenever you need to see what a sketch currently looks like —
  proactively after implementing or editing a sketch, or on-demand when the user says
  "see it", "let me see", "show me the render", "what does it look like", "render it",
  "check the output", "export a frame", or similar. Injects the `mcp:export` hook into the sketch if missing,
  hits the dev server's `/export` endpoint, then reads the newest PNG in `./output`.
  Always use this skill — don't invent your own export flow.
---

# render-sketch

Trigger an image export of a running ssam sketch and view the result.

## How it works

`vite.config.ts` already has a `/export` middleware that broadcasts an `mcp:export` HMR event. Sketches that listen for that event call `props.exportFrame()`, which round-trips through the `ssam-export` plugin and writes `./output/<filename>-<timestamp>.png`.

The skill's job: ensure the listener exists, hit the endpoint, read the newest PNG.

## Step 1: Ensure the sketch has the handler

Read the target sketch file. Grep it for `mcp:export`. If missing:

- The sketch function must expose `props`. If its signature is `({ wrap, context }: SketchProps)`, change it to `({ wrap, context, ...props }: SketchProps)`.
- Inject this block immediately after the `import.meta.hot.dispose/accept` block:

```ts
import.meta.hot?.on('mcp:export', () => {
  props.exportFrame();
});
```

Save the file. Vite will HMR-reload so the new handler is live.

## Step 2: Detect environment — local Mac vs claude.ai/code sandbox

Presence of `.cloud-render/vite.pid` is the canonical cloud-mode signal. No env-var or host sniffing.

```bash
test -f .cloud-render/vite.pid && echo cloud || echo local
```

### Local (no `.cloud-render/vite.pid`)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

If it doesn't return `200`, tell the user to start the dev server in their terminal:

```bash
VITE_SKETCH="sketches/<path>" npm run dev
```

Don't start it yourself — the dev server belongs in the user's terminal, not a background shell.

Then go to Step 3 (curl `/export`).

### Cloud (`.cloud-render/vite.pid` present)

The sandbox has no GUI browser. `npm run cloud:render -- <sketchPath>` spawns a background Vite (if not running for that sketch), launches headless `chromium-headless-shell`, fires `/export` from Node, and prints the resulting filename as JSON.

```bash
npm run cloud:render -- "<sketchPath>"
```

`<sketchPath>` is the path relative to `src/` without the `.ts` extension — e.g. `sketches/siep-van-den-berg/no-250`.

Parse the last stdout line as JSON to recover `{ "filename": "..." }`, then go to Step 4 to view it.

If the script reports a missing browser, it lazy-installs `chromium-headless-shell` on first call (≈30-45s one-time). On install failure it writes `.cloud-render/install.log` and exits non-zero with an actionable error — surface that log path to the user.

## Step 3: Trigger the render (local path only)

```bash
curl -s --max-time 10 http://localhost:5173/export
```

Returns JSON `{ image, filename, format }` once the file is written. If it hangs past ~10s, see Troubleshooting.

In the cloud path, `cloud:render` already did the equivalent — skip this step.

## Step 4: View the newest PNG

```bash
ls -t output/*.png | head -1
```

Then `Read` the returned path — Claude Code displays PNGs inline.

## Video

Skip video for iteration — image exports are fast and sufficient for judging composition and color. For an animated sketch, trigger image exports at different moments (the sketch keeps playing between triggers) to sample different playheads.

If the user already recorded an MP4 and wants a frame viewed, extract one:

```bash
ffmpeg -i output/<file.mp4> -ss 00:00:01 -vframes 1 -y /tmp/frame.png
```

Then `Read` `/tmp/frame.png`.

## Troubleshooting

- **`/export` returns 504 with `export timed out — is mcp:export wired up in the sketch?`** — the handler wasn't injected, or the browser hasn't HMR-reloaded yet. Re-check step 1, then reload the browser tab if needed.
- **No file appears even after a 200** — check the vite terminal for a `[ssam-export]` line. If absent, the handler is injected but the format isn't one of `png/jpg/jpeg/webp`.
- **Wrong sketch exported** — `VITE_SKETCH` binds at server start. If the user's dev server is running a different sketch, the export is from that one. In cloud mode, `cloud:render` rotates Vite automatically when the requested sketch path differs from the one recorded in `.cloud-render/vite.pid`.
- **Cloud: `cloud:render` exits non-zero referencing `.cloud-render/install.log`** — the chromium-headless-shell install failed. Read the log path it printed; usually a transient network/registry issue. Retry once; if it persists, surface the log content to the user.
- **Cloud: `cloud:render` times out waiting for `window.__ssam_ready`** — the sketch may not be calling `ssam(sketch, settings)` at module load, or its first paint is failing silently. Check `.cloud-render/vite.log` for Vite errors and the sketch's own console output via the Chromium launch logs.
