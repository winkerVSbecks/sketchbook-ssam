# Insight rules

You are reading a generative-art sketchbook as a whole and writing opportunity notes for the artist: concrete next sketches suggested by the shape of the work so far. The Atlas lists each insight with its kind and title, and shows its body above the sketches it cites.

## Input

Read the corpus digest you were given (`npx tsx scripts/atlas/synthesis.ts digest`): clusters, threads, colour-system usage, tag counts and one line per sketch. Read `.claude/skills/art-philosophy/SKILL.md` once for the artist's stance. Open sketch sources (`src/<id>.ts`) when an insight depends on how something is built.

## Lens

You write through one lens, named in your assignment:

- **curator**: the body of work as a collection. Look at its gaps, imbalances, abandoned series, outliers worth revisiting, and series that want a sequel or a change of scale or medium.
- **technician**: the work as a set of engines and techniques. Look at a technique proven in one place that would change another, two engines that have never met, and a colour system or tool only half used.

## Output

Write `{ "generatedAt": "<ISO date>", "insights": [ ... ] }` to the file named in your assignment, with **12–16 insights**, each:

```json
{
  "kind": "one of the kinds below",
  "title": "Imperative, at most 60 characters, naming the move",
  "body": "2–4 sentences, at most 600 characters",
  "relatedIds": ["3–9 sketch ids exactly as in the digest, the evidence and the starting points"],
  "tags": ["3–6 tags from the digest's tag lists or engine names"],
  "clusterKeys": ["1–3 cluster keys the insight spans"]
}
```

Kinds: `technique-transfer` (a method proven in one place, applied in another), `unexplored-combination` (two strands that have never met), `abandoned-thread` (a line of work that stopped, worth reviving), `deepen-series` (a series with more to give), `bridge` (one sketch that would connect two clusters), `scale-shift` (the same idea at another size, medium or output, such as the plotter), `series-opportunity` (a set of one-offs that wants to be a series), `outlier-worth-revisiting` (a single sketch unlike its neighbours).

**The body** follows this shape, in order:

1. The evidence, with counts taken from the digest ("auto-albers feeds 51 sketches, cusphanger 7") and named sketches.
2. The gap or tension that evidence shows.
3. The specific next sketch: what it draws, and from which existing engine, file or colour system it starts.

Every count is computed from the digest you were given, never estimated or remembered. Every relatedId appears in the digest.

Reply with one line: `WROTE <n> insights to <file>`.

## Merge (the coordinator, after both lenses)

Combine the two lens files into `scripts/atlas/data/synthesis/insights.json`, `{ "generatedAt", "insights" }`, with **20–24 insights**:

- **Duplicates:** where two insights propose the same move, keep the one with the stronger evidence.
- **Order:** rank by how concrete and how far-reaching the next sketch is.
- **Balance:** at most 5 of one kind, and at most 6 centred on the same engine or cluster.
- **Wording:** keep each kept insight verbatim. Merging is selection, not rewriting.

Then run `npx tsx scripts/atlas/synthesis.ts format insights.json insights-curator.json insights-technician.json`.
