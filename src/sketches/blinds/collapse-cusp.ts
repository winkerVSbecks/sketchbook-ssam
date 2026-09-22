import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, clamp, wrap as wrapN } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';
import { formatCss } from 'culori';
import { logColors } from '../../colors';
import {
  cuspPalette,
  describe,
  TIERS,
  type CuspPalette,
  type Gamut,
  type Ground,
} from '../../colors/cusphanger';

/**
 * collapse-cusp — fork of collapse, colored by cusphanger. The negative-space
 * layout is computed, then
 * gravity finishes it: every block slides cell-by-cell toward the centre
 * until it locks flush against its neighbours, and a seal pass — where
 * overlap is allowed — pulls each block over its nearer neighbours until
 * every lane of its span is in contact, so no gap survives anywhere in the
 * mass. The whole canvas is the palette's paper, so the pack sits directly on
 * the ground rather than on a shrink-wrapped plane.
 * The rects never move at runtime — only the clipped color panels slide.
 *
 * Color comes from cusphanger: the palette's tinted ground is the paper, and
 * every block's panels are drawn from one harmony hue — either its WCAG
 * contrast tiers (ink · accent · wash) or a window of its own cusp ramp.
 * Rendered in Display P3.
 */

type PhaseMode = 'uniform' | 'stagger' | 'group' | 'randomQuantized';
type PairingMode = 'tiers' | 'gradient' | 'chained' | 'pairs';
type AxisMode = 'narrow' | 'long' | 'vertical' | 'horizontal' | 'random';
type DirMode = 'uniform' | 'alternate' | 'random';

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BlindSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  group: number; // area rank: 0 = largest mass
  ordinal: number; // placement order
  groupSize: number;
  isStatic: boolean;
}

interface Blind extends BlindSpec {
  axis: 'x' | 'y';
  dir: 1 | -1;
  phase: number;
  colors: string[];
}

interface DebugField {
  dist: Int16Array;
  dMax: number;
  tx: number; // anchor, cell coords
  ty: number;
  cx: number; // achieved ink centroid, cell coords
  cy: number;
}

const config = {
  /** Degrees between neighbouring hues on cusphanger's ring. */
  angle: 48,
  /** Hues taken off the ring. */
  hueCount: 3,
  ground: 'random' as Ground | 'random',
  gamut: 'p3' as Gamut,
  saturation: 0.6,
  coolWarm: 0,
  pairing: 'tiers' as PairingMode,
  phase: 'group' as PhaseMode,
  axis: 'narrow' as AxisMode,
  dir: 'uniform' as DirMode,
  panels: 2,
  dwell: 0.5,
  phaseSteps: 4,
  bgTint: true,
  staticChance: 0.1,
  // layout
  res: Random.rangeFloor(16, 32),
  margin: 2,
  inkRatio: 0.32,
  maxRects: Random.pick([4, 6, 12, 18, 24]),
  candidates: 32,
  offCenter: Random.range(0, 0.6),
  voidWeight: Random.range(0, 2.0),
  topK: 3,
  minSide: 2,
  maxSide: 10,
  alignTouch: true,
  debug: false,
};

/* ---------------------------------- color --------------------------------- */

const cssOf = (c: { l: number; c: number; h: number }): string =>
  formatCss({ mode: 'oklch', l: c.l, c: c.c, h: c.h });

// Where in a hue's ramp the sliding panels live: on paper the darker half
// carries the contrast, on slate the lighter half does.
const rampWindow = (ground: Ground): [number, number] =>
  ground === 'light' ? [0.12, 0.62] : [0.42, 0.92];

// single color engine: cusphanger — a tinted ground plus contrast-tiered
// foregrounds on hues shuffled off a ring, clamped to the chosen gamut shell.
function generatePalette(): CuspPalette {
  return cuspPalette({
    angle: config.angle,
    count: config.hueCount,
    ground: config.ground === 'random' ? undefined : config.ground,
    gamut: config.gamut,
    saturation: config.saturation,
    coolWarm: config.coolWarm,
  });
}

/* ------------------------- negative-space layout --------------------------- */

