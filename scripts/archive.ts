#!/usr/bin/env tsx
/**
 * archive — render every ssam sketch, upload PNGs to Cloudinary, and emit a
 * static archive site at ./archive grouped by year.
 *
 * Usage:
 *   npm run archive                      # incremental: only render git-changed + new sketches
 *   npm run archive -- --only <pattern>  # restrict to sketches matching substring
 *   npm run archive -- --force           # ignore cache, re-render everything
 *   npm run archive -- --site-only       # skip rendering/uploading, only regen HTML
 *   npm run archive -- --dry-run         # print plan, change nothing
 */

import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import type { Archive, SketchEntry, CloudinaryRef } from './archive-types.ts';
import { renderHtml, renderCss } from './archive-render-html.ts';

const PROJECT_ROOT = process.cwd();
const SKETCHES_DIR = join(PROJECT_ROOT, 'src', 'sketches');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');
const ARCHIVE_DIR = join(PROJECT_ROOT, 'archive');
const ARCHIVE_JSON = join(ARCHIVE_DIR, 'archive.json');
const ARCHIVE_HTML = join(ARCHIVE_DIR, 'index.html');
const ARCHIVE_CSS = join(ARCHIVE_DIR, 'style.css');
const EXCLUDE_DIRS = new Set(['_test']);

type Flags = {
  force: boolean;
  siteOnly: boolean;
  dryRun: boolean;
  only: string | null;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { force: false, siteOnly: false, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') flags.force = true;
    else if (arg === '--site-only') flags.siteOnly = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--only') flags.only = argv[++i] ?? null;
    else if (arg.startsWith('--only=')) flags.only = arg.slice('--only='.length);
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (flags.only) flags.only = flags.only.replace(/\.ts$/, '').replace(/^src\//, '');
  return flags;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(join(dir, entry.name));
    }
  }
}

