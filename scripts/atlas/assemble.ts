/**
 * Assemble archive-app/atlas.json — the data behind `npm run atlas`.
 *
 * Inputs come from a corpus-analysis pass (agent-generated, see CLAUDE.md):
 *   --records   dir with code-*.json and vision-*.json record arrays
 *   --metrics   visual-metrics.json (per-id color metrics from thumbnails)
 *   --synthesis dir with taxonomy.json, clusters.json, insights.json (optional files)
 *   --out       output path (default archive-app/atlas.json)
 *
 * The canonical sketch list is archive-app/archive.json. Similarity edges are
 * computed here (weighted tag overlap, cross-series only) so the app stays a
 * pure viewer.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

type CodeRecord = {
  id: string;
  description?: string;
  concepts?: string[];
  techniques?: string[];
  forms?: string[];
  medium?: string;
  motion?: string;
  palette?: string;
  influences?: string[];
  system?: string | null;
  notable?: string | null;
};

type VisionRecord = {
  id: string;
  bg?: string;
  palette?: string;
  hues?: string[];
  density?: string;
  composition?: string[];
  texture?: string[];
  energy?: string;
  keywords?: string[];
};

type MergeEntry = { canonical: string; aliases: string[] };
type Taxonomy = { merges?: Record<string, MergeEntry[]>; drop?: string[] };
type ClusterDef = { key: string; name: string; blurb?: string; members: string[] };
type ThreadDef = { key: string; name: string; note?: string; members: string[] };

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  console.error(`missing --${name}`);
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, '../..');
const recordsDir = arg('records');
const metricsPath = arg('metrics');
const synthesisDir = arg('synthesis');
const outPath = arg('out', join(repoRoot, 'archive-app/atlas.json'));

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const readOptional = <T,>(p: string): T | null => (existsSync(p) ? (readJson(p) as T) : null);

// ---------- load ----------

const archive = readJson(join(repoRoot, 'archive-app/archive.json')) as {
  sketches: {
    id: string;
    name: string;
    firstCommitDate: string;
    year: number;
    cloudinary: { url: string; width: number; height: number };
  }[];
};

function loadRecords<T extends { id: string }>(prefix: string): Map<string, T> {
  const map = new Map<string, T>();
  const files = readdirSync(recordsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort();
  for (const f of files) {
    for (const r of readJson(join(recordsDir, f)) as T[]) map.set(r.id, r);
  }
  return map;
}

const codeRecords = loadRecords<CodeRecord>('code-');
const visionRecords = loadRecords<VisionRecord>('vision-');
const metrics = readJson(metricsPath) as Record<string, unknown>;
const taxonomy = readOptional<Taxonomy>(join(synthesisDir, 'taxonomy.json'));
const clusterData = readOptional<{ clusters: ClusterDef[]; threads?: ThreadDef[] }>(
  join(synthesisDir, 'clusters.json'),
);
const insightData = readOptional<{ insights: Record<string, unknown>[] }>(
  join(synthesisDir, 'insights.json'),
);

// ---------- taxonomy application ----------

const drop = new Set(taxonomy?.drop ?? []);
function canonMap(field: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of taxonomy?.merges?.[field] ?? []) {
    for (const a of m.aliases) map.set(a, m.canonical);
  }
  return map;
}
const canon = {
  concepts: canonMap('concepts'),
  techniques: canonMap('techniques'),
  forms: canonMap('forms'),
  palettes: canonMap('palettes'),
  influences: canonMap('influences'),
  systems: canonMap('systems'),
};

function applyTags(tags: string[] | undefined, map: Map<string, string>): string[] {
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const t = map.get(raw) ?? raw;
    if (drop.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}
const applyOne = (tag: string | null | undefined, map: Map<string, string>) =>
  tag ? (map.get(tag) ?? tag) : null;

// ---------- nodes ----------

const seriesOf = (id: string): string | null => {
  const parts = id.split('/');
  return parts.length > 2 ? parts.slice(1, -1).join('/') : null;
};
const seriesLabelOf = (series: string | null): string | null =>
  series === null ? null : series.replace(/\/sketches$/, '');

let missingCode = 0;
let missingVision = 0;

const clusterOf = new Map<string, string>();
for (const c of clusterData?.clusters ?? []) {
  for (const id of c.members) clusterOf.set(id, c.key);
}

const nodes = archive.sketches.map((s) => {
  const code = codeRecords.get(s.id);
  const vision = visionRecords.get(s.id);
  if (!code) missingCode++;
  if (!vision) missingVision++;
  const series = seriesOf(s.id);
  const seriesLabel = seriesLabelOf(series);
  return {
    id: s.id,
    name: s.name,
    series,
    seriesLabel,
    date: s.firstCommitDate.slice(0, 7),
    created: s.firstCommitDate.slice(0, 10),
    year: s.year,
    url: s.cloudinary.url,
    w: s.cloudinary.width,
    h: s.cloudinary.height,
    description: code?.description ?? '',
    concepts: applyTags(code?.concepts, canon.concepts),
    techniques: applyTags(code?.techniques, canon.techniques),
    forms: applyTags(code?.forms, canon.forms),
    medium: code?.medium ?? 'canvas2d',
    motion: code?.motion ?? 'static',
    palette: applyOne(code?.palette, canon.palettes) ?? 'custom-hex',
    influences: applyTags(code?.influences, canon.influences),
    system: applyOne(code?.system ?? null, canon.systems),
    notable: code?.notable ?? null,
    cluster: clusterOf.get(s.id) ?? seriesLabel ?? 'one-offs',
    vision: vision
      ? {
          bg: vision.bg ?? 'light',
          palette: vision.palette ?? 'limited',
          hues: vision.hues ?? [],
          density: vision.density ?? 'medium',
          composition: vision.composition ?? [],
          texture: vision.texture ?? [],
          energy: vision.energy ?? 'calm',
          keywords: vision.keywords ?? [],
        }
      : null,
    metrics: (metrics[s.id] as Record<string, unknown> | null) ?? null,
  };
});

// ---------- clusters / threads / insights ----------

const knownIds = new Set(nodes.map((n) => n.id));
const clusterCounts = new Map<string, number>();
for (const n of nodes) clusterCounts.set(n.cluster, (clusterCounts.get(n.cluster) ?? 0) + 1);

const clusters = clusterData
  ? clusterData.clusters
      .filter((c) => (clusterCounts.get(c.key) ?? 0) > 0)
      .map((c) => ({
        key: c.key,
        name: c.name,
        blurb: c.blurb ?? '',
        count: clusterCounts.get(c.key) ?? 0,
      }))
  : [...clusterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, name: key, blurb: '', count }));

const threads = (clusterData?.threads ?? [])
  .map((t) => ({
    key: t.key,
    name: t.name,
    note: t.note ?? '',
    members: t.members.filter((id) => knownIds.has(id)),
  }))
  .filter((t) => t.members.length >= 3);

const insights = (insightData?.insights ?? [])
  .map((i) => ({
    kind: String(i.kind ?? 'insight'),
    title: String(i.title ?? ''),
    body: String(i.body ?? ''),
    relatedIds: ((i.relatedIds as string[]) ?? []).filter((id) => knownIds.has(id)),
    tags: (i.tags as string[]) ?? [],
    clusterKeys: (i.clusterKeys as string[]) ?? [],
  }))
  .filter((i) => i.title && i.relatedIds.length > 0);

// ---------- tag counts ----------

function countTags(field: 'concepts' | 'techniques' | 'forms'): [string, number][] {
  const counts = new Map<string, number>();
  for (const n of nodes) for (const t of n[field]) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
}

// ---------- similarity edges ----------

type Bag = Map<string, number>;
function bagOf(n: (typeof nodes)[number]): Bag {
  const bag: Bag = new Map();
  const add = (key: string, w: number) => bag.set(key, Math.max(bag.get(key) ?? 0, w));
  for (const t of n.concepts) add(`c:${t}`, 2);
  for (const t of n.techniques) add(`t:${t}`, 2);
  for (const t of n.forms) add(`f:${t}`, 1);
  for (const t of n.influences) add(`i:${t}`, 1.5);
  add(`p:${n.palette}`, 0.5);
  if (n.system) add(`s:${n.system}`, 3);
  if (n.vision) {
    for (const t of n.vision.texture) add(`vt:${t}`, 0.75);
    for (const t of n.vision.composition) add(`vc:${t}`, 0.75);
    for (const t of n.vision.keywords) add(`vk:${t}`, 0.5);
    add(`ve:${n.vision.energy}`, 0.25);
    add(`vb:${n.vision.bg}`, 0.25);
  }
  return bag;
}

const bags = nodes.map(bagOf);
const totals = bags.map((b) => [...b.values()].reduce((a, w) => a + w, 0));

function sim(i: number, j: number): number {
  const [small, large] = bags[i]!.size < bags[j]!.size ? [bags[i]!, bags[j]!] : [bags[j]!, bags[i]!];
  let inter = 0;
  for (const [key, w] of small) {
    const other = large.get(key);
    if (other !== undefined) inter += Math.min(w, other);
  }
  const union = totals[i]! + totals[j]! - inter;
  return union > 0 ? inter / union : 0;
}

const TOP_K = 4;
const MIN_SIM = 0.16;
const best = new Map<string, number>();
for (let i = 0; i < nodes.length; i++) {
  const scored: [number, number][] = [];
  for (let j = 0; j < nodes.length; j++) {
    if (i === j) continue;
    // Same-series links are implicit in the series/cluster grouping; edges
    // exist to surface the cross-series conversation.
    if (nodes[i]!.series && nodes[i]!.series === nodes[j]!.series) continue;
    const s = sim(i, j);
    if (s >= MIN_SIM) scored.push([j, s]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  for (const [j, s] of scored.slice(0, TOP_K)) {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    best.set(key, Math.max(best.get(key) ?? 0, s));
  }
}
const edges = [...best.entries()].map(([key, w]) => {
  const [i, j] = key.split('|').map(Number);
  return [nodes[i!]!.id, nodes[j!]!.id, Math.round(w * 1000) / 1000] as [string, string, number];
});

// ---------- write ----------

const data = {
  generatedAt: new Date().toISOString(),
  nodes,
  clusters,
  threads,
  insights,
  tagCounts: {
    concepts: countTags('concepts'),
    techniques: countTags('techniques'),
    forms: countTags('forms'),
  },
  edges,
};

writeFileSync(outPath, JSON.stringify(data));
console.log(
  `atlas.json: ${nodes.length} nodes, ${clusters.length} clusters, ${threads.length} threads, ` +
    `${insights.length} insights, ${edges.length} edges → ${outPath}`,
);
if (missingCode || missingVision) {
  console.warn(`missing records — code: ${missingCode}, vision: ${missingVision}`);
}
if (!clusterData) console.warn('no clusters.json — fell back to series-based clusters');
if (!taxonomy) console.warn('no taxonomy.json — tags left raw');
if (!insightData) console.warn('no insights.json — insights empty');