// Multi-source BFS from every ink cell: dist = 0 on ink, grows into the void.
function distanceField(
  occ: Uint8Array,
  res: number,
): { dist: Int16Array; dMax: number } {
  const dist = new Int16Array(res * res).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < occ.length; i++) {
    if (occ[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  if (queue.length === 0) {
    dist.fill(res);
    return { dist, dMax: res };
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % res;
    const y = (i / res) | 0;
    const d = dist[i] + 1;
    if (x > 0 && dist[i - 1] < 0) ((dist[i - 1] = d), queue.push(i - 1));
    if (x < res - 1 && dist[i + 1] < 0) ((dist[i + 1] = d), queue.push(i + 1));
    if (y > 0 && dist[i - res] < 0) ((dist[i - res] = d), queue.push(i - res));
    if (y < res - 1 && dist[i + res] < 0)
      ((dist[i + res] = d), queue.push(i + res));
  }
  let dMax = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > dMax) dMax = dist[i];
  return { dist, dMax };
}

// Lower is better: penalize in-between emptiness (accidental gutters),
// reward depth of the largest void — but cap the reward so that once a
// void is deep enough there is no incentive to keep huddling the ink.
function voidScore(occ: Uint8Array, res: number): number {
  const { dist, dMax } = distanceField(occ, res);
  const farThresh = Math.max(2, Math.round(res * 0.2));
  let empty = 0;
  let mid = 0;
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    if (d <= 0) continue;
    empty++;
    if (d > 1 && d < farThresh) mid++;
  }
  const midFrac = empty > 0 ? mid / empty : 0;
  const depthCap = res * 0.3;
  return midFrac - Math.min(dMax, depthCap) / depthCap;
}

function sampleCell(
  res: number,
  margin: number,
  minSide: number,
  maxSide: number,
): CellRect | null {
  const inner = res - margin * 2;
  const thin = Math.max(minSide, Math.floor(maxSide / 3));
  const cls = Random.pick(['tall', 'wide', 'square']);
  let w: number, h: number;
  if (cls === 'tall') {
    w = Random.rangeFloor(minSide, thin + 1);
    h = Random.rangeFloor(Math.min(w * 2, maxSide), maxSide + 1);
  } else if (cls === 'wide') {
    h = Random.rangeFloor(minSide, thin + 1);
    w = Random.rangeFloor(Math.min(h * 2, maxSide), maxSide + 1);
  } else {
    w = Random.rangeFloor(minSide, maxSide + 1);
    h = w;
  }
  if (w > inner || h > inner) return null;
  const x = Random.rangeFloor(margin, res - margin - w + 1);
  const y = Random.rangeFloor(margin, res - margin - h + 1);
  return { x, y, w, h };
}

function overlaps(occ: Uint8Array, r: CellRect, res: number): boolean {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (occ[y * res + x]) return true;
  return false;
}

function mark(occ: Uint8Array, r: CellRect, res: number) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) occ[y * res + x] = 1;
}

// Rects abutting along an edge must share at least one flush perpendicular
// edge (tops/bottoms for side-by-side, lefts/rights for stacked) — no
// staggered seams. Corner-only contact and non-touching rects pass.
function touchAligned(a: CellRect, b: CellRect): boolean {
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const sideBySide = (a.x + a.w === b.x || b.x + b.w === a.x) && yOverlap > 0;
  const stacked = (a.y + a.h === b.y || b.y + b.h === a.y) && xOverlap > 0;
  if (sideBySide) return a.y === b.y || a.y + a.h === b.y + b.h;
  if (stacked) return a.x === b.x || a.x + a.w === b.x + b.w;
  return true;
}

const rectsOverlap = (a: CellRect, b: CellRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function tryMoveRect(
  out: CellRect[],
  i: number,
  dx: number,
  dy: number,
  res: number,
): boolean {
  const r = out[i];
  const c = { ...r, x: r.x + dx, y: r.y + dy };
  if (c.x < 0 || c.y < 0 || c.x + c.w > res || c.y + c.h > res) return false;
  for (let j = 0; j < out.length; j++)
    if (j !== i && rectsOverlap(c, out[j])) return false;
  out[i] = c;
  return true;
}

// Gravity toward the centre: in rounds (nearest rect first), each rect
// slides one cell along x and y toward res/2 if the space is free.
// Converges when nothing can move — every rect sits flush against a
// neighbour or the centre line, so the pack is gapless.
function collapseRects(rects: CellRect[], res: number): CellRect[] {
  const out = rects.map((r) => ({ ...r }));
  const cx = res / 2;
  const cy = res / 2;
  let moved = true;
  let rounds = 0;
  while (moved && rounds++ < res * 4) {
    moved = false;
    const order = out
      .map((r, i) => ({
        i,
        d: Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy),
      }))
      .sort((a, b) => a.d - b.d);
    for (const { i } of order) {
      const ddx = cx - (out[i].x + out[i].w / 2);
      const ddy = cy - (out[i].y + out[i].h / 2);
      if (Math.abs(ddx) > 0.5 && tryMoveRect(out, i, Math.sign(ddx), 0, res))
        moved = true;
      if (Math.abs(ddy) > 0.5 && tryMoveRect(out, i, 0, Math.sign(ddy), res))
        moved = true;
    }
  }
  sealGaps(out, res);
  return out;
}

