---
name: create-sketch
description: >
  Scaffolds a new generative art sketch for the sketchbook-ssam project using the ssam framework.
  Use this skill whenever the user wants to create a new sketch, start a new generative art piece,
  add a new sketch file, or says anything like "make a sketch", "new sketch", "create a sketch called X",
  "I want to start a new piece", or describes a generative art idea they want to code up.
  Always use this skill — don't just write the file from memory.
---

# create-sketch

Scaffold a new ssam sketch file with the right structure, imports, and settings.

## Step 1: Gather info

Ask the user (in a single message, all at once):

1. **Sketch name** — what to call it (becomes the filename)
2. **Directory** — subdirectory under `src/sketches/` (e.g. `grids` → `src/sketches/grids/<name>.ts`). If not specified, default to `src/sketches/` (no subdirectory).
3. **Mode** — `2d` (default), `webgl`, or `webgl2`
4. **Animated?** — yes or no (default: no). If yes, ask for duration in milliseconds (default: 4000)
5. **Random?** — import `canvas-sketch-util/random`? (yes/no)
6. **Math?** — import `canvas-sketch-util/math` for `mapRange` etc.? (yes/no)

If any of these are already clear from context (e.g. the user said "animated sketch called foo"), don't re-ask for those — only ask what's missing.

## Step 2: Run the scaffold script

Run the bundled scaffold script — it writes the file and prints the created path:

```bash
node .claude/skills/create-sketch/scaffold.js \
  <name> \
  <dir_or_dot> \
  <mode> \
  <animated> \
  [duration_ms] \
  <random> \
  <math>
```

Argument mapping from Step 1 answers:

| Arg | Value |
|---|---|
| `name` | sketch filename (no `.ts`) |
| `dir_or_dot` | subdirectory name, or `.` for `src/sketches/` (no subdir) |
| `mode` | `2d`, `webgl`, or `webgl2` |
| `animated` | `true` or `false` |
| `duration_ms` | milliseconds — **only pass when animated=true**, omit otherwise |
| `random` | `true` or `false` |
| `math` | `true` or `false` |

Examples:

```bash
# Static 2D sketch, no subdir, no extra imports
node .claude/skills/create-sketch/scaffold.js my-sketch . 2d false false false

# Animated 2D sketch in a subdir, with random
node .claude/skills/create-sketch/scaffold.js flow-field grids 2d true 4000 true false

# WebGL sketch
node .claude/skills/create-sketch/scaffold.js shader-demo . webgl false false false
```

The script also injects the `mcp:export` handler into the scaffold so `render-sketch` doesn't need to patch the file on first use.

## Step 4: Verify

Invoke the `verify-sketch` skill on the file just created. It will run TypeScript diagnostics to confirm the scaffold is error-free and render a frame (a blank white canvas is the expected output for a fresh scaffold).

After verify-sketch reports back:
- The file path created
