/**
 * Differential growth — one organism in continuous world coordinates.
 *
 * A closed (or open) polyline of nodes under three local rules, following the
 * differential-growth section of Jason Webb's morphogenesis-resources survey:
 *
 *   - attraction — each node is pulled toward its two curve neighbours,
 *   - repulsion  — and pushed off every node inside `repulsionRadius`,
 *   - alignment  — and eased toward the midpoint of those two neighbours.
 *
 * The curve is then resampled: edges longer than `maxEdgeLength` are split,
 * edges shorter than `minEdgeLength` collapse. Repulsion keeps stretching the
 * curve, subdivision keeps handing it new material, and the perimeter grows
 * faster than the area it can occupy — so it has to buckle. That is the trick.
 *
 * The module is renderer-agnostic (no imports from `src/tui`, no canvas) and
 * deterministic: the same seed and the same number of `step()` calls produce
 * identical node positions. Neighbour queries go through a spatial hash
 * rebuilt each step, never an O(n²) scan.
 */

export type GrowthNode = { x: number; y: number };
export type GrowthState = { nodes: GrowthNode[]; closed: boolean; step: number };
export type WorldRect = { x: number; y: number; w: number; h: number };

/**
 * Live simulation parameters. The object handed back by `createGrowth` is
 * mutable and re-read on every step, so UI controls can write straight into it.
 */
export interface GrowthParams {
  /** Pull toward each curve neighbour, as a fraction of the gap per step. */
  attraction: number;
  /** Push off nearby nodes, in world units per step at zero distance. */
  repulsion: number;
  /** Radius of the repulsion neighbourhood, in world units. */
  repulsionRadius: number;
  /** Ease toward the midpoint of the two curve neighbours (smoothing). */
  alignment: number;
  /** Edges longer than this are subdivided into equal parts. */
  maxEdgeLength: number;
  /** Edges shorter than this collapse. Used clamped to `maxEdgeLength / 2`. */
  minEdgeLength: number;
  /** Expected node injections per unit of `dt` (symmetry breaking). */
  injectionRate: number;
  /** Global multiplier on the displacement applied each step. */
  speed: number;
  /** Hard ceiling on the node count; subdivision and injection stop there. */
  maxNodes: number;
}

export interface GrowthOptions extends Partial<GrowthParams> {
  /** PRNG seed; the same seed always produces the same organism. */
  seed?: number;
  /** Closed loop (default) or open strand. */
  closed?: boolean;
  /** Centre of the seed ring / midpoint of the seed strand. */
  origin?: GrowthNode;
  /** Radius of the seed ring (half-length of the seed strand). */
  radius?: number;
  /** Nodes in the seed shape; defaults to the radius at mid-band spacing. */
  nodeCount?: number;
  /** Seeded radial noise on the seed shape; a perfect circle never buckles. */
  jitter?: number;
}

export interface Growth {
  /** Live state; the object identity is stable, `nodes` is replaced on resample. */
  readonly state: GrowthState;
  /** Live, mutable parameters — write to drive the simulation from controls. */
  readonly params: GrowthParams;
  /** The seed currently in force. */
  readonly seed: number;
  /** Advance the organism by `dt` steps (default 1). Returns `state`. */
  step(dt?: number): GrowthState;
  /** Restart from the seed shape, optionally with a new seed. Returns `state`. */
  reseed(seed?: number): GrowthState;
  /** Axis-aligned bounding box of the current nodes, in world units. */
  bounds(): WorldRect;
}

export const DEFAULT_GROWTH_PARAMS: GrowthParams = {
  attraction: 0.22,
  repulsion: 0.16,
  repulsionRadius: 0.9,
  alignment: 0.45,
  maxEdgeLength: 0.5,
  minEdgeLength: 0.2,
  injectionRate: 0.06,
  speed: 1,
  maxNodes: 20000,
};

/** A closed loop never collapses below this many nodes. */
const MIN_NODES = 6;
/** Injection samples this many random edges and splits the longest. */
const INJECTION_SAMPLES = 4;

