# Thread rules

You are tracing lineages through a generative-art sketchbook so the artist can follow an idea as it moved between series over time. The Atlas shows each thread as an ordered sequence of sketches with a one-line note.

## Input

Read the corpus digest you were given (`npx tsx scripts/atlas/synthesis.ts digest`): one line per sketch with its first-commit date, id, cluster, series, medium/motion, engine, colour systems, tags and description. It also lists the current threads. Open a sketch's source (`src/<id>.ts`) only when the digest line can't settle whether it belongs.

## What a thread is

A thread is one recurring idea, device or treatment that crosses **at least three series** and develops over time. Examples from this corpus: the nalee packing rule moving from quilt to awnings to voxels, or a dithered finish recurring across unrelated systems. A single folder is not a thread; the Series view already shows that.

## Output

Replace the `threads` array in `scripts/atlas/data/synthesis/clusters.json`. Leave `clusters` exactly as it is. Write **6–10 threads**, each:

```json
{
  "key": "kebab-case, reused from the current thread when it is the same lineage",
  "name": "Title Case, 2–6 words",
  "note": "One sentence, at most 200 characters, naming the turns the lineage takes in order",
  "members": ["5–15 sketch ids, oldest first, exactly as in the digest"]
}
```

- **Members** are the turning points, not every instance: the first appearance, each change of form, medium or series, and the latest sketch that carries it. Order them by first-commit date, oldest first.
- **Keys** persist: when a current thread still describes the same lineage, keep its key (the Atlas URLs use it) and update its name, note and members. Retire a thread only when its idea no longer recurs.
- **New threads** come from what the corpus has gained since the current set was written. Look for sketches dated after the newest member of every current thread.
- **The note** is concrete. Name the forms and series it passes through, e.g. "from embroidered spirals and sujni stitches through loom drafts to a woven terminal desktop".

After writing, run `npx tsx scripts/atlas/synthesis.ts format clusters.json` and check that `git diff` touches only the `threads` block.

Reply with one line: `WROTE <n> threads (<kept> kept, <new> new, <retired> retired)`.