// Slide rect i toward the centre along one axis by the LARGEST per-lane gap
// to the first block ahead in that lane. Lanes already in contact (touching
// or overlapping) contribute 0; lanes with nothing ahead are ignored. Moving
// by the max seals every lane's gap, overlapping the nearer blocks — which
// the collapse explicitly permits. Returns true if the rect moved.
function slideToContact(
  out: CellRect[],
  i: number,
  axis: 'x' | 'y',
  res: number,
): boolean {
  const r = out[i];
  const main = axis === 'x' ? r.x : r.y;
  const size = axis === 'x' ? r.w : r.h;
  const cross = axis === 'x' ? r.y : r.x;
  const crossSize = axis === 'x' ? r.h : r.w;
  const s = Math.sign(res / 2 - (main + size / 2));
  if (s === 0) return false;

  let d = 0;
  for (let lane = cross; lane < cross + crossSize; lane++) {
    let gap = Infinity;
    for (let j = 0; j < out.length; j++) {
      if (j === i) continue;
      const o = out[j];
      const oMain = axis === 'x' ? o.x : o.y;
      const oSize = axis === 'x' ? o.w : o.h;
      const oCross = axis === 'x' ? o.y : o.x;
      const oCrossSize = axis === 'x' ? o.h : o.w;
      if (lane < oCross || lane >= oCross + oCrossSize) continue;
      let g: number;
      if (oMain < main + size && main < oMain + oSize)
        g = 0; // in contact
      else if (s > 0 && oMain >= main + size) g = oMain - (main + size);
      else if (s < 0 && oMain + oSize <= main) g = main - (oMain + oSize);
      else continue; // behind the direction of travel
      if (g < gap) gap = g;
    }
    if (gap !== Infinity && gap > d) d = gap;
  }

  // never slide the rect's centre past the canvas centre
  d = Math.min(d, Math.floor(Math.abs(res / 2 - (main + size / 2))));
  if (d <= 0) return false;
  if (axis === 'x') r.x += s * d;
  else r.y += s * d;
  return true;
}

// Seal pass: the no-overlap gravity stops a rect at its FIRST contact, which
// leaves notches where the rest of its span still faces a gap. Working from
// the outside in, slide every rect to full-span contact until stable.
function sealGaps(out: CellRect[], res: number): void {
  const c = res / 2;
  let moved = true;
  let rounds = 0;
  while (moved && rounds++ < res * 4) {
    moved = false;
    const order = out
      .map((r, i) => ({
        i,
        d: Math.hypot(r.x + r.w / 2 - c, r.y + r.h / 2 - c),
      }))
      .sort((a, b) => b.d - a.d);
    for (const { i } of order) {
      if (slideToContact(out, i, 'x', res)) moved = true;
      if (slideToContact(out, i, 'y', res)) moved = true;
    }
  }
}