const HASH_SPAN = 1 << 16;
const HASH_HALF = HASH_SPAN >> 1;

/** Unique integer key for a hash cell; far-flung cells clamp into the border. */
function cellKey(cx: number, cy: number): number {
  const a = Math.min(HASH_HALF - 1, Math.max(-HASH_HALF, cx)) + HASH_HALF;
  const b = Math.min(HASH_HALF - 1, Math.max(-HASH_HALF, cy)) + HASH_HALF;
  return a * HASH_SPAN + b;
}

/**
 * Uniform-grid spatial hash in CSR form: one `Map` of occupied cells plus flat
 * index arrays, rebuilt each step with no per-cell array allocation.
 */
class SpatialHash {
  private cell = 1;
  private slotOf = new Map<number, number>();
  private nodeSlot = new Int32Array(0);
  private items = new Int32Array(0);
  /** After `build`, `start[s]`..`end[s]` is slot `s`'s slice of `items`. */
  private start = new Int32Array(1);
  private end = new Int32Array(0);

  build(nodes: GrowthNode[], cell: number): void {
    const n = nodes.length;
    this.cell = cell;
    if (this.nodeSlot.length < n) {
      const cap = Math.max(16, n * 2);
      this.nodeSlot = new Int32Array(cap);
      this.items = new Int32Array(cap);
      this.start = new Int32Array(cap + 1);
      this.end = new Int32Array(cap);
    }
    this.slotOf.clear();
    let slots = 0;
    for (let i = 0; i < n; i++) {
      const key = cellKey(
        Math.floor(nodes[i].x / cell),
        Math.floor(nodes[i].y / cell),
      );
      let slot = this.slotOf.get(key);
      if (slot === undefined) {
        slot = slots++;
        this.slotOf.set(key, slot);
        this.end[slot] = 0;
      }
      this.nodeSlot[i] = slot;
      this.end[slot]++;
    }
    let run = 0;
    for (let s = 0; s < slots; s++) {
      this.start[s] = run;
      run += this.end[s];
      this.end[s] = this.start[s];
    }
    for (let i = 0; i < n; i++) this.items[this.end[this.nodeSlot[i]]++] = i;
  }

  /** Node indices in the 3×3 cell block around (x, y), written into `out`. */
  query(x: number, y: number, out: Int32Array): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let k = 0;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const slot = this.slotOf.get(cellKey(gx, gy));
        if (slot === undefined) continue;
        for (let p = this.start[slot]; p < this.end[slot]; p++) {
          out[k++] = this.items[p];
        }
      }
    }
    return k;
  }
}

