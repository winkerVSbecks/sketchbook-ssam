/**
 * Git-history model for output → sketch attribution: which sketch files existed, were edited or
 * renamed around an export, which of them were ssam entry files, and which export prefixes each
 * file has ever set. Pure parsing helpers are exported for the smoke suite.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export type ChangeStatus = 'A' | 'M' | 'R' | 'D';

export type FileChange = { status: ChangeStatus; path: string; from?: string };

export type Commit = {
  sha: string;
  /** Commit time, epoch ms. */
  time: number;
  changes: FileChange[];
};

export type History = {
  /** Ascending by time. */
  commits: Commit[];
  /** Forward-resolves a historical path to its newest path. */
  current: (path: string) => string;
  existsAtHead: (path: string) => boolean;
  entryFilesAt: (sha: string) => Set<string>;
  importersAt: (sha: string, helperPath: string) => string[];
  /** Export prefix (without trailing `-`) → HEAD paths of the files that ever set it. */
  prefixFamilies: Map<string, Set<string>>;
};

const MAX_BUFFER = 64 * 1024 * 1024;
// POSIX classes: git grep -E has no \b or \s on macOS. Equivalent to /\bssam\s*\(\s*sketch\b/.
const ENTRY_RE = '(^|[^[:alnum:]_])ssam[[:space:]]*\\([[:space:]]*sketch([^[:alnum:]_]|$)';
const PREFIX_RE = /prefix:\s*['"`]([^'"`]+)['"`]/g;
const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]/g;

/** Parse `git log -M --name-status --format=@%H %ct -- src/sketches`. */
export function parseGitLog(text: string): Commit[] {
  const commits: Commit[] = [];
  let cur: Commit | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('@')) {
      const [sha = '', ct = '0'] = line.slice(1).trim().split(/\s+/);
      cur = { sha, time: Number(ct) * 1000, changes: [] };
      commits.push(cur);
      continue;
    }
    if (!cur || !line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0]?.[0];
    if ((code === 'R' || code === 'C') && parts.length >= 3) {
      cur.changes.push({ status: 'R', from: parts[1] as string, path: parts[2] as string });
    } else if ((code === 'A' || code === 'M' || code === 'D') && parts[1]) {
      cur.changes.push({ status: code, path: parts[1] });
    }
  }
  return commits;
}

/** Follow rename chains (in the given commit order) to the newest path. */
export function forwardRenames(commits: Commit[]): (path: string) => string {
  const alias = new Map<string, string>();
  for (const commit of commits) {
    for (const c of commit.changes) {
      if (c.status !== 'R' || !c.from) continue;
      for (const [k, v] of alias) if (v === c.from) alias.set(k, c.path);
      alias.set(c.from, c.path);
      // The new name is live again, so it no longer forwards anywhere.
      alias.delete(c.path);
    }
  }
  return (p) => alias.get(p) ?? p;
}

/** `src/sketches/x/y.ts` → `sketches/x/y`. */
export function sketchIdOf(p: string): string {
  return p.replace(/^src\//, '').replace(/\.ts$/, '');
}

/** Resolve a relative import specifier from a file; null for bare package specifiers. */
export function resolveImport(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.posix.join(path.posix.dirname(fromPath), specifier);
  return /\.[a-z]+$/i.test(path.posix.basename(resolved)) ? resolved : `${resolved}.ts`;
}

function git(repoRoot: string, args: string[], okExit1 = false): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    if (okExit1 && (err as { status?: number }).status === 1) return '';
    throw err;
  }
}

function gitShow(repoRoot: string, sha: string, file: string): string | null {
  try {
    return git(repoRoot, ['show', `${sha}:${file}`]);
  } catch {
    return null;
  }
}

/** `git grep -l` at a commit, `<sha>:` stripped, `_test` excluded. */
function grepFiles(repoRoot: string, sha: string, args: string[]): string[] {
  const out = git(repoRoot, ['grep', '-l', ...args, sha, '--', 'src/sketches'], true);
  const prefix = `${sha}:`;
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
    .filter((p) => !p.includes('/_test/'));
}

export function loadHistory(repoRoot: string): History {
  const log = git(repoRoot, [
    'log',
    '-M',
    '--name-status',
    '--format=@%H %ct',
    '--',
    'src/sketches',
  ]);
  const commits = parseGitLog(log).sort((a, b) => a.time - b.time);
  const current = forwardRenames(commits);
  const existsAtHead = (p: string): boolean => existsSync(path.join(repoRoot, p));

  const entryCache = new Map<string, Set<string>>();
  const entryFilesAt = (sha: string): Set<string> => {
    let hit = entryCache.get(sha);
    if (!hit) {
      hit = new Set(grepFiles(repoRoot, sha, ['-E', ENTRY_RE]));
      entryCache.set(sha, hit);
    }
    return hit;
  };

  const importersAt = (sha: string, helperPath: string): string[] => {
    const base = path.posix.basename(helperPath).replace(/\.ts$/, '');
    const entries = entryFilesAt(sha);
    const out: string[] = [];
    for (const file of grepFiles(repoRoot, sha, [base])) {
      if (!entries.has(file)) continue;
      const src = gitShow(repoRoot, sha, file);
      if (src === null) continue;
      const hit = [...src.matchAll(IMPORT_RE)].some(
        (m) => resolveImport(file, m[1] as string) === helperPath,
      );
      if (hit) out.push(file);
    }
    return out;
  };

  const prefixFamilies = new Map<string, Set<string>>();
  const prefixLog = git(repoRoot, [
    'log',
    '-G',
    'prefix:',
    '--format=@%H',
    '--name-only',
    '--',
    'src/sketches',
  ]);
  let sha = '';
  for (const line of prefixLog.split('\n')) {
    if (line.startsWith('@')) {
      sha = line.slice(1).trim();
      continue;
    }
    const file = line.trim();
    if (!file || !sha || !file.endsWith('.ts')) continue;
    const src = gitShow(repoRoot, sha, file);
    if (src === null) continue;
    for (const m of src.matchAll(PREFIX_RE)) {
      const key = (m[1] as string).replace(/-$/, '');
      const set = prefixFamilies.get(key) ?? new Set<string>();
      set.add(current(file));
      prefixFamilies.set(key, set);
    }
  }

  return { commits, current, existsAtHead, entryFilesAt, importersAt, prefixFamilies };
}
