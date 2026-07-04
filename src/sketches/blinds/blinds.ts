import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, clamp, wrap as wrapN } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import type { PaletteType, PaletteStyle } from 'pro-color-harmonies';
import { logColors } from '../../colors';

/**
 * blinds — clipped-window primitive (from rybitten-blinds, fibonacci-blinds,
 * pro-color-shift) on a single negative-space layout.
 *
 * The rects never move: each is a fixed, clipped window with color panels
 * sliding through it. Layout is one system: grid-quantized rects placed
 * greedily, scored by moment balance toward a seeded anchor plus a
 * distance-field term that rewards one deep void and a bimodal near/far
 * emptiness — whitespace as intent, not leftover.
 */

type PhaseMode = 'uniform' | 'stagger' | 'group' | 'randomQuantized';
type PairingMode = 'gradient' | 'chained' | 'pairs';
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
  harmony: 'random' as PaletteType | 'random',
  style: 'random' as PaletteStyle | 'random',
  pairing: 'gradient' as PairingMode,
  phase: 'group' as PhaseMode,
  axis: 'narrow' as AxisMode,
  dir: 'uniform' as DirMode,
  panels: 2,
  dwell: 0.5,
  phaseSteps: 4,
  bgTint: true,
  staticChance: 0.1,
  // layout
  res: 24,
  margin: 2,
  inkRatio: 0.32,
  maxRects: 12,
  candidates: 32,
  offCenter: 0.25,
  voidWeight: 1.0,
  topK: 3,
  minSide: 2,
  maxSide: 10,
  debug: false,
};

/* ---------------------------------- color --------------------------------- */

const shade = (color: string, dl: number): string => {
  const c = oklch(color);
  if (!c) return color;
  return formatCss({ ...c, mode: 'oklch', l: clamp(c.l + dl, 0.08, 0.93) });
};

const HARMONIES: PaletteType[] = [
  'analogous',
  'complementary',
  'triadic',
  'tetradic',
  'splitComplementary',
  'tintsShades',
];
const STYLES: PaletteStyle[] = ['default', 'square', 'triangle', 'circle', 'diamond'];

// single color engine: pro-color-harmonies from a seeded oklch base color
function generatePalette(): string[] {
  const harmony =
    config.harmony === 'random' ? Random.pick(HARMONIES) : config.harmony;
  const style = config.style === 'random' ? Random.pick(STYLES) : config.style;
  return ColorPaletteGenerator.generate(
    {
      l: Random.range(0.4, 0.8),
      c: Random.range(0.1, 0.4),
      h: Random.range(0, 360),
    },
    harmony,
    {
      style,
      modifiers: {
        sine: Random.range(-1, 1),
        wave: Random.range(-1, 1),
        zap: Random.range(-1, 1),
        block: Random.range(-1, 1),
      },
    }
  ).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));
}

/* ------------------------- negative-space layout --------------------------- */

