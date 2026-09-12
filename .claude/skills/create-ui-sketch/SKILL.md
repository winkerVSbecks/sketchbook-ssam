---
name: create-ui-sketch
description: >
  Scaffolds a new ssam sketch with the canvas-UI shell preconfigured: grid rulers,
  toolbar, parameter sliders and magnifying-glass loupe (src/ui). Use when
  the user wants a sketch "with the UI shell", says "new UI sketch", "create a ui
  sketch called X", "scaffold a canvas-ui sketch", "sketch with the grid and
  controls", or wants the controls-demo aesthetic on a new piece. Always use this
  skill — don't hand-write the shell wiring.
---

# create-ui-sketch

Create a sketch that draws its subject inside the canvas-UI aesthetic. The template lives in this folder (`template.ts`); the wiring lives in the library (`src/ui/shell.ts`), so generated sketches stay short and pick up library fixes automatically.

## Step 1: Gather info

Ask for anything missing, in a single message:

1. **Name** — filename without `.ts` (kebab-case).
2. **Directory** — subdirectory under `src/sketches/` (or `.` for none).
3. **Parameters** — sliders for the panel: `label:min:max:value[:step][:#color]`, comma-separated. Default `weight:1:100:24`. Colours tint the knob (the demo uses `#111111`, `#e8541e`, `#8a5cf5`).
4. **Modes** (optional) — exclusive toolbar toggles using built-in icons `dot`, `ring`, `line`. Default none (the toolbar then holds only the magnifier).
5. **Grid** (optional) — `cols[:subdivisions]`, default `4:6`. **Dimensions** default `1080x1080`. `--no-loupe` removes the magnifier.

If the user already stated these, don't re-ask.

## Step 2: Run the scaffold

```bash
node .claude/skills/create-ui-sketch/scaffold.js <name> <dir_or_dot> \
  [--params "weight:1:100:24,size:0.2:2:1:0.1:#e8541e"] \
  [--modes "dot,ring"] [--grid 4:6] [--dimensions 1080x1080] [--no-loupe]
```

It writes `src/sketches/<dir>/<name>.ts`, refuses to overwrite, and prints the path plus the `VITE_SKETCH=… npm run dev` command. Non-zero exit with a message on bad input.

## Step 3: Point out the seam

The generated file has one function to replace, clearly marked: `drawScene(ctx, cam, view)`.

- Draw in **world units** under `cam.apply(ctx)` (1 unit = 1 grid cell; the fit view spans `cols` units across). Convert pixel-valued params with `shell.px`.
- `view.params` — slider values by id; `view.mode` — active toolbar mode; `view.magnified` / `view.magnification` — true inside the loupe, so the magnified view can be styled differently (e.g. `shell.hatch(color)` for the dotted fill, control nodes, measurements).
- Build paths under the camera transform, then `ctx.restore()` and fill/stroke in screen space so strokes and patterns stay crisp at any magnification.

Everything else (`shell.camera`, `shell.loupe`, `shell.handles`, `shell.windows`, `shell.params`) is exposed on the shell for customisation; `src/sketches/canvas-ui/controls-demo.ts` is the full example and `src/sketches/flatland/napoleon.ts` shows draggable world-space points via the `handles` option.

Built-in interaction: wheel pans and ⌃-wheel / trackpad pinch zooms the grid (rulers re-label; `r` resets; `gestures: false` disables), the magnifier toggle shows a draggable loupe (click inside steps 2×/4×/8×, shift+drag resizes, `Esc` hides), `h` restores closed windows.

Built-in interactions (no code needed): wheel pans the grid, ⌃-wheel / trackpad pinch zooms about the cursor, `r` resets the view; `h` restores hidden windows; the loupe is moved by dragging (⇧-drag resizes, click inside cycles 2×→4×→8×, ⌃-wheel over it fine-tunes, `Esc` hides). Pass `gestures: false` to `createShell` to disable pan/zoom.

## Step 4: Verify

Invoke the `verify-sketch` skill on the new file. Expected first render: grid rulers, toolbar (modes + magnifier), the parameter panel, and a hatched purple rounded square when the loupe is on. (A top-right parameter readout is available via `readout: true` in the shell options.)

## Files

| File | Purpose |
|---|---|
| `template.ts` | The sketch template with `__TOKENS__` |
| `scaffold.js` | Parses args, substitutes tokens, writes the sketch |
| `src/ui/shell.ts` | `createShell` — the chrome and wiring the template relies on |
