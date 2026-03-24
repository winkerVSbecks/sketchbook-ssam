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
2. **New name** — filename for the fork (e.g. `anni-weaving-v2`)
3. **Changes** — description of what to modify in the forked sketch

## Step 2: Determine destination directory

Check whether the source file lives directly in `src/sketches/` (i.e. not in a subdirectory):

- **Source is in `src/sketches/<name>.ts`** — ask the user what subdirectory name to create inside `src/sketches/`. Then:
  1. Move the original file to `src/sketches/<subdir>/<original-name>.ts` using `git mv` so git tracks the rename.
  2. Place the forked file at `src/sketches/<subdir>/<new-name>.ts`.
- **Source is already in a subdirectory** (e.g. `src/sketches/grids/foo.ts`) — place the fork in the same directory. Do not move the original.

## Step 3: Copy the source file

Read the source sketch file in full, then write its contents verbatim to the new file path. Do not modify anything yet.

## Step 4: Apply changes using implement-sketch

Invoke the `implement-sketch` skill on the new file with the user's change description. The implement-sketch skill will read the new file and apply the modifications following all project conventions (config object, tweakpane bindings, code style, etc.).

## Step 5: Tell the user

After the fork and edits are complete:
- Confirm both file paths (original's new location if it was moved, and the forked file)
- How to run each: `VITE_SKETCH="sketches/<subdir>/<name>" npm run dev`
- One sentence summarising what changed relative to the source
