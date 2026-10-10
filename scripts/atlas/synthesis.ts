/**
 * The mechanical half of an Atlas refresh (the atlas-synthesis skill).
 *
 *   npx tsx scripts/atlas/synthesis.ts status   — what is stale: untagged ids,
 *       missing metrics, sketches in no cluster, thread/insight members that
 *       left the archive, and how old the synthesis is. Exit 1 when a gap
 *       would make assemble.ts invent placeholder clusters.
 *   npx tsx scripts/atlas/synthesis.ts digest   — a compact corpus digest
 *       (one line per sketch plus clusters, threads, colour systems and tag
 *       counts) for the agents writing threads and insights to read.
 *   npx tsx scripts/atlas/synthesis.ts format <file...> — re-serialise the
 *       synthesis files you rewrote in the layout each has at HEAD (indent,
 *       escaping, trailing newline) so the diff shows only real changes.
 *       Hand-laid files (taxonomy.json) are edited surgically instead.
 *
 * Reads the same inputs as assemble.ts; writes only under data/synthesis/
 * (format). Pure helpers are exported for scripts/atlas-synthesis-smoke.ts.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');
const dataDir = join(repoRoot, 'scripts/atlas/data');
const recordsDir = join(dataDir, 'records');
const synthesisDir = join(dataDir, 'synthesis');

type Archive = { sketches: { id: string; path: string; firstCommitDate: string }[] };
type Code = {
  id: string;
  description?: string;
  concepts?: string[];
  techniques?: string[];
  forms?: string[];
  medium?: string;
  motion?: string;
  palette?: string;
  system?: string | null;
};
type ClusterDef = { key: string; name: string; blurb?: string; members: string[] };
type ThreadDef = { key: string; name: string; note?: string; members: string[] };
type InsightDef = { kind: string; title: string; relatedIds: string[] };
export type Synthesis = {
  clusters: ClusterDef[];
  threads: ThreadDef[];
  insights: InsightDef[];
};

export type Gaps = {
  untaggedCode: string[];
  untaggedVision: string[];
  noMetrics: string[];
  unclustered: string[];
  /** cluster/thread/insight members that are no longer archived */
  departed: { where: string; id: string }[];
};

/** Every way the synthesis has fallen behind the archive. Pure. */
export function findGaps(
  archiveIds: string[],
  codeIds: Set<string>,
  visionIds: Set<string>,
  metricIds: Set<string>,
  syn: Synthesis,
): Gaps {
  const archived = new Set(archiveIds);
  const clustered = new Set(syn.clusters.flatMap((c) => c.members));
  const departed: Gaps['departed'] = [];
  for (const c of syn.clusters)
    for (const id of c.members)
      if (!archived.has(id)) departed.push({ where: `cluster ${c.key}`, id });
  for (const t of syn.threads)
    for (const id of t.members)
      if (!archived.has(id)) departed.push({ where: `thread ${t.key}`, id });
  syn.insights.forEach((ins, i) => {
    for (const id of ins.relatedIds)
      if (!archived.has(id)) departed.push({ where: `insight ${i} "${ins.title}"`, id });
  });
  return {
    untaggedCode: archiveIds.filter((id) => !codeIds.has(id)),
    untaggedVision: archiveIds.filter((id) => !visionIds.has(id)),
    noMetrics: archiveIds.filter((id) => !metricIds.has(id)),
    unclustered: archiveIds.filter((id) => !clustered.has(id)),
    departed,
  };
}

export type JsonStyle = { indent: number; escapeNonAscii: boolean; trailingNewline: boolean };

/** The layout a committed synthesis file already uses, so rewrites never churn it. */
export function detectJsonStyle(text: string): JsonStyle {
  const second = text.split('\n')[1] ?? '';
  const indent = second.length - second.trimStart().length || 2;
  const escapeNonAscii = /\\u[0-9a-fA-F]{4}/.test(text) && !/[\u007f-\uffff]/.test(text);
  return { indent, escapeNonAscii, trailingNewline: text.endsWith('\n') };
}