function discoverSketches(): { absPath: string; id: string; relPath: string }[] {
  const all: string[] = [];
  walk(SKETCHES_DIR, all);
  const entries: { absPath: string; id: string; relPath: string }[] = [];
  for (const absPath of all) {
    const src = readFileSync(absPath, 'utf8');
    if (!/\bssam\s*\(\s*sketch\b/.test(src)) continue;
    const relFromSrc = relative(join(PROJECT_ROOT, 'src'), absPath).replace(/\.ts$/, '');
    const relFromRoot = relative(PROJECT_ROOT, absPath);
    entries.push({ absPath, id: relFromSrc, relPath: relFromRoot });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function gitFirstCommitDate(relPath: string): string | null {
  try {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', relPath],
      { encoding: 'utf8', cwd: PROJECT_ROOT },
    ).trim();
    const lines = out.split('\n').filter(Boolean);
    return lines[lines.length - 1] ?? null;
  } catch {
    return null;
  }
}

function gitLastCommitSha(relPath: string): string | null {
  try {
    const sha = execFileSync(
      'git',
      ['log', '-1', '--follow', '--format=%H', '--', relPath],
      { encoding: 'utf8', cwd: PROJECT_ROOT },
    ).trim();
    return sha || null;
  } catch {
    return null;
  }
}

function loadArchive(): Archive {
  if (!existsSync(ARCHIVE_JSON)) {
    return { generatedAt: new Date().toISOString(), sketches: [] };
  }
  return JSON.parse(readFileSync(ARCHIVE_JSON, 'utf8')) as Archive;
}

function saveArchive(archive: Archive): void {
  archive.generatedAt = new Date().toISOString();
  archive.sketches.sort((a, b) => a.id.localeCompare(b.id));
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeFileSync(ARCHIVE_JSON, JSON.stringify(archive, null, 2) + '\n');
}

function renderSketch(sketchId: string): string {
  const beforeMs = Date.now() - 1000;
  const result = spawnSync('npx', ['tsx', 'scripts/cloud-render.ts', sketchId], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `cloud-render failed for ${sketchId}:\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );
  }
  const lines = result.stdout.trim().split('\n');
  let filename = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]) as { filename?: string };
      if (parsed.filename) {
        filename = parsed.filename;
        break;
      }
    } catch {
      /* try previous line */
    }
  }
  if (!filename) {
    throw new Error(`cloud-render emitted no filename for ${sketchId}:\n${result.stdout}`);
  }

  const direct = filename.startsWith('/')
    ? filename
    : filename.startsWith('output/')
    ? join(PROJECT_ROOT, filename)
    : join(OUTPUT_DIR, filename);
  if (existsSync(direct)) return direct;

  const newest = findNewestMatchingPng(beforeMs);
  if (!newest) {
    throw new Error(
      `cloud-render reported ${filename} but no PNG was found in ${OUTPUT_DIR}`,
    );
  }
  return newest;
}

function findNewestMatchingPng(afterMs: number): string | null {
  if (!existsSync(OUTPUT_DIR)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (!name.endsWith('.png')) continue;
    const p = join(OUTPUT_DIR, name);
    const mtime = statSync(p).mtimeMs;
    if (mtime < afterMs) continue;
    if (!best || mtime > best.mtime) best = { path: p, mtime };
  }
  return best?.path ?? null;
}

function slugify(id: string): string {
  return id.replace(/^sketches\//, '').replace(/[^a-zA-Z0-9-]+/g, '-');
}

async function uploadToCloudinary(
  pngPath: string,
  sketchId: string,
  year: number,
): Promise<CloudinaryRef> {
  const slug = slugify(sketchId);
  const publicId = `sketchbook/${year}/${slug}`;
  const result = await cloudinary.uploader.upload(pngPath, {
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    invalidate: true,
  });
  return {
    publicId,
    url: result.secure_url,
    version: result.version,
    width: result.width,
    height: result.height,
  };
}

function stopVite(): void {
  spawnSync('npx', ['tsx', 'scripts/cloud-render.ts', 'stop'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
}

function writeSite(archive: Archive): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeFileSync(ARCHIVE_HTML, renderHtml(archive));
  writeFileSync(ARCHIVE_CSS, renderCss());
}

function assertCloudinaryConfigured(): void {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error(
      'CLOUDINARY_URL not set. Create a .env file at the repo root with:\n' +
        '  CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>\n' +
        '(find these at Cloudinary Console → Settings → API Keys)',
    );
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const archive = loadArchive();
  const byId = new Map(archive.sketches.map((s) => [s.id, s]));

  if (flags.siteOnly) {
    writeSite(archive);
    saveArchive(archive);
    log(`site-only: wrote ${ARCHIVE_HTML} from ${archive.sketches.length} entries`);
    return;
  }

  const discovered = discoverSketches();
  log(`discovered ${discovered.length} sketch entry points`);

  const plan: { entry: typeof discovered[number]; reason: string }[] = [];
  for (const entry of discovered) {
    if (flags.only && !matchOnly(entry.id, flags.only)) continue;
    const existing = byId.get(entry.id);
    const currentSha = gitLastCommitSha(entry.relPath);
    if (flags.force) {
      plan.push({ entry, reason: 'forced' });
    } else if (!existing || !existing.cloudinary) {
      plan.push({ entry, reason: existing ? 'no cloudinary url' : 'new' });
    } else if (currentSha && existing.lastCommitSha !== currentSha) {
      plan.push({ entry, reason: `sha changed ${existing.lastCommitSha.slice(0, 7)} → ${currentSha.slice(0, 7)}` });
    } else if (!currentSha) {
      plan.push({ entry, reason: 'untracked / no git sha' });
    }
  }

  log(`${plan.length} sketches to render` + (flags.only ? ` (filter: --only ${flags.only})` : ''));

  if (flags.dryRun) {
    for (const { entry, reason } of plan) {
      log(`  [dry-run] ${entry.id}  (${reason})`);
    }
    return;
  }

  if (plan.length > 0) {
    assertCloudinaryConfigured();
  }

  let done = 0;
  for (const { entry, reason } of plan) {
    done++;
    log(`[${done}/${plan.length}] ${entry.id}  (${reason})`);
    try {
      const firstDate = gitFirstCommitDate(entry.relPath) ?? new Date().toISOString();
      const year = Number(firstDate.slice(0, 4));
      const sha = gitLastCommitSha(entry.relPath) ?? '';

      const pngPath = renderSketch(entry.id);
      const cloud = await uploadToCloudinary(pngPath, entry.id, year);

      const name = entry.id.split('/').pop() ?? entry.id;
      const updated: SketchEntry = {
        id: entry.id,
        name,
        path: entry.relPath,
        firstCommitDate: firstDate,
        year,
        lastCommitSha: sha,
        archivedAt: new Date().toISOString(),
        cloudinary: cloud,
      };
      const idx = archive.sketches.findIndex((s) => s.id === entry.id);
      if (idx >= 0) archive.sketches[idx] = updated;
      else archive.sketches.push(updated);

      saveArchive(archive);
      writeSite(archive);
      log(`  ✓ uploaded ${cloud.url}`);
    } catch (err) {
      log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (plan.length > 0) {
    stopVite();
  }

  saveArchive(archive);
  writeSite(archive);
  log(`done: ${archive.sketches.length} archived total; site → ${ARCHIVE_HTML}`);
}

function log(msg: string): void {
  process.stdout.write(`[archive] ${msg}\n`);
}

function matchOnly(id: string, pattern: string): boolean {
  if (id === pattern) return true;
  if (id.endsWith('/' + pattern)) return true;
  if (pattern.includes('/')) return false;
  return id.includes(pattern);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[archive] ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
