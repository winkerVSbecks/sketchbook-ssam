/**
 * Candidate shortlist for one output file: the ssam entry files it could have come from, drawn
 * from the export's prefix family, its git hash and the commits around its timestamp.
 */
import type { Parsed } from '../../archive-app/src/review/model.ts';
import { sketchIdOf, type Commit, type History } from './history.ts';

export const WINDOW_BEFORE_MS = 2 * 86_400_000;
export const WINDOW_AFTER_MS = 3 * 86_400_000;

export type Candidate = {
  id: string;
  /** HEAD path. */
  path: string;
  /** Path as it appeared in the commit that touched it. */
  pathAtExport: string;
  deleted: boolean;
};

export type Shortlist = {
  candidates: Candidate[];
  source: 'prefix' | 'hash' | 'window' | 'prefix+window' | 'hash+window' | 'none';
};

type Options = { withhold?: boolean };

const isSketchFile = (p: string): boolean => p.endsWith('.ts') && !p.includes('/_test/');

function makeCandidate(history: History, pathAtExport: string): Candidate {
  const path = history.current(pathAtExport);
  return { id: sketchIdOf(path), path, pathAtExport, deleted: !history.existsAtHead(path) };
}

/** Entry files touched by a commit; a helper-only change contributes its importers. */
function commitCandidates(history: History, commit: Commit): Candidate[] {
  const entries = history.entryFilesAt(commit.sha);
  const out: Candidate[] = [];
  for (const change of commit.changes) {
    if (change.status === 'D' || !isSketchFile(change.path)) continue;
    const paths = entries.has(change.path)
      ? [change.path]
      : history.importersAt(commit.sha, change.path).filter(isSketchFile);
    for (const p of paths) out.push(makeCandidate(history, p));
  }
  return out;
}

const byId = (list: Candidate[]): Candidate[] => {
  const map = new Map<string, Candidate>();
  for (const c of list) if (!map.has(c.id)) map.set(c.id, c);
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

function windowCandidates(history: History, ts: number): Candidate[] {
  const inRange = history.commits.filter(
    (c) => c.time >= ts - WINDOW_BEFORE_MS && c.time <= ts + WINDOW_AFTER_MS,
  );
  // Closest commit to the export first, so de-duplication keeps its pathAtExport.
  inRange.sort((a, b) => Math.abs(a.time - ts) - Math.abs(b.time - ts));
  return byId(inRange.flatMap((c) => commitCandidates(history, c)));
}

function intersect(base: Candidate[], other: Candidate[]): Candidate[] {
  const ids = new Set(other.map((c) => c.id));
  return base.filter((c) => ids.has(c.id));
}

export function shortlist(file: Parsed, history: History, opts: Options = {}): Shortlist {
  const win = file.ts === null ? [] : windowCandidates(history, file.ts);
  const hasTs = file.ts !== null;
  const result = (candidates: Candidate[], source: Shortlist['source']): Shortlist =>
    candidates.length ? { candidates, source } : { candidates: [], source: 'none' };

  if (!opts.withhold) {
    const { hash } = file;
    const commit = hash ? history.commits.find((c) => c.sha.startsWith(hash)) : undefined;
    const hashed = commit ? byId(commitCandidates(history, commit)) : [];
    const familyPaths = file.prefix ? history.prefixFamilies.get(file.prefix) : undefined;
    if (familyPaths?.size) {
      const family = byId(
        [...familyPaths].map((p) => {
          const c = makeCandidate(history, p);
          return { ...c, pathAtExport: c.path };
        }),
      );
      const narrow = intersect(family, hashed);
      const base = narrow.length ? narrow : family;
      const both = hasTs ? intersect(base, win) : [];
      return both.length ? { candidates: both, source: 'prefix+window' } : result(base, 'prefix');
    }
    if (hashed.length) {
      const both = hasTs ? intersect(hashed, win) : [];
      return both.length ? { candidates: both, source: 'hash+window' } : result(hashed, 'hash');
    }
  }
  return result(win, 'window');
}