// Greedy placement: each step samples candidates and keeps the one that
// minimizes moment imbalance toward the anchor plus the void penalty.
function layoutNegativeSpace(
  width: number,
  height: number,
): { specs: BlindSpec[]; field: DebugField } {
  const res = config.res;
  const cw = width / res;
  const ch = height / res;
  const inner = res - config.margin * 2;
  const maxSide = clamp(config.maxSide, 1, inner);
  const minSide = clamp(config.minSide, 1, maxSide);

  const tx = res / 2 + Random.range(-1, 1) * config.offCenter * (res / 2);
  const ty = res / 2 + Random.range(-1, 1) * config.offCenter * (res / 2);

  const occ = new Uint8Array(res * res);
  const rects: CellRect[] = [];
  let sumW = 0;
  let sumWx = 0;
  let sumWy = 0;

  while (
    rects.length < config.maxRects &&
    sumW / (res * res) < config.inkRatio
  ) {
    const scored: Array<{ r: CellRect; score: number }> = [];
    for (let c = 0; c < config.candidates; c++) {
      const r = sampleCell(res, config.margin, minSide, maxSide);
      if (!r || overlaps(occ, r, res)) continue;
      if (config.alignTouch && rects.some((p) => !touchAligned(r, p))) continue;

      const w = r.w * r.h;
      const cx = (sumWx + w * (r.x + r.w / 2)) / (sumW + w);
      const cy = (sumWy + w * (r.y + r.h / 2)) / (sumW + w);
      const balanceErr = Math.hypot(cx - tx, cy - ty) / res;

      const trial = occ.slice();
      mark(trial, r, res);
      scored.push({
        r,
        score: balanceErr + config.voidWeight * voidScore(trial, res),
      });
    }
    if (scored.length === 0) break;
    // tournament: pick among the best few, not the strict argmin — breaks
    // the corner-touching staircase the pure greedy converges to
    scored.sort((a, b) => a.score - b.score);
    const r =
      scored[Random.rangeFloor(0, Math.min(config.topK, scored.length))].r;
    mark(occ, r, res);
    const w = r.w * r.h;
    sumW += w;
    sumWx += w * (r.x + r.w / 2);
    sumWy += w * (r.y + r.h / 2);
    rects.push(r);
  }

  const collapsed = collapseRects(rects, res);

  const ranked = rects
    .map((r, i) => ({ i, area: r.w * r.h }))
    .sort((a, b) => b.area - a.area);
  const rank: number[] = [];
  ranked.forEach(({ i }, k) => (rank[i] = k));

  const specs = collapsed.map((r, i) => ({
    x: r.x * cw,
    y: r.y * ch,
    w: r.w * cw,
    h: r.h * ch,
    group: rank[i],
    ordinal: i,
    groupSize: rects.length,
    isStatic: Random.chance(config.staticChance),
  }));

  // Debug field reflects the collapsed pack, not the scattered placement.
  occ.fill(0);
  let cWx = 0;
  let cWy = 0;
  collapsed.forEach((r) => {
    mark(occ, r, res);
    cWx += r.w * r.h * (r.x + r.w / 2);
    cWy += r.w * r.h * (r.y + r.h / 2);
  });
  const { dist, dMax } = distanceField(occ, res);
  const field: DebugField = {
    dist,
    dMax,
    tx,
    ty,
    cx: sumW > 0 ? cWx / sumW : res / 2,
    cy: sumW > 0 ? cWy / sumW : res / 2,
  };
  return { specs, field };
}

/* ------------------------------- strategies ------------------------------- */

function pickAxis(s: BlindSpec): 'x' | 'y' {
  switch (config.axis) {
    case 'narrow': // Jan 3: tall rects slide across their narrow width
      return s.h > s.w ? 'x' : 'y';
    case 'long':
      return s.h > s.w ? 'y' : 'x';
    case 'vertical':
      return 'y';
    case 'horizontal':
      return 'x';
    case 'random':
      return Random.boolean() ? 'x' : 'y';
  }
}

function pickDir(index: number): 1 | -1 {
  switch (config.dir) {
    case 'uniform':
      return 1;
    case 'alternate':
      return index % 2 === 0 ? 1 : -1;
    case 'random':
      return Random.boolean() ? 1 : -1;
  }
}

function pickPhase(
  s: BlindSpec,
  index: number,
  count: number,
  groupCount: number,
): number {
  switch (config.phase) {
    case 'uniform':
      return 0;
    case 'stagger': // December: wrap(t + i / (n - 1))
      return count > 1 ? index / (count - 1) : 0;
    case 'group': // by area rank: the big masses lead, the small answer
      return groupCount > 1 ? s.group / (groupCount - 1) : 0;
    case 'randomQuantized':
      return Random.rangeFloor(0, config.phaseSteps) / config.phaseSteps;
  }
}

