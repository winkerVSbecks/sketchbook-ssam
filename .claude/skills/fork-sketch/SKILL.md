---
name: fork-sketch
description: >
  Copies an existing sketch to a new file, then modifies it based on the user's description.
  Use when the user wants to branch off an existing sketch with changes, says "fork X into Y",
  "copy sketch X and modify it to...", "make a variant of X called Y", or similar.
  Always use this skill — don't copy or edit files from memory.
---

# fork-sketch

Copy an existing sketch to a new file, then apply changes to the copy.

## Step 1: Gather info

Ensure you have all three pieces of information. If any are missing, ask for them in a single message:

1. **Source file** — path to the sketch to fork (e.g. `src/sketches/anni-weaving.ts`)
2. **New name** — filename for the fork (e.g. `anni-weaving-v2` → `src/sketches/anni-weaving-v2.ts`). Place it in the same directory as the source unless the user specifies otherwise.
3. **Changes** — description of what to modify in the forked sketch

## Step 2: Copy the source file

Read the source sketch file in full, then write its contents verbatim to the new file path. Do not modify anything yet.

## Step 3: Apply changes using implement-sketch

Invoke the `implement-sketch` skill on the new file with the user's change description. The implement-sketch skill will read the new file and apply the modifications following all project conventions (config object, tweakpane bindings, code style, etc.).

## Step 4: Tell the user

After the fork and edits are complete:
- Confirm the new file path
- How to run it: `VITE_SKETCH="sketches/<name>" npm run dev` (adjust path if in a subdirectory)
- One sentence summarising what changed relative to the source
