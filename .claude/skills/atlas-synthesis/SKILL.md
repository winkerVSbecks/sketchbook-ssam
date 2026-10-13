---
name: atlas-synthesis
description: >
  Use when the Atlas data (archive-app/atlas.json) is behind the archive: after
  `npm run archive` adds or re-renders sketches, when the Atlas shows small
  placeholder clusters named after a folder, or when threads or insights feel
  stale. Also use when the user says "refresh the atlas", "regenerate insights",
  "regenerate threads", "tag the new sketches", or "update the atlas data".
  Always use this skill rather than running assemble.ts on its own.
---

# atlas-synthesis

Bring `archive-app/atlas.json` up to date with the archive. Scripts do the mechanical work. Fresh agents do the judgment work, each from a rules file in `scripts/atlas/tagging/`.

**Running `assemble.ts` before every sketch has records and a cluster is the failure this skill exists to prevent.** Any untagged id becomes its own placeholder cluster in the Atlas.

## Pick the scope

| User asked for                               | Steps |
| -------------------------------------------- | ----- |
| new sketches tagged (the default after archiving) | 1–4, 8–9 |
| threads and/or insights regenerated          | 1–9 (steps 6 or 7 alone if only one was asked for) |
| clusters regrouped                           | ask first: it reshuffles the whole Clusters view |

## Steps

1. **Status.** Run `npx tsx scripts/atlas/synthesis.ts status`. It lists ids with no code or vision record, no colour metrics, or no cluster, plus thread and insight members that left the archive. Exit 1 means steps 2–4 are owed.

2. **Tag.** For each id with no record, dispatch fresh agents with about 24 ids each. Each agent gets `scripts/atlas/tagging/code-rules.md` (code records), or `vision-rules.md` plus the downloaded thumbnails (vision records), and writes the next free `scripts/atlas/data/records/code-<n>.json` / `vision-<n>.json`. For a handful of ids, tag them yourself under the same rules. Download thumbnails with the Cloudinary URL from `archive-app/archive.json`, inserting `/upload/w_640,q_auto,f_jpg/`.

3. **Metrics.** Run `npx tsx scripts/atlas/visual-metrics.ts`. It caches thumbnails in `/tmp/atlas-thumbs`; delete a re-rendered sketch's cached file first so it is measured again.

4. **Cluster the newcomers.** Add each unclustered id to the `members` of the cluster in `scripts/atlas/data/synthesis/clusters.json` where its series siblings already are, or else to the cluster whose blurb fits it. Then run `npx tsx scripts/atlas/synthesis.ts format clusters.json`. The diff should be the added ids only.

5. **Assemble, then confirm.** Run the assemble command from `scripts/atlas/README.md`, then `status` again. It must exit 0 with no "missing records" warning from assemble.

6. **Threads.** Write the digest (`npx tsx scripts/atlas/synthesis.ts digest > /tmp/atlas-digest.md`). Dispatch one fresh agent with `scripts/atlas/tagging/threads-rules.md` and the digest path. When it reports, run `npx tsx scripts/atlas/synthesis.ts check`; send any listed problem back to the agent.

7. **Insights.** Dispatch two fresh agents in parallel, each with `scripts/atlas/tagging/insights-rules.md` and the digest path. Assign one the **curator** lens writing `scripts/atlas/data/synthesis/insights-curator.json`, and the other the **technician** lens writing `insights-technician.json`. When both report, run `npx tsx scripts/atlas/synthesis.ts check insights-curator.json insights-technician.json`. Then recompute a few of the counts each lens quotes from `archive-app/atlas.json`; correct a wrong number in place, since that is a fix, not a rewrite. Merge into `insights.json` yourself following the rules file's Merge section, and run `check` once more.

8. **Assemble and verify.** Assemble again, then run `status` (exit 0) and `npm run test && npm run typecheck`. Spot-check the Atlas (`npm run atlas`, port 5182): the Threads and Insights folds list the new entries, and no cluster is named after a folder.

9. **Commit in units**, each once it verifies: records, metrics and cluster membership; then threads; then insights. `atlas.json` goes with whichever unit rebuilt it.

## Quick reference

| Need                       | Command |
| -------------------------- | ------- |
| what is stale              | `npx tsx scripts/atlas/synthesis.ts status` |
| corpus summary for agents  | `npx tsx scripts/atlas/synthesis.ts digest` |
| threads/insights keep the rules | `npx tsx scripts/atlas/synthesis.ts check [insight files]` |
| keep a rewritten file's layout | `npx tsx scripts/atlas/synthesis.ts format <file...>` |
| rebuild atlas.json         | the `assemble.ts` command in `scripts/atlas/README.md` |

## Common mistakes

- **Assembling with gaps:** `status` exiting 1 means the Atlas will show placeholder clusters. Finish steps 2–4 first.
- **Rewriting clusters.json with a different JSON layout:** the diff then hides the real change. Always finish with `format`.
- **Regrouping clusters while tagging:** newcomers join existing clusters. A regroup is its own request.
- **Trusting quoted counts:** `check` validates structure, not numbers. Lens agents get most counts right and some slightly wrong, so recompute a sample before merging.
- **Renaming a thread's key:** Atlas URLs use it. Keep the key while the lineage is the same.