function pickColors(s: BlindSpec, index: number, p: CuspPalette): string[] {
  const hue = s.group % p.hues.length;
  const panels = config.panels;
  switch (config.pairing) {
    case 'tiers': {
      // ink → accent → wash of one hue slide past each other; the starting
      // tier rotates with placement order so neighbours stay out of step
      const shift = s.ordinal % TIERS.length;
      return Array.from(
        { length: panels },
        (_, k) => p.tiers[TIERS[(shift + k) % TIERS.length]][hue].css,
      );
    }
    case 'gradient': {
      // one hue per mass rank, walking that hue's own cusp ramp
      const ramp = p.ramps[hue];
      const [lo, hi] = rampWindow(p.options.ground);
      const centre =
        s.groupSize > 1
          ? mapRange(s.ordinal, 0, s.groupSize - 1, lo, hi)
          : (lo + hi) / 2;
      const spread = (hi - lo) * 0.18;
      return Array.from({ length: panels }, (_, k) => {
        const u = clamp(
          centre +
            (panels > 1 ? mapRange(k, 0, panels - 1, -spread, spread) : 0),
          0,
          1,
        );
        return cssOf(ramp[Math.round(u * (ramp.length - 1))]);
      });
    }
    case 'chained':
      // Jan 12: each rect slides between its color and its neighbour's
      return Array.from(
        { length: panels },
        (_, k) => p.fg[(index + k) % p.fg.length].css,
      );
    case 'pairs': {
      const shuffled = Random.shuffle(p.fg.map((sw) => sw.css));
      return Array.from(
        { length: panels },
        (_, k) => shuffled[k % shuffled.length],
      );
    }
  }
}

/* --------------------------------- drawing -------------------------------- */

// Dwell-then-move: hold for `dwell` of each step, then slide one panel
// extent linearly. dwell 0 = continuous slide, dwell → 1 = hard steps.
function dwellSlide(t: number, steps: number, dwell: number): number {
  const total = t * steps;
  const i = Math.floor(total);
  const f = total - i;
  const move = Math.min(
    1,
    Math.max(0, (f - dwell) / Math.max(1e-6, 1 - dwell)),
  );
  return Math.min(i + move, steps);
}

function drawBlind(context: CanvasRenderingContext2D, b: Blind, t: number) {
  if (b.isStatic) {
    context.fillStyle = b.colors[0];
    context.fillRect(b.x, b.y, b.w, b.h);
    return;
  }

  context.save();
  context.beginPath();
  context.rect(b.x, b.y, b.w, b.h);
  context.clip();

  const extent = b.axis === 'x' ? b.w : b.h;
  const steps = b.colors.length;
  const local = wrapN(t + b.phase, 0, 1);
  const slide = dwellSlide(local, steps, config.dwell) * extent;

  for (let k = 0; k <= steps; k++) {
    context.fillStyle = b.colors[k % steps];
    const off = (k * extent - slide) * b.dir;
    if (b.axis === 'x') context.fillRect(b.x + off, b.y, b.w, b.h);
    else context.fillRect(b.x, b.y + off, b.w, b.h);
  }

  context.restore();
}

function drawDebug(
  context: CanvasRenderingContext2D,
  field: DebugField,
  width: number,
  height: number,
) {
  const res = config.res;
  const cw = width / res;
  const ch = height / res;

  for (let i = 0; i < field.dist.length; i++) {
    const d = field.dist[i];
    if (d <= 0) continue;
    const x = i % res;
    const y = (i / res) | 0;
    context.fillStyle = `rgba(0 0 0 / ${(0.25 * d) / field.dMax})`;
    context.fillRect(x * cw, y * ch, cw, ch);
  }

  const cross = (cx: number, cy: number, color: string) => {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cx - 12, cy);
    context.lineTo(cx + 12, cy);
    context.moveTo(cx, cy - 12);
    context.lineTo(cx, cy + 12);
    context.stroke();
  };
  cross(field.tx * cw, field.ty * ch, '#f00'); // anchor
  cross(field.cx * cw, field.cy * ch, '#00f'); // achieved centroid
}

/* ---------------------------------- pane ---------------------------------- */

const pane = new Pane() as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = '1';

