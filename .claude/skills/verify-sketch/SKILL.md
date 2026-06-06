---
name: verify-sketch
description: >
  After any code change to a sketch, checks TypeScript diagnostics and renders
  a frame to visually confirm the result matches intent.
  Use proactively after implement-sketch, clrs, fork-sketch, or any edit that
  changes visual output. Also use when the user says "check it", "does it work?",
  "verify the sketch", "what does it look like now?", "does the palette look right?",
  "see the result", or "confirm the output".
  Always use this skill — do not manually curl /export or invent your own export flow.
---

# verify-sketch

Close the feedback loop after a code change: check TypeScript compiles, render a frame, report what you see.

## When to invoke

- **Proactively** — at the end of any skill that writes or edits a sketch file (`implement-sketch`, `clrs`, `fork-sketch`, `create-sketch`). Do not wait for the user to ask.
- **On demand** — user says "check it", "verify", "what does it look like?", "does the palette show?", "is the loop right?", "does the animation work?"

## Step 1: TypeScript diagnostics

Before rendering, catch compile errors with the LSP — it's faster than a build and reports exact line numbers.

Use ToolSearch to load the schema first, then call the tool:

```
ToolSearch: select:mcp__plugin_oh-my-claudecode_t__lsp_diagnostics
```

Call it with the sketch file's absolute path. If it returns errors:

- Report each error with its line number and message.
- Fix mechanically if the cause is clear (wrong type annotation, missing import, typo). Re-run diagnostics after fixing to confirm clean.
- Stop and report to the user if the error requires a design decision (e.g. the palette returns fewer colors than the sketch needs).

Only proceed to Step 2 when diagnostics are clean.

## Step 2: Render a frame

Invoke the `render-sketch` skill. It handles the full flow: checking the dev server, hitting `/export`, reading the newest PNG.

If the dev server is not running, surface the exact command to start it:

```
VITE_SKETCH="sketches/<path>" npm run dev
```

Do not start the dev server yourself. Tell the user to run it, then re-invoke this skill when ready.

## Step 3: Observe and report

Read the rendered PNG. Describe concretely — 3–5 sentences, only things relevant to the change that was just made:

| What to check | What to say |
|---|---|
| **Colors** | Name the background color and how many foreground colors are visible. Do they match the palette just applied? |
| **Shapes / layout** | Are the expected elements present (grid cells, particles, lines, strokes)? Are there degenerate shapes (hairline-thin rectangles, zero-radius circles)? |
| **Animation state** | Does the freeze-frame look mid-motion (healthy) or like frame 0 / a blank canvas (stuck)? |
| **Composition** | Does the overall layout match what was described or requested? |

Flag anything that differs from the stated intent. If everything matches, say so in one sentence.

## Tools used

| Tool | Purpose |
|---|---|
| `mcp__plugin_oh-my-claudecode_t__lsp_diagnostics` | TypeScript error check via LSP — load schema with ToolSearch before calling |
| `render-sketch` skill | Triggers `/export` endpoint and reads the PNG |
| `Read` | View the PNG inline |

## Why this exists

Every code-writing skill (`implement-sketch`, `clrs`, `fork-sketch`, `create-sketch`) previously ended by telling the user how to run the sketch — leaving them to manually start the server, open the browser, look, and report back. This skill closes that loop so visual verification happens in the same turn as the code change.
