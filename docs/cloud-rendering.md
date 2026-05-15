# Cloud rendering — running ssam sketches in claude.ai/code

> **Local users (macOS): ignore this file.** Your `npm run dev` + browser flow is unchanged. This document is only relevant when working on the project inside the claude.ai/code web sandbox.

## What this is

claude.ai/code runs an ephemeral Linux container with Node and a shell but no display server, so the regular "open a browser tab and export a PNG" loop doesn't work. `scripts/cloud-render.ts` plus a headless `chromium-headless-shell` build closes the gap: it spawns Vite in the background, drives a one-shot headless browser to the sketch page, fires `/export`, and writes a PNG to `./output/`. Chromium is created and killed per render — only Vite is long-lived.

## Provisioning model

There is no file-based provisioning hook in claude.ai/code. Two mechanisms exist (use both — they layer):

1. **UI-configured Setup Script (recommended, fastest).** In the claude.ai/code environment settings dialog, set the "Setup script" field to:
   ```sh
   npm install --no-audit --no-fund
   export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.cloud-render/browsers"
   npm run cloud:install
   ```
   This runs once per environment before Claude Code launches; the result is filesystem-snapshotted, so subsequent sessions boot instantly with the browser already cached.

2. **Repo-committed SessionStart hook (automatic fallback).** `.claude/settings.json` ships a `SessionStart` hook that runs `scripts/cloud-bootstrap.sh`. The script no-ops on local Mac sessions (`CLAUDE_CODE_REMOTE` != `true`) and, in the cloud, lazy-installs `chromium-headless-shell` only if the browser cache is missing. Idempotent and fast on snapshotted sessions.

If neither has run, `cloud:render` itself lazy-installs the browser on first call — pays ~30-45s for that one render, then the rest of the session is fast.

## Daily use inside the sandbox

The `render-sketch` skill detects cloud mode automatically (presence of `.cloud-render/vite.pid`) — just ask Claude to render a sketch the same way you would locally. Under the hood it runs:

```sh
npm run cloud:render -- sketches/<path>
```

Cleanup when you're done iterating:

```sh
npm run cloud:stop      # kills the background Vite
```

Smoke check after any change to the cloud-render path:

```sh
npm run cloud:smoke     # renders the 2D + WebGL test sketches with timing assertions
```

## Debugging

| Symptom | First place to look |
|---------|---------------------|
| Install failure | `tail .cloud-render/install.log` |
| Vite never came up | `tail .cloud-render/vite.log` |
| `/export` 504 | sketch is missing the `mcp:export` HMR handler — render-sketch skill auto-injects this; verify the edit landed |
| `__ssam_ready` timeout | sketch file isn't calling `ssam(sketch, settings)` at module load, or first paint failed silently |
| Stale Vite running the wrong sketch | `npm run cloud:stop`, then re-render |

## Security note

`scripts/cloud-render.ts` launches Chromium with `--no-sandbox` and `--disable-dev-shm-usage`. These flags are required to run Chromium inside an unprivileged Linux container that already provides sandboxing at the host layer. The page only ever navigates to `http://localhost:5173/`, so the surface for misuse is limited to what the sketch code itself does.