export function createGrowth(options: GrowthOptions = {}): Growth {
  const params: GrowthParams = { ...DEFAULT_GROWTH_PARAMS };
  for (const key of Object.keys(DEFAULT_GROWTH_PARAMS) as (keyof GrowthParams)[]) {
    const given = options[key];
    if (typeof given === 'number' && Number.isFinite(given)) params[key] = given;
  }

  const origin: GrowthNode = { x: options.origin?.x ?? 0, y: options.origin?.y ?? 0 };
  const radius = options.radius ?? 2;
  const closed = options.closed ?? true;

  let seed = (options.seed ?? 1) >>> 0;
  let rngState = seed;
  /** mulberry32 — small, fast, and identical across runs. */
  const rnd = (): number => {
    let t = (rngState += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const hash = new SpatialHash();
  let velX = new Float64Array(0);
  let velY = new Float64Array(0);
  let scratch = new Int32Array(0);
  let injectAccum = 0;

  /** `minEdgeLength` is only honoured up to half of `maxEdgeLength`, or
   * subdivision and collapse would fight each other every step. */
  const band = (): [min: number, max: number] => {
    const max = Math.max(1e-6, params.maxEdgeLength);
    const min = Math.min(Math.max(0, params.minEdgeLength), max * 0.5);
    return [min, max];
  };

  function seedShape(): GrowthNode[] {
    const [min, max] = band();
    const spacing = (min + max) * 0.5;
    const span = closed ? 2 * Math.PI * radius : 2 * radius;
    const count = Math.max(
      closed ? MIN_NODES : 2,
      Math.round(options.nodeCount ?? span / spacing),
    );
    const jitter = options.jitter ?? min * 0.5;
    const nodes: GrowthNode[] = [];
    for (let i = 0; i < count; i++) {
      const j = (rnd() * 2 - 1) * jitter;
      if (closed) {
        const a = (i / count) * Math.PI * 2;
        nodes.push({
          x: origin.x + Math.cos(a) * (radius + j),
          y: origin.y + Math.sin(a) * (radius + j),
        });
      } else {
        const t = count === 1 ? 0.5 : i / (count - 1);
        nodes.push({
          x: origin.x + (t - 0.5) * 2 * radius,
          y: origin.y + j,
        });
      }
    }
    return nodes;
  }

  const state: GrowthState = { nodes: seedShape(), closed, step: 0 };

  function ensureScratch(n: number): void {
    if (velX.length >= n) return;
    const cap = Math.max(16, n * 2);
    velX = new Float64Array(cap);
    velY = new Float64Array(cap);
    scratch = new Int32Array(cap);
  }

  /** Accumulate attraction + alignment + repulsion into `velX`/`velY`. */
  function accumulateForces(min: number): void {
    const nodes = state.nodes;
    const n = nodes.length;
    const radiusR = Math.max(1e-6, params.repulsionRadius);
    const r2 = radiusR * radiusR;
    const att = params.attraction;
    const ali = params.alignment;
    const rep = params.repulsion;
    hash.build(nodes, radiusR);
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      let fx = 0;
      let fy = 0;
      const hasPrev = state.closed || i > 0;
      const hasNext = state.closed || i < n - 1;
      const pi = i === 0 ? n - 1 : i - 1;
      const ni = i === n - 1 ? 0 : i + 1;
      if (hasPrev) {
        const p = nodes[pi];
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        if (dx * dx + dy * dy > min * min) {
          fx += dx * att;
          fy += dy * att;
        }
      }
      if (hasNext) {
        const q = nodes[ni];
        const dx = q.x - a.x;
        const dy = q.y - a.y;
        if (dx * dx + dy * dy > min * min) {
          fx += dx * att;
          fy += dy * att;
        }
      }
      if (hasPrev && hasNext) {
        const p = nodes[pi];
        const q = nodes[ni];
        fx += ((p.x + q.x) * 0.5 - a.x) * ali;
        fy += ((p.y + q.y) * 0.5 - a.y) * ali;
      }
      const found = hash.query(a.x, a.y, scratch);
      for (let k = 0; k < found; k++) {
        const j = scratch[k];
        if (j === i) continue;
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 >= r2) continue;
        const d = Math.sqrt(d2);
        const s = ((radiusR - d) / radiusR) * rep / d;
        fx += dx * s;
        fy += dy * s;
      }
      velX[i] = fx;
      velY[i] = fy;
    }
  }

  /** Move every node, capping the per-step displacement so it cannot explode. */
  function integrate(dt: number, max: number): void {
    const nodes = state.nodes;
    const limit = max * 0.5;
    const s = Math.max(0, params.speed) * dt;
    for (let i = 0; i < nodes.length; i++) {
      let dx = velX[i] * s;
      let dy = velY[i] * s;
      const d = Math.hypot(dx, dy);
      if (d > limit) {
        const k = limit / d;
        dx *= k;
        dy *= k;
      }
      nodes[i].x += dx;
      nodes[i].y += dy;
    }
  }

  /**
   * Split a random long edge, nudged off the line so the new material has a
   * direction to buckle in. Sampling the longest of a few candidates keeps the
   * new nodes clear of the collapse threshold.
   */
  function inject(min: number, cap: number): void {
    const nodes = state.nodes;
    const n = nodes.length;
    if (n < 3 || n >= cap) return;
    const edges = state.closed ? n : n - 1;
    if (edges < 1) return;
    let best = -1;
    let bestLen = -1;
    for (let t = 0; t < INJECTION_SAMPLES; t++) {
      const i = Math.min(edges - 1, Math.floor(rnd() * edges));
      const a = nodes[i];
      const b = nodes[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    }
    if (best < 0 || bestLen < 2 * min) return;
    const a = nodes[best];
    const b = nodes[(best + 1) % n];
    const off = (rnd() * 2 - 1) * min * 0.25;
    nodes.splice(best + 1, 0, {
      x: (a.x + b.x) * 0.5 - ((b.y - a.y) / bestLen) * off,
      y: (a.y + b.y) * 0.5 + ((b.x - a.x) / bestLen) * off,
    });
  }

  /**
   * Append `node`, first collapsing a too-short gap or filling a too-long one.
   * `after` is how many source nodes still follow, so the collapse can keep the
   * curve above `MIN_NODES` without letting the first few nodes skip the check.
   */
  function appendResampled(
    out: GrowthNode[],
    node: GrowthNode,
    min: number,
    max: number,
    cap: number,
    after: number,
  ): void {
    const last = out[out.length - 1];
    const dx = node.x - last.x;
    const dy = node.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < min && out.length + after >= MIN_NODES) return;
    // Room left before the projected final length (what is written, this node,
    // and everything still to come) would pass the cap.
    const room = cap - (out.length + after + 1);
    if (d > max && room > 0) {
      const parts = Math.min(Math.ceil(d / max), room + 1);
      for (let k = 1; k < parts; k++) {
        out.push({ x: last.x + (dx * k) / parts, y: last.y + (dy * k) / parts });
      }
    }
    out.push(node);
  }

  /** Rebuild the node list so every edge length lands inside [min, max]. */
  function resample(min: number, max: number, cap: number): void {
    const src = state.nodes;
    if (src.length < 2) return;
    const out: GrowthNode[] = [src[0]];
    for (let i = 1; i < src.length; i++) {
      appendResampled(out, src[i], min, max, cap, src.length - i - 1);
    }
    if (state.closed && out.length >= 3) {
      const first = out[0];
      let d = Math.hypot(first.x - out[out.length - 1].x, first.y - out[out.length - 1].y);
      while (d < min && out.length > MIN_NODES) {
        out.pop();
        d = Math.hypot(first.x - out[out.length - 1].x, first.y - out[out.length - 1].y);
      }
      const room = cap - out.length;
      if (d > max && room > 0) {
        const last = out[out.length - 1];
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        const parts = Math.min(Math.ceil(d / max), room + 1);
        for (let k = 1; k < parts; k++) {
          out.push({ x: last.x + (dx * k) / parts, y: last.y + (dy * k) / parts });
        }
      }
    }
    state.nodes = out;
  }

  function step(dt = 1): GrowthState {
    const n = state.nodes.length;
    if (n < 2 || !(dt > 0)) return state;
    const [min, max] = band();
    const cap = Math.max(MIN_NODES + 2, Math.floor(params.maxNodes));
    ensureScratch(n);
    accumulateForces(min);
    integrate(dt, max);
    injectAccum += Math.max(0, params.injectionRate) * dt;
    while (injectAccum >= 1) {
      injectAccum -= 1;
      inject(min, cap);
    }
    resample(min, max, cap);
    state.step += 1;
    return state;
  }

  function reseed(next?: number): GrowthState {
    if (next !== undefined) seed = next >>> 0;
    rngState = seed;
    injectAccum = 0;
    state.nodes = seedShape();
    state.step = 0;
    return state;
  }

  function bounds(): WorldRect {
    const nodes = state.nodes;
    if (nodes.length === 0) return { x: origin.x, y: origin.y, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  return {
    state,
    params,
    get seed() {
      return seed;
    },
    step,
    reseed,
    bounds,
  };
}

/** Summed edge length of a state, wrapping when the curve is closed. */
export function perimeter(state: GrowthState): number {
  const { nodes } = state;
  const n = nodes.length;
  if (n < 2) return 0;
  let total = 0;
  const last = state.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
