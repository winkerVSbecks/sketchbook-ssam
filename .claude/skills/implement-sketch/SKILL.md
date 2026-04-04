---
name: implement-sketch
description: >
  Takes a generative art idea and implements it in an existing sketch file,
  following the project's code patterns and style conventions.
  Use when the user describes what they want a sketch to do/look like,
  or says "implement this", "make it do X", "add X to the sketch", etc.
  Always use this skill — don't implement from memory without reading the file first.
---

# implement-sketch

Implement a generative art idea in an existing ssam sketch file, following project conventions.

## Step 1: Read the target file

Read the sketch file the user wants to implement in. If they haven't specified one, ask which file to work in.

Also briefly scan related sketches for relevant patterns if the idea involves a technique not already present in the target file (e.g. noise fields, particle systems, grid layouts, packing algorithms).

If the target file imports a third-party library you don't have API knowledge of (e.g. `heerich`, an unfamiliar renderer), **grep the project for other sketches that use it** and read one to learn the API — don't guess method names or signatures.

## Step 2: Understand the idea

If the idea is vague or ambiguous, ask one focused clarifying question. Otherwise proceed with reasonable creative interpretation — don't over-ask.

**When to ask before proceeding:**
- The idea involves 3D or spatial arrangement (voxels, isometric, oblique) and no visual reference is provided — ask for one or a description of the target output.
- The element placement follows a non-obvious algorithmic rule (staggered offsets, interlocking patterns, shrinking/growing sequences) — ask the user to spell out the rule rather than inferring it from a vague description.
- The camera/projection style is unspecified for a 3D sketch — ask (isometric? oblique? perspective? angle?).

Think through:
- What visual elements are being drawn?
- Is there animation? If so, what changes over time?
- What's the overall composition (grid, field, particles, paths, etc.)?
- Which utilities from the project are relevant?

## Step 3: Plan the implementation

Before writing, briefly outline the approach:
- What data structures represent the scene (plain objects/arrays, not classes)
- What is computed once (setup) vs per-frame (render)
- Which imports are needed
- How animation timing maps to visual change (playhead, frame, time)

## Step 4: Write the implementation

### Code style rules (strict)

- **No classes** — use plain objects, arrays, and functions
- **Prefer stateless functions** — pure functions that take inputs and return outputs
- **State in closures** — if state persists across frames, declare it before `wrap.render`, not inside it
- **Named helper functions** — extract non-trivial logic into named functions at file scope (bottom of file), not inline lambdas
- **TypeScript** — type all function parameters and return values; use `interface`/`type` for complex shapes

### Drawing patterns to follow

```typescript
// Clear canvas
context.fillStyle = bg;
context.fillRect(0, 0, width, height);

// Save/restore for transforms
context.save();
context.translate(cx, cy);
// ... draw ...
context.restore();

// Paths
context.beginPath();
context.arc(x, y, r, 0, Math.PI * 2);
context.fill();
```

### Animation patterns

```typescript
// Use playhead (0→1 per loop) for smooth cycles
const t = mapRange(playhead, 0, 1, startVal, endVal);

// Progressive reveal
const visible = Math.floor(playhead * items.length);

// Looping noise (from src/loop-noise.ts)
const n = loopNoise(x, y, playhead, scale);
```

### State management

```typescript
// One-time setup — outside wrap.render
const points = generatePoints(width, height);
let count = 0;

// Per-frame — inside wrap.render
wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
  // ...
};
```

### Color patterns

Prefer these sources in order:
1. Project palette utilities — `generateColors()` from `../subtractive-color` for RYB ramps
2. `rampensau` — `generateColorRamp()` + `colorToCSS()` for oklch ramps
3. Hard-coded okclh/hsl strings for simple cases

### Available project utilities

| Import | What it provides |
|--------|-----------------|
| `canvas-sketch-util/random` | `Random.range()`, `.rangeFloor()`, `.pick()`, `.noise2D/3D/4D()`, `.chance()` |
| `canvas-sketch-util/math` | `mapRange()`, `lerp()`, `lerpArray()`, `clamp()` |
| `../grid` | `makeGrid()` → grid cells with `{x, y, width, height, col, row}` |
| `../loop-noise` | `loopNoise()`, `loopNoise2D()` — seamlessly looping Perlin noise |
| `../noise-texture` | `applyNoise()` — add grain to canvas pixels |
| `../subtractive-color` | `generateColors()` — RYB color palettes |
| `rampensau` | `generateColorRamp()`, `colorToCSS()` |
| `chaikin-smooth` | `smooth()` — smooth polylines |
| `tweakpane` | `Pane` — always imported for the `config` panel |

Only import what is actually used (except `tweakpane` — always import it).

### Config object and Tweakpane (always include)

Every sketch must have a top-level `config` object holding all tuneable parameters. Wire each parameter to a Tweakpane `Pane` instance so the user can edit them live.

```typescript
import { Pane } from 'tweakpane';

const config = {
  count: 100,
  speed: 0.5,
  radius: 10,
  // ... all tuneable values
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

pane.addBinding(config, 'count', { min: 1, max: 500, step: 1 });
pane.addBinding(config, 'speed', { min: 0, max: 2, step: 0.01 });
pane.addBinding(config, 'radius', { min: 1, max: 100, step: 0.5 });
```

Rules:
- **All magic numbers** that affect the visual output go in `config`, not scattered as constants or inline literals.
- **Color strings** that are tuneable go in `config` too (tweakpane renders a color picker automatically for CSS hex strings).
- Give each `addBinding` call sensible `min`/`max`/`step` options based on the parameter's range.
- In the render function, read from `config` directly — e.g. `config.radius` — so live edits take effect immediately.
- Do **not** destructure `config` at the top of `wrap.render`; reference it directly so tweakpane changes are always picked up.

### Hot reload boilerplate (always include if not already present)

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => wrap.dispose());
  import.meta.hot.accept(() => wrap.hotReload());
}
```

## Step 5: Write the file

Implement the full sketch. Preserve the existing `settings` export unchanged unless the idea clearly requires changing `animate`, `duration`, or `dimensions`. Do not add unused imports or placeholder comments in the final file.

## Step 6: Tell the user

After writing the file:
- One sentence describing what was implemented
- How to run it: `VITE_SKETCH="sketches/<name>" npm run dev`
- Any notable creative choices made (only if non-obvious)