/** Serialise in a given layout (see detectJsonStyle). */
export function formatJson(value: unknown, style: JsonStyle): string {
  let out = JSON.stringify(value, null, style.indent);
  if (style.escapeNonAscii)
    out = out.replace(
      /[\u007f-\uffff]/g,
      (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  return style.trailingNewline ? `${out}\n` : out;
}

// ---------- io ----------

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

function loadRecords<T extends { id: string }>(prefix: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const f of readdirSync(recordsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()) {
    for (const r of readJson<T[]>(join(recordsDir, f))) map.set(r.id, r);
  }
  return map;
}

function loadSynthesis(): Synthesis {
  const c = readJson<{ clusters: ClusterDef[]; threads?: ThreadDef[] }>(
    join(synthesisDir, 'clusters.json'),
  );
  const i = readJson<{ insights: InsightDef[] }>(join(synthesisDir, 'insights.json'));
  return { clusters: c.clusters, threads: c.threads ?? [], insights: i.insights };
}

function status(): number {
  const archive = readJson<Archive>(join(repoRoot, 'archive-app/archive.json'));
  const ids = archive.sketches.map((s) => s.id);
  const code = loadRecords<Code>('code-');
  const vision = loadRecords<{ id: string }>('vision-');
  const metrics = readJson<Record<string, unknown>>(join(dataDir, 'visual-metrics.json'));
  const gaps = findGaps(
    ids,
    new Set(code.keys()),
    new Set(vision.keys()),
    new Set(Object.keys(metrics)),
    loadSynthesis(),
  );
  // insights.json carries its own generatedAt; older files fall back to the
  // last commit that touched them (mtime lies after a checkout).
  const insightsFile = join(synthesisDir, 'insights.json');
  const insightsAge =
    readJson<{ generatedAt?: string }>(insightsFile).generatedAt?.slice(0, 10) ??
    (spawnSync('git', ['log', '-1', '--format=%cs', '--', insightsFile], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim() ||
      statSync(insightsFile).mtime.toISOString().slice(0, 10));
  const newer = archive.sketches.filter((s) => s.firstCommitDate.slice(0, 10) > insightsAge).length;
  const list = (label: string, xs: string[]) =>
    console.log(`${label.padEnd(22)} ${xs.length}${xs.length ? `\n  ${xs.join('\n  ')}` : ''}`);

  console.log(`archive                ${ids.length} sketches`);
  list('no code record', gaps.untaggedCode);
  list('no vision record', gaps.untaggedVision);
  list('no colour metrics', gaps.noMetrics);
  list('in no cluster', gaps.unclustered);
  list(
    'departed members',
    gaps.departed.map((d) => `${d.id}  (${d.where})`),
  );
  console.log(`insights.json written  ${insightsAge} · ${newer} sketches started since`);
  const blocking = gaps.untaggedCode.length + gaps.untaggedVision.length + gaps.unclustered.length;
  if (blocking) console.log('\nNOT READY: assemble.ts would fall back to placeholder clusters.');
  return blocking ? 1 : 0;
}

function digest(): void {
  const archive = readJson<Archive>(join(repoRoot, 'archive-app/archive.json'));
  const atlas = readJson<{
    nodes: {
      id: string;
      created: string;
      cluster: string;
      seriesLabel: string | null;
      colorSystems: string[];
      concepts: string[];
      techniques: string[];
      forms: string[];
      medium: string;
      motion: string;
      palette: string;
      system: string | null;
      description: string;
    }[];
    clusters: { key: string; name: string; count: number }[];
    threads: { key: string; name: string; note: string; members: string[] }[];
    tagCounts: Record<string, [string, number][]>;
    colorSystems?: { key: string; name: string }[];
  }>(join(repoRoot, 'archive-app/atlas.json'));
  const out: string[] = [];
  out.push(`# Atlas corpus digest · ${archive.sketches.length} sketches`);
  out.push('', '## Clusters', ...atlas.clusters.map((c) => `- ${c.key} · ${c.name} · ${c.count}`));
  out.push(
    '',
    '## Threads (current)',
    ...atlas.threads.map((t) => `- ${t.key} · ${t.name} · ${t.members.length}: ${t.note}`),
  );
  const uses = new Map<string, number>();
  for (const n of atlas.nodes) for (const k of n.colorSystems) uses.set(k, (uses.get(k) ?? 0) + 1);
  out.push(
    '',
    '## Colour systems (src/colors, sketches importing)',
    ...(atlas.colorSystems ?? []).map((s) => `- ${s.key} · ${uses.get(s.key) ?? 0}`),
  );
  for (const field of ['concepts', 'techniques', 'forms'])
    out.push(
      '',
      `## ${field} (tag · count)`,
      (atlas.tagCounts[field] ?? []).map(([t, c]) => `${t} ${c}`).join(', '),
    );
  out.push(
    '',
    '## Sketches (created · id · cluster · series · medium/motion · engine · colours | concepts | techniques | forms — description)',
  );
  for (const n of [...atlas.nodes].sort((a, b) => a.created.localeCompare(b.created)))
    out.push(
      `${n.created} ${n.id} · ${n.cluster} · ${n.seriesLabel ?? '-'} · ${n.medium}/${n.motion} · ${
        n.system ?? '-'
      } · ${n.colorSystems.join('+') || n.palette} | ${n.concepts.join(',')} | ${n.techniques.join(
        ',',
      )} | ${n.forms.join(',')} — ${n.description}`,
    );
  console.log(out.join('\n'));
}

/** Re-serialise the named files in the layout each already had on disk (HEAD). */
function format(files: string[]): number {
  if (files.length === 0) {
    console.error('format needs the synthesis files you rewrote, e.g. format clusters.json');
    return 2;
  }
  for (const f of files) {
    const p = resolve(synthesisDir, f);
    const rel = `scripts/atlas/data/synthesis/${p.split('/').at(-1)}`;
    // The committed text is the style authority; a fresh file takes clusters.json's.
    const head = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: repoRoot, encoding: 'utf8' });
    const reference =
      head.status === 0 ? head.stdout : readFileSync(join(synthesisDir, 'clusters.json'), 'utf8');
    const now = readFileSync(p, 'utf8');
    const after = formatJson(JSON.parse(now), detectJsonStyle(reference));
    if (now !== after) {
      writeFileSync(p, after);
      console.log(`formatted ${rel}`);
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const cmd = process.argv[2];
  if (cmd === 'status') process.exit(status());
  else if (cmd === 'digest') digest();
  else if (cmd === 'format') process.exit(format(process.argv.slice(3)));
  else {
    console.error('usage: synthesis.ts status | digest | format <file...>');
    process.exit(2);
  }
}