const layoutFolder = pane.addFolder({ title: 'Layout' });
layoutFolder.addBinding(config, 'res', { min: 8, max: 48, step: 1 });
layoutFolder.addBinding(config, 'margin', { min: 0, max: 6, step: 1 });
layoutFolder.addBinding(config, 'inkRatio', { min: 0.1, max: 0.6, step: 0.02 });
layoutFolder.addBinding(config, 'maxRects', { min: 2, max: 24, step: 1 });
layoutFolder.addBinding(config, 'candidates', { min: 8, max: 96, step: 8 });
layoutFolder.addBinding(config, 'offCenter', { min: 0, max: 0.6, step: 0.05 });
layoutFolder.addBinding(config, 'voidWeight', { min: 0, max: 2, step: 0.1 });
layoutFolder.addBinding(config, 'topK', { min: 1, max: 8, step: 1 });
layoutFolder.addBinding(config, 'minSide', { min: 1, max: 24, step: 1 });
layoutFolder.addBinding(config, 'maxSide', { min: 1, max: 24, step: 1 });
layoutFolder.addBinding(config, 'alignTouch');
layoutFolder.addBinding(config, 'staticChance', {
  min: 0,
  max: 0.5,
  step: 0.05,
});
layoutFolder.addBinding(config, 'debug');

const motionFolder = pane.addFolder({ title: 'Motion' });
motionFolder.addBinding(config, 'phase', {
  options: {
    uniform: 'uniform',
    stagger: 'stagger',
    group: 'group',
    randomQuantized: 'randomQuantized',
  },
});
motionFolder.addBinding(config, 'axis', {
  options: {
    narrow: 'narrow',
    long: 'long',
    vertical: 'vertical',
    horizontal: 'horizontal',
    random: 'random',
  },
});
motionFolder.addBinding(config, 'dir', {
  options: { uniform: 'uniform', alternate: 'alternate', random: 'random' },
});
motionFolder.addBinding(config, 'panels', { min: 2, max: 4, step: 1 });
motionFolder.addBinding(config, 'dwell', { min: 0, max: 0.95, step: 0.05 });
motionFolder.addBinding(config, 'phaseSteps', { min: 2, max: 8, step: 1 });

const colorFolder = pane.addFolder({ title: 'Color' });
colorFolder.addBinding(config, 'angle', { min: 10, max: 180, step: 1 });
colorFolder.addBinding(config, 'hueCount', { min: 1, max: 6, step: 1 });
colorFolder.addBinding(config, 'ground', {
  options: { random: 'random', light: 'light', dark: 'dark' },
});
colorFolder.addBinding(config, 'gamut', {
  options: { p3: 'p3', srgb: 'srgb' },
});
colorFolder.addBinding(config, 'saturation', { min: 0, max: 1, step: 0.05 });
colorFolder.addBinding(config, 'coolWarm', { min: -1, max: 1, step: 0.05 });
colorFolder.addBinding(config, 'pairing', {
  options: {
    tiers: 'tiers',
    gradient: 'gradient',
    chained: 'chained',
    pairs: 'pairs',
  },
});
colorFolder.addBinding(config, 'bgTint');

const regenBtn = pane.addButton({ title: 'Regenerate' });

/* --------------------------------- sketch --------------------------------- */

interface Built {
  sig: string;
  bg: string; // the palette's ground — the paper the pack sits on
  blinds: Blind[];
  field: DebugField;
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let seed = Random.getRandomSeed();
  let logged = '';
  let built: Built | null = null;

  regenBtn.on('click', () => {
    seed = Random.getRandomSeed();
  });

  // Deterministic rebuild keyed on seed + config, so pane edits are live
  // and phases stay pure functions of playhead.
  const buildFrame = (): Built => {
    const sig = `${seed}:${JSON.stringify(config)}`;
    if (built && built.sig === sig) return built;

    Random.setSeed(seed);
    const palette = generatePalette();

    const logSig = `${seed}:${describe(palette)}`;
    if (logged !== logSig) {
      console.log('Seed:', seed);
      console.log('Palette:', describe(palette));
      logColors(palette.colors);
      logged = logSig;
    }

    const { specs, field } = layoutNegativeSpace(width, height);
    const groupCount = specs.length;
    const blinds: Blind[] = specs.map((s, i) => ({
      ...s,
      axis: pickAxis(s),
      dir: pickDir(i),
      phase: pickPhase(s, i, specs.length, groupCount),
      colors: pickColors(s, i, palette),
    }));

    const bg = palette.bg.css;

    built = { sig, bg, blinds, field };
    return built;
  };

  wrap.render = ({ playhead }: SketchProps) => {
    const frame = buildFrame();

    context.fillStyle = config.bgTint ? frame.bg : '#fff';
    context.fillRect(0, 0, width, height);

    frame.blinds.forEach((b) => drawBlind(context, b, playhead));

    if (config.debug) drawDebug(context, frame.field, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  attributes: { colorSpace: 'display-p3' },
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