// Multi-source BFS from every ink cell: dist = 0 on ink, grows into the void.
function distanceField(
  occ: Uint8Array,
  res: number
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
    if (x > 0 && dist[i - 1] < 0) (dist[i - 1] = d), queue.push(i - 1);
    if (x < res - 1 && dist[i + 1] < 0) (dist[i + 1] = d), queue.push(i + 1);
    if (y > 0 && dist[i - res] < 0) (dist[i - res] = d), queue.push(i - res);
    if (y < res - 1 && dist[i + res] < 0) (dist[i + res] = d), queue.push(i + res);
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
  maxSide: number
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

// Greedy placement: each step samples candidates and keeps the one that
// minimizes moment imbalance toward the anchor plus the void penalty.
function layoutNegativeSpace(
  width: number,
  height: number
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

  while (rects.length < config.maxRects && sumW / (res * res) < config.inkRatio) {
    const scored: Array<{ r: CellRect; score: number }> = [];
    for (let c = 0; c < config.candidates; c++) {
      const r = sampleCell(res, config.margin, minSide, maxSide);
      if (!r || overlaps(occ, r, res)) continue;

      const w = r.w * r.h;
      const cx = (sumWx + w * (r.x + r.w / 2)) / (sumW + w);
      const cy = (sumWy + w * (r.y + r.h / 2)) / (sumW + w);
      const balanceErr = Math.hypot(cx - tx, cy - ty) / res;

      const trial = occ.slice();
      mark(trial, r, res);
      scored.push({ r, score: balanceErr + config.voidWeight * voidScore(trial, res) });
    }
    if (scored.length === 0) break;
    // tournament: pick among the best few, not the strict argmin — breaks
    // the corner-touching staircase the pure greedy converges to
    scored.sort((a, b) => a.score - b.score);
    const r = scored[Random.rangeFloor(0, Math.min(config.topK, scored.length))].r;
    mark(occ, r, res);
    const w = r.w * r.h;
    sumW += w;
    sumWx += w * (r.x + r.w / 2);
    sumWy += w * (r.y + r.h / 2);
    rects.push(r);
  }

  const ranked = rects
    .map((r, i) => ({ i, area: r.w * r.h }))
    .sort((a, b) => b.area - a.area);
  const rank: number[] = [];
  ranked.forEach(({ i }, k) => (rank[i] = k));

  const specs = rects.map((r, i) => ({
    x: r.x * cw,
    y: r.y * ch,
    w: r.w * cw,
    h: r.h * ch,
    group: rank[i],
    ordinal: i,
    groupSize: rects.length,
    isStatic: Random.chance(config.staticChance),
  }));

  const { dist, dMax } = distanceField(occ, res);
  const field: DebugField = {
    dist,
    dMax,
    tx,
    ty,
    cx: sumW > 0 ? sumWx / sumW : res / 2,
    cy: sumW > 0 ? sumWy / sumW : res / 2,
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
  groupCount: number
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

function pickColors(s: BlindSpec, index: number, palette: string[]): string[] {
  const n = palette.length;
  switch (config.pairing) {
    case 'gradient': {
      // one hue per mass rank, lightness ramped by placement order
      const base = palette[s.group % n];
      const ramp =
        s.groupSize > 1 ? mapRange(s.ordinal, 0, s.groupSize - 1, 0.12, -0.12) : 0;
      return Array.from({ length: config.panels }, (_, k) =>
        shade(base, ramp + mapRange(k, 0, config.panels - 1, 0.05, -0.05))
      );
    }
    case 'chained':
      // Jan 12: each rect slides between its color and its neighbour's
      return Array.from(
        { length: config.panels },
        (_, k) => palette[(index + k) % n]
      );
    case 'pairs': {
      const shuffled = Random.shuffle(palette);
      return Array.from({ length: config.panels }, (_, k) => shuffled[k % n]);
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
  const move = Math.min(1, Math.max(0, (f - dwell) / Math.max(1e-6, 1 - dwell)));
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
  height: number
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
layoutFolder.addBinding(config, 'staticChance', { min: 0, max: 0.5, step: 0.05 });
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
colorFolder.addBinding(config, 'harmony', {
  options: {
    random: 'random',
    analogous: 'analogous',
    complementary: 'complementary',
    triadic: 'triadic',
    tetradic: 'tetradic',
    splitComplementary: 'splitComplementary',
    tintsShades: 'tintsShades',
  },
});
colorFolder.addBinding(config, 'style', {
  options: {
    random: 'random',
    default: 'default',
    square: 'square',
    triangle: 'triangle',
    circle: 'circle',
    diamond: 'diamond',
  },
});
colorFolder.addBinding(config, 'pairing', {
  options: { gradient: 'gradient', chained: 'chained', pairs: 'pairs' },
});
colorFolder.addBinding(config, 'bgTint');

const regenBtn = pane.addButton({ title: 'Regenerate' });

/* --------------------------------- sketch --------------------------------- */

interface Built {
  sig: string;
  bg: string;
  blinds: Blind[];
  field: DebugField;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
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

    const logSig = `${seed}:${config.harmony}:${config.style}`;
    if (logged !== logSig) {
      console.log('Seed:', seed);
      logColors(palette);
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

    const bg = config.bgTint
      ? `oklch(from ${palette[0]} 0.96 calc(c * 0.2) h)`
      : '#fff';

    built = { sig, bg, blinds, field };
    return built;
  };

  wrap.render = ({ playhead }: SketchProps) => {
    const frame = buildFrame();

    context.fillStyle = frame.bg;
    context.fillRect(0, 0, width, height);

    frame.blinds.forEach((b) => drawBlind(context, b, playhead));

    if (config.debug) drawDebug(context, frame.field, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
