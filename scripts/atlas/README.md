# Atlas data pipeline

`npm run atlas` serves the Atlas (archive-app/src/atlas/) from
`archive-app/atlas.json`. That file is assembled from three inputs, all kept
under `scripts/atlas/data/`:

1. **Per-sketch records** (`data/records/code-*.json`, `data/records/vision-*.json`)
   — agent-generated. Claude reads every sketch's source (tagging contract:
   `tagging/code-rules.md`) and its rendered thumbnail
   (`tagging/vision-rules.md`), ~24 sketches per agent. To re-tag after new
   sketches are archived, ask Claude to re-run the corpus analysis using those
   two rules files; only new/changed ids need tagging (records merge by id,
   last file wins).
2. **Visual metrics** (`data/visual-metrics.json`) — deterministic:
   `npx tsx scripts/atlas/visual-metrics.ts` (downloads 512px Cloudinary
   thumbs into a cache dir and measures color in OKLCH).
3. **Synthesis** (`data/synthesis/*.json`) — agent-generated: `taxonomy.json`
   (tag merges), `clusters.json` (clusters + threads), `insights.json`
   (ranked opportunities). Regenerate by asking Claude; shapes are documented
   in `assemble.ts`.

Then rebuild the app data (deterministic — similarity edges, tag counts,
cluster fallbacks):

```sh
npx tsx scripts/atlas/assemble.ts \
  --records scripts/atlas/data/records \
  --metrics scripts/atlas/data/visual-metrics.json \
  --synthesis scripts/atlas/data/synthesis
```
