/**
 * Node smoke test for `scripts/atlas/synthesis.ts` — the mechanical half of an
 * Atlas refresh (gap finding and layout-preserving JSON writes).
 * Run: `npx tsx scripts/atlas-synthesis-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { detectJsonStyle, findGaps, formatJson } from './atlas/synthesis';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('gaps');

test('every archived id missing a record, metrics or cluster is listed', () => {
  const gaps = findGaps(
    ['a', 'b', 'c'],
    new Set(['a', 'b']),
    new Set(['a']),
    new Set(['a', 'b', 'c']),
    { clusters: [{ key: 'k', name: 'K', members: ['a', 'b'] }], threads: [], insights: [] },
  );
  assert.deepEqual(gaps.untaggedCode, ['c']);
  assert.deepEqual(gaps.untaggedVision, ['b', 'c']);
  assert.deepEqual(gaps.noMetrics, []);
  assert.deepEqual(gaps.unclustered, ['c']);
});

test('members that left the archive are reported with where they were found', () => {
  const gaps = findGaps(['a'], new Set(['a']), new Set(['a']), new Set(['a']), {
    clusters: [{ key: 'k', name: 'K', members: ['a', 'gone'] }],
    threads: [{ key: 't', name: 'T', members: ['gone'] }],
    insights: [{ kind: 'bridge', title: 'X', relatedIds: ['a', 'gone'] }],
  });
  assert.deepEqual(
    gaps.departed.map((d) => d.where),
    ['cluster k', 'thread t', 'insight 0 "X"'],
  );
});

console.log('layout');

test('a style read from text round-trips that text exactly', () => {
  const value = { a: ['x — y'], b: { c: 1 } };
  for (const style of [
    { indent: 1, escapeNonAscii: true, trailingNewline: false },
    { indent: 2, escapeNonAscii: false, trailingNewline: true },
  ]) {
    const text = formatJson(value, style);
    assert.deepEqual(detectJsonStyle(text), style);
    assert.equal(formatJson(JSON.parse(text), detectJsonStyle(text)), text);
  }
});

test('the committed clusters.json is already in its own detected layout', () => {
  const text = readFileSync(
    join(import.meta.dirname, 'atlas/data/synthesis/clusters.json'),
    'utf8',
  );
  assert.equal(formatJson(JSON.parse(text), detectJsonStyle(text)), text);
});

console.log(`\n${passed} tests passed`);
