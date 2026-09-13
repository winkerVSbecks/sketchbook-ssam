---
name: create-tui-sketch
description: >
  Scaffolds a new ssam sketch on the terminal desktop: a character-grid canvas
  with box-drawing windows, a system menu bar and a glyph-drawn settings window
  (src/tui). Use when the user wants a "terminal sketch", says "new terminal
  sketch", "tui sketch", "desktop sketch", "terminal desktop", "create a tui
  sketch called X", "sketch with terminal windows", or wants the
  layered-compositions desktop look on a new piece. Always use this skill —
  don't hand-write the desktop wiring.
---

# create-tui-sketch

Create a sketch whose subject lives inside draggable terminal windows. The template lives in this folder (`template.ts`); the wiring lives in the library (`src/tui/desktop.ts`), so generated sketches stay short and pick up library fixes automatically.

## Step 1: Gather info

Ask for anything missing, in a single message:

1. **Name** — filename without `.ts` (kebab-case).
2. **Directory** — subdirectory under `src/sketches/` (or `.` for none). Terminal pieces live in `terminal-ui`.
3. **Controls** — the settings window, comma-separated, in order: `range:label:min:max:value[:step]`, `toggle:label[:on]`, `button:label`. Default `range:level:0:1:0.5:0.05,toggle:grid:on`. Consecutive toggles share one checkbox group.
4. **Windows** — initial windows in cells: `title:row:col:rows:cols`, comma-separated. Default `main:2:2:14:40`. At 1080² with the 14:20 font the buffer is about 54 rows × 128 cols; the bar band takes two rows.
5. **Bar** (optional) — `bottom` (default, taskbar-style) or `top`. **Dimensions** default `1080x1080`. **Font** `size:lineH`, default `14:20`.

If the user already stated these, don't re-ask.

## Step 2: Run the scaffold

```bash
node .claude/skills/create-tui-sketch/scaffold.js <name> <dir_or_dot> \
  [--controls "range:speed:0:2:1:0.1,toggle:grid:on,button:reset"] \
  [--windows "one:2:2:10:30,two:4:36:12:28"] \
  [--bar bottom|top] [--dimensions 1080x1080] [--font 14:20]
```

It writes `src/sketches/<dir>/<name>.ts`, refuses to overwrite, and prints the path plus the `VITE_SKETCH=… npm run dev` command. Non-zero exit with a message on bad input (unknown control kind, non-numeric geometry, windows under 3×8 cells, duplicate ids/titles).

## Step 3: Point out the seam

The generated file has one function to replace, clearly marked: `drawWindow(buf, inner, win)`. It is called for every window with the buffer already clipped to `inner`; switch on `win.title` (one `case` per scaffolded window) to give each its own content. Delete the `placeholder` helper once the cases have real bodies.

- Everything is in **cells**: `inner`/`win.rect` are `{ row, col, rows, cols }`; paint with `buf.put`, `buf.text`, `buf.hline`/`vline`, `buf.box`, `buf.fill`; `SHADES` (`░▒▓█`) and `BOX` are exported from `src/tui`.
- `state` holds the settings values by control id (ranges are numbers, toggles booleans); buttons come with an empty `onPress` to fill in. The desktop calls `props.render()` after any interaction.
- Colours come from `desktop.theme` (`bg`, `fg`, `dim`, `accent`, `chromeBg`…), derived from `randomPalette()`; `desktop.setTheme(palette)` retints everything in place.
- `wallpaper(buf, area)` is optional and paints behind the windows; drop it (and the `wallpaper` option) for a plain ground.
- Resizing a window simply calls `drawWindow` with a new `inner` — rebuild any cached content when `inner.rows`/`inner.cols` change (see `src/sketches/terminal-ui/layered-compositions.ts`, the full example).

`desktop.addWindow` / `removeWindow`, `desktop.windows` (z-order, back → front), `desktop.area` (the desktop minus the bar), `desktop.activeFrame` and `desktop.toggleSettings()` are there for customisation; `window.__demo.desktop` exposes it in DEV.

Built-in interaction (no code needed): drag the title row to move a window in whole cells; double-click the title row to maximize / restore (same as `[□]`); drag the bottom-right corner grip to resize (min size clamped); `[–]` minimizes into the bar, `[□]` maximizes to the desktop area / restores, `[×]` closes; the front window draws a double frame. The two-row bar (text on the upper row, the whole band hit-testable) holds `+ new` (calls `onNewWindow`; the template's stub adds a cascaded 12×32 window drawn by `drawWindow`), then `≡ settings` (toggles the settings window — it opens bottom-left, directly above the bar, and is a normal window: closable, minimizable, draggable) followed by one item per minimized window (click restores and fronts it). Keyboard: `Esc` hides the settings window, `h` restores every minimized window.

## Step 4: Verify

Invoke the `verify-sketch` skill on the new file. Expected first render: the palette's background with a sparse dot wallpaper, one window per `--windows` entry (the front one double-framed, its body a shaded density field that follows the first range), the bar along the bottom with `≡ settings` and the sketch name as status. Toggle `≡ settings` (or `window.__demo.desktop.toggleSettings()`) to see the controls rendered in glyphs.

## Files

| File | Purpose |
|---|---|
| `template.ts` | The sketch template with `__TOKENS__` |
| `scaffold.js` | Parses args, substitutes tokens, writes the sketch |
| `src/tui/desktop.ts` | `createDesktop` — the desktop and wiring the template relies on |
| `src/sketches/terminal-ui/layered-compositions.ts` | Full example: every chart panel is a window |
