/**
 * Hand labels for the attribution pilot (`pilot-truth.json`): `{ name: sketch | null }`.
 * Irreplaceable, so every write goes through one module-level queue: two fast clicks are two
 * whole read-modify-write turns, never an interleaving that drops a label.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';

export type PilotTruth = Record<string, string | null>;

/** A missing file is empty; an unparseable one is `null`, so callers refuse to overwrite it. */
export async function readPilotTruth(path: string): Promise<PilotTruth | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The tail of every write queued so far; each write starts only when the last has settled. */
let writes: Promise<unknown> = Promise.resolve();

/** Set one label (sorted, written atomically). `false` when the file is unparseable. */
export function setPilotTruth(path: string, name: string, sketch: string | null): Promise<boolean> {
  const turn = writes.then(() => writeOne(path, name, sketch));
  // A failed write must not wedge the queue; its caller still sees the rejection.
  writes = turn.catch(() => {});
  return turn;
}

async function writeOne(path: string, name: string, sketch: string | null): Promise<boolean> {
  const truth = await readPilotTruth(path);
  if (!truth) return false;
  truth[name] = sketch;
  const sorted = Object.fromEntries(
    Object.entries(truth).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(sorted, null, 2));
  await rename(tmp, path);
  return true;
}
