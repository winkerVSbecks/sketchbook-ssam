---
name: clrs
description: >
  Swap the color palette in an existing sketch by rewriting its palette imports
  and the 3-10 lines that set `bg` and fg colors, preserving the sketch's role
  assignments.
  Use when the user says "try this with the uchu palette", "use a riso palette",
  "swap in carmen", "apply auto-albers to <sketch>", "change colors in X to Y",
  or similar. Always use this skill — don't rewrite palette code from memory
  without reading the target file first.
---

# clrs

Swap the palette used in an existing sketch. Palettes live in `src/colors/`; each one exposes a different shape (flat array, array-of-arrays, factory function, or semantic API). The job is to rewrite the 3–10 lines at the top of the sketch that set `bg` and fg variables so they feed from the new source while preserving every downstream role name.

## Step 1: Gather info

Need two things. If either is missing, ask in one message:

1. **Target sketch** — path in `src/sketches/` (e.g. `src/sketches/jali/truchet.ts`).
2. **Palette** — name of a module in `src/colors/` (e.g. `clrs`, `uchu`, `carmen`), or a description like "a riso palette", "a random oklch scheme". If ambiguous, confirm which of the listed shapes below the user wants.

## Step 2: Read the target sketch

Read the file. Find the palette block — usually lines 4–25. Identify:

- **Current import(s)** from `../../colors/...`
- **Role variables** extracted from the palette: `bg`, `frame`, `jali`, `ring`, `inner`, `ground`, etc. These names are sometimes destructured (`const [bg, frame, jali] = colors`), sometimes popped/shifted one by one, sometimes object-destructured (`const { bg, ink }`).
- **How many fg roles are needed** (count the `pop`/`shift` calls or array length used downstream).
- Whether the palette is reshuffled per frame or fixed at module scope.

Preserve role names and count exactly. The swap only changes the *source* of colors, not how the rest of the sketch consumes them.

## Step 3: Identify the target palette shape

Read the chosen module in `src/colors/` to confirm its export shape. Palettes fall into four shapes:

### A. Flat array of palettes (`string[][]`) — pick one at random

- `colors/clrs.ts` → `clrs`
- `colors/auto-albers.ts` → `palettes`
- `colors/mindful-palettes.ts` → `palettes`
- `colors/index.ts` → `randomPalette()` (union of the three above)

```ts
import { clrs } from '../../colors/clrs';
const colors = Random.shuffle(Random.pick(clrs));
const bg = colors.pop()!;
const [frame, jali, ...rest] = colors;
```

### B. Single named palette (`string[]`) — use directly

- `colors/found.ts` → `carmen`, `bless`, `ellsworthKelly`, `warm`, `bilbao`, `figma`, `kaleidoscopic`

```ts
import { carmen } from '../../colors/found';
const colors = Random.shuffle([...carmen]);
const bg = colors.pop()!;
```

Spread into a new array before shuffling — do not mutate the exported constant.

### C. Factory / scheme function — call it for the palette

- `colors/oklch.ts` → `kellyInspiredScheme()`, `splitComplementary()`, `complementary()`, `triadic()`, `hexadic()`, `pentadic()`, `superSaturated()`, `complementaryWithVariants()` (returns `{ bg, mid, fg }`)
- `colors/hsluv.ts` → `randomThreeHueScheme()`, `threeHueHighContrastScheme()`, `kellyInspiredScheme()` — all return `[bg, mid, accent]`
- `colors/riso.ts` → `randomPalette(minContrast?)` returns `{ bg, paper, ink, inkColors }`
- `colors/rybitten.ts` → `createPalette(coords)` from user-supplied HSL tuples; also `invert(color)`
- `colors/texel.ts` / `colors/texel-random.ts` → `getPalette({ system, colorSpace, serialize? })` returns `[bg, ...16 tones]`
- `colors/subtractive-shift.ts` → `generateColorSystem(format)` returns a factory `() => string[]` (call per frame if animated, once otherwise)
- `colors/subtractive-hue.ts` → `generateColors(format, hue)` returns `string[]` for a given hue

```ts
// oklch scheme — tuple destructure
import { kellyInspiredScheme } from '../../colors/oklch';
const [bg, mid, accent] = kellyInspiredScheme();

// riso — object destructure
import { randomPalette } from '../../colors/riso';
const { bg, ink, inkColors } = randomPalette();
```

### D. Semantic APIs — call by hue name + level

- `colors/radix.ts` → `color(hue, level, 'light' | 'dark')`, `keys` (list of hue names), `kellyRadixPairs`
- `colors/uchu.ts` → `uchu.<hue>.{base|dark|light}`, `uchu.general.{yang|yin}`, `uchuHues`, `uchuExpanded.<hue>.1..9`

```ts
import { color, keys } from '../../colors/radix';
const base = Random.pick(keys);
const bg = color(base, 2);
const border = color(base, 8);
const fill = color(base, 9);
```

Semantic APIs fit sketches that want matched bg/mid/fg scale steps from one hue — don't flatten them into a shuffled array.

## Step 4: Rewrite the palette block

Replace only the palette-setup lines. Rules:

- **Keep every role name** the sketch already uses downstream. If the old code has `const bg = ...; const frame = ...; const jali = ...`, the new code must produce the same three identifiers (plus whatever else).
- **Match the count**. If the sketch pulls 5 fg colors, make sure the source has ≥5 entries after `bg`. For factory schemes that return only 3 colors, either pick a different factory or cycle/repeat — flag this to the user rather than silently shortening.
- **Semantic-to-flat mismatch**. If the user asks for a D-shape palette (radix, uchu) but the sketch consumes a flat shuffled array of N colors, stop and warn: say the target palette is semantic (scale steps off one hue), ask whether to (a) pick a different palette, (b) hand-map specific levels to the role slots, or (c) expand via `uchuExpanded.<hue>.1..9` / multiple `color(hue, level)` calls. Don't silently flatten.
- **Preserve shuffling behavior**. If the original shuffled (`Random.shuffle(...)`), shuffle the new one too unless the palette is semantic (B-shape found palettes and C-shape factory outputs both benefit from shuffle; D-shape semantic APIs should not be shuffled).
- **Don't mutate imported arrays**. Always `Random.shuffle([...palette])` or `[...arr].pop()`. Factory functions already return fresh arrays — safe to mutate.
- **Remove unused imports** from the old palette module. Remove old log statements tied to the old palette (`logColors`, inline `console.log` of colors) unless they're generic.
- **Leave the rest of the sketch untouched** — imports, config, render, helpers. Only the palette block changes.
- **Always log the palette**. After setting `bg` and the fg colors, call `logColors([bg, ...fgs])` so the palette shows up in the browser console. Import it from `../../colors` (adjust `..` depth to the sketch's location) if not already imported. Example:

  ```ts
  import { logColors } from '../../colors';
  // ...
  const bg = colors.pop()!;
  const [frame, jali, frameSide, outside] = colors;
  logColors([bg, frame, jali, frameSide, outside]);
  ```

  If the sketch already has a `logColors` or inline `console.log` of colors, replace it rather than adding a second one.

If the user asked for "a random palette from X" but X is a factory, generate once at module scope (matching project convention) unless they explicitly want per-frame regeneration.

## Step 5: Tell the user

After writing:

- One sentence naming the module swapped in and how colors are selected (e.g. "switched to a random `clrs` palette, shuffled, `bg` via `pop()`").
- How to run: `VITE_SKETCH="sketches/<path>" npm run dev`.
- Flag any edge cases: fewer fg slots than the sketch uses, semantic-to-flat mismatches, or needed role renames.
