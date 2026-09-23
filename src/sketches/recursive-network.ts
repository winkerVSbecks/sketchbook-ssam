import { ssam } from "ssam";
import type { Sketch, SketchProps, SketchSettings } from "ssam";
import Random from "canvas-sketch-util/random";
import { Pane } from "tweakpane";
import { mapRange } from "canvas-sketch-util/math";
import {
  cuspPalette,
  describe,
  type Gamut,
  type Ground,
} from "../colors/cusphanger";
import { logColors } from "../colors";

// After Owen Schuh's compass notebooks.
//
// The whole figure grows out of one rule. A circle is subdivided into nodes.
// From then on each step joins two existing nodes with a bowed arc and
// subdivides it the same way: every division point gets a hollow circle,
// every resulting segment gets an arrowhead at its centre pointing the way the
// arc is travelled. Those division points are themselves nodes, so the network
// only ever feeds on what it has already drawn.
//
// Endpoints are picked with a bias toward nodes that are already busy, which
// is what collects the arcs into radiating hubs rather than an even web.

const config = {
  // ── the sheet ────────────────────────────────────────────────────────────
  /** Empty rolls a new seed each Regenerate; a string pins one. */
  seed: "",
  /** Seed circle radius, as a fraction of the shorter side. */
  radius: 0.28,
  /** How far from the centre anything may stray, in seed radii. */
  reach: 1.7,
  /** Degrees — where the seed circle's first division falls. 180 puts a
   * binary split on the horizontal diameter. */
  seedAngle: 180,
  /**
   * Extra halvings the seed circle gets over the arc rule. Each one doubles
   * its nodes: 0 cuts it like any arc, 1 twice as fine, 2 four times.
   */
  seedDetail: 2,
  /**
   * Share of the seed circle's segments that take an arrowhead. Grown arcs
   * are travelled and get one per segment; the seed was given, so only a few
   * of its segments are marked. 0 leaves it bare, 1 marks every segment.
   */
  seedArrowChance: 0.25,

  // ── growth ───────────────────────────────────────────────────────────────
  /** A ceiling, not a count: a step that cannot place an arc is skipped. */
  arcCount: 26,
  /** Tries per arc before the step is given up. */
  attempts: 300,
  /** Shortest chord an arc may span, in seed radii. */
  minChord: 0.3,
  /**
   * Compass openings, in seed radii — eighths, plus two wide settings. The
   * figure only ever uses these, so arcs fall into families that share a
   * curvature instead of each one bowing its own way. The steps either side
   * of 1 matter: they are the only openings whose long way round clears the
   * seed circle without flying off the sheet.
   */
  openings: [0.125, 0.25, 0.5, 0.625, 0.75, /* 0.875, 1, 1.125, 1.25, 1.5, 2, 3 */],
  /** How often the compass takes the long way round, throwing a lobe out. */
  majorChance: 0.35,
  /** Chance of the first of the two compass crossings; 0.5 is even-handed. */
  sideBalance: 0.5,
  /**
   * Exponent on node degree for preferential attachment. Raise it toward 1
   * and the figure bundles into one pole-to-pole pencil, since nested arcs on
   * one pair of nodes are the only ones that never cross; lower it to branch.
   */
  hubBias: 1.15,
  /** Added to degree before the exponent, so fresh nodes are still pickable. */
  degreeFloor: 1,
  /** How much a node's subdivision depth discounts its weight. */
  rankPenalty: 2,

  // ── what counts as two arcs touching ─────────────────────────────────────
  /** px — nearer than this along a stretch and two arcs are retracing. */
  overlapTolerance: 12,
  /** Share of an arc that must retrace another before it is rejected. */
  overlapShare: 0.5,
  /** Points sampled along a candidate when testing for a retrace. */
  overlapSamples: 16,
  /** px — how near a shared node a permitted meeting has to fall. */
  touchTolerance: 10,
  /** px — slack when deciding a computed meeting lies on a drawn sweep. */
  meetTolerance: 1,
  /** Points sampled along a candidate when testing it against `reach`. */
  reachSamples: 24,

  // ── subdivision ──────────────────────────────────────────────────────────
  /**
   * px — a segment shorter than this stops dividing and takes an arrow. Set
   * high enough that a long arc reads as `o ▷ o ◀ o`, the way the source
   * notates one, rather than a dense chain of marks.
   */
  minSegment: 300,
  maxDepth: 2,
  /** Otherwise a segment splits in two. */
  trisectChance: 0.26,
  /** Divisions deeper than this are notation only — they join no curve. */
  nodeDepth: 1,

  // ── the notation ─────────────────────────────────────────────────────────
  /**
   * One multiplier on every drawn line — arcs, seed circle, division circles,
   * arrowheads — so the whole figure can be inked heavier or finer without
   * retuning each weight below. The ruled ground is left alone.
   */
  weight: 1,
  /** px — every arrowhead is the same length, whatever its segment. */
  arrowSize: 6,
  /** Half-width of an arrowhead, as a share of its length. */
  arrowWing: 0.42,
  arrowWeight: 1,
  /** px — every division circle is the same radius. */
  circleSize: 2,
  circleWeight: 1.1,
  seedNodeSize: 2,
  seedNodeWeight: 1.3,
  /** Arc length mapped across this range gives the stroke its weight. */
  strokeLengthMin: 200,
  strokeLengthMax: 1400,
  strokeWeightMin: 0.9,
  strokeWeightMax: 1.5,

  // ── the ground ───────────────────────────────────────────────────────────
  showGrid: true,
  /** Fill the union of every arc's segment and the seed disc beneath the strokes. */
  showSilhouette: true,
  /**
   * Fill each grown arc against the stretch of the curve it springs from, so
   * every fill is a lune bounded by two arcs rather than an arc and its chord.
   */
  showFills: true,
  fillAlpha: 0.5,
  /** Grid squares across the sheet. */
  gridDivisions: 74,
  gridAlpha: 0.45,
  gridWeight: 0.6,

  // ── colour ───────────────────────────────────────────────────────────────
  /**
   * Degrees between neighbouring hues on cusphanger's ring. Small keeps the
   * families close cousins, 120 makes a triad, 180 a complement.
   */
  angle: 48,
  /** Hue families drawn off the ring — each arc belongs to one. */
  hueCount: 3,
  /** 'random' gives a light paper or a dark slate. */
  ground: "random" as Ground | "random",
  gamut: "p3" as Gamut,
};

/** The one knob that is not a number or a flag, so the pane takes it as text. */
const text = { openings: config.openings.join(", ") };

interface Family {
  ink: string; // ~9:1
  accent: string; // ~4.5:1
  wash: string; // ~1.6:1 — also the ruled ground
}

/** Rolled fresh by Regenerate; `config.seed` overrides it when set. */
let rollingSeed = Random.getRandomSeed();

let bg = "#ffffff";
let families: Family[] = [];
let rule = "#ffffff";

// One cusphanger palette: a tinted ground plus, per hue in the harmony, three
// swatches graded by contrast against it. Each hue is a *family* — an arc and
// everything drawn on it (its subdivision circles, its arrowheads) is coloured
// from one family, so a family reads as one drawing event rather than a colour.
// Every line is drawn in the family's ink and every fill in its wash, so a
// stroke always stands clear of the area it bounds.
const buildPalette = () => {
  const palette = cuspPalette({
    angle: config.angle,
    count: config.hueCount,
    ground: config.ground === "random" ? undefined : config.ground,
    gamut: config.gamut,
  });
  console.log(describe(palette));

  bg = palette.bg.css;
  families = palette.hues.map((_, i) => ({
    ink: palette.tiers.high[i].css,
    accent: palette.tiers.mid[i].css,
    wash: palette.tiers.low[i].css,
  }));
  rule = families[0].wash;

  logColors([bg, ...families.flatMap((f) => [f.ink, f.accent, f.wash])]);
};

/** Read the openings text back into the ladder, ignoring anything unparseable. */
const readOpenings = () => {
  const parsed = text.openings
    .split(",")
    .map((n) => parseFloat(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parsed.length > 0) config.openings = parsed;
};

/** Set by the sketch once it can rebuild; the pane only ever calls this. */
let requestRebuild: () => void = () => {};
/** Cheaper: the figure is unchanged, only its inking. */
let requestRedraw: () => void = () => {};

const pane = new Pane({ title: "recursive-network" }) as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = "1";

// Up top and out of any folder: the knob most worth reaching for.
const weightKnob = pane.addBinding(config, "weight", {
  label: "stroke weight",
  min: 0.25,
  max: 4,
  step: 0.05,
});
const fillKnob = pane.addBinding(config, "fillAlpha", {
  label: "fill alpha",
  min: 0,
  max: 1,
  step: 0.01,
});

const sheet = pane.addFolder({ title: "sheet", expanded: false });
sheet.addBinding(config, "seed");
sheet.addBinding(config, "radius", { min: 0.1, max: 0.45, step: 0.005 });
sheet.addBinding(config, "reach", { min: 1, max: 2.4, step: 0.05 });
sheet.addBinding(config, "seedAngle", { min: 0, max: 360, step: 15 });
sheet.addBinding(config, "seedDetail", { min: 0, max: 3, step: 1 });
sheet.addBinding(config, "seedArrowChance", { min: 0, max: 1, step: 0.05 });

const growth = pane.addFolder({ title: "growth", expanded: true });
growth.addBinding(config, "arcCount", { min: 1, max: 120, step: 1 });
growth.addBinding(config, "attempts", { min: 10, max: 2000, step: 10 });
growth.addBinding(config, "minChord", { min: 0, max: 1.5, step: 0.05 });
growth.addBinding(text, "openings", { label: "openings (×R)" });
growth.addBinding(config, "majorChance", { min: 0, max: 1, step: 0.05 });
growth.addBinding(config, "sideBalance", { min: 0, max: 1, step: 0.05 });
growth.addBinding(config, "hubBias", { min: 0, max: 2.5, step: 0.05 });
growth.addBinding(config, "degreeFloor", { min: 0.05, max: 3, step: 0.05 });
growth.addBinding(config, "rankPenalty", { min: 0, max: 4, step: 0.1 });

const touching = pane.addFolder({ title: "touching", expanded: false });
touching.addBinding(config, "overlapTolerance", { min: 0, max: 30, step: 0.5 });
touching.addBinding(config, "overlapShare", { min: 0, max: 1, step: 0.05 });
touching.addBinding(config, "overlapSamples", { min: 4, max: 64, step: 1 });
touching.addBinding(config, "touchTolerance", { min: 0, max: 20, step: 0.5 });
touching.addBinding(config, "meetTolerance", { min: 0, max: 10, step: 0.25 });
touching.addBinding(config, "reachSamples", { min: 4, max: 96, step: 1 });

const division = pane.addFolder({ title: "subdivision", expanded: false });
division.addBinding(config, "minSegment", { min: 8, max: 600, step: 1 });
division.addBinding(config, "maxDepth", { min: 0, max: 6, step: 1 });
division.addBinding(config, "trisectChance", { min: 0, max: 1, step: 0.02 });
division.addBinding(config, "nodeDepth", { min: 0, max: 4, step: 1 });

const notation = pane.addFolder({ title: "notation", expanded: false });
// Sizes are read at draw time, so like the weight they need no regrowth.
const liveKnobs = new Set([
  weightKnob,
  fillKnob,
  notation.addBinding(config, "arrowSize", { min: 1, max: 30, step: 0.5 }),
  notation.addBinding(config, "arrowWing", { min: 0.1, max: 1, step: 0.02 }),
  notation.addBinding(config, "arrowWeight", { min: 0, max: 4, step: 0.1 }),
  notation.addBinding(config, "circleSize", { min: 0.5, max: 16, step: 0.1 }),
  notation.addBinding(config, "circleWeight", { min: 0, max: 4, step: 0.1 }),
]);
notation.addBinding(config, "seedNodeSize", { min: 1, max: 16, step: 0.2 });
notation.addBinding(config, "seedNodeWeight", { min: 0, max: 4, step: 0.1 });
notation.addBinding(config, "strokeLengthMin", { min: 0, max: 2000, step: 10 });
notation.addBinding(config, "strokeLengthMax", { min: 0, max: 4000, step: 10 });
notation.addBinding(config, "strokeWeightMin", { min: 0, max: 5, step: 0.1 });
notation.addBinding(config, "strokeWeightMax", { min: 0, max: 6, step: 0.1 });

const groundFolder = pane.addFolder({ title: "ground", expanded: false });
groundFolder.addBinding(config, "showGrid");
groundFolder.addBinding(config, "showSilhouette");
groundFolder.addBinding(config, "showFills");
groundFolder.addBinding(config, "gridDivisions", { min: 4, max: 200, step: 1 });
groundFolder.addBinding(config, "gridAlpha", { min: 0, max: 1, step: 0.05 });
groundFolder.addBinding(config, "gridWeight", { min: 0, max: 3, step: 0.1 });

const colour = pane.addFolder({ title: "colour", expanded: false });
colour.addBinding(config, "angle", { min: 10, max: 180, step: 1 });
colour.addBinding(config, "hueCount", { min: 1, max: 6, step: 1 });
colour.addBinding(config, "ground", {
  options: { random: "random", light: "light", dark: "dark" },
});
colour.addBinding(config, "gamut", { options: { p3: "p3", srgb: "srgb" } });

pane.addButton({ title: "Regenerate" }).on("click", () => {
  rollingSeed = Random.getRandomSeed();
  // A pinned seed would make the button do nothing, so let go of it.
  config.seed = "";
  pane.refresh();
  requestRebuild();
});

// A rebuild runs the whole growth again, which is far too costly to do on
// every frame of a slider drag, so structural changes land when the drag
// settles. Checkboxes, lists and text fields report `last` at once.
//
// Inking knobs are the exception: they touch nothing structural, so they can
// follow the drag live.
pane.on("change", (ev: any) => {
  if (liveKnobs.has(ev.target)) {
    requestRedraw();
    return;
  }
  if (ev.last === false) return;
  requestRebuild();
});

const TAU = Math.PI * 2;

type Pt = [number, number];

interface Node {
  x: number;
  y: number;
  degree: number;
  rank: number; // 0 = seed, higher = born from a deeper subdivision
  /** Every curve this node sits on — what it can be joined to. */
  curves: number[];
}

/** A stretch of a circle, swept from a0 to a1 in whichever direction. */
interface Sweep {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
}

interface Arc extends Sweep {
  family: number;
  /** 0 = the seed circle, 1 = grown off it, 2 = grown off one of those… */
  generation: number;
  /** The circle this arc is part of. The seed's two semicircles share one. */
  curve: number;
  /**
   * The stretch of the parent curve between this arc's endpoints, travelled
   * from its end back to its start — with the arc itself it closes a lune.
   */
  lune?: Sweep;
}

interface Mark {
  family: number;
  /** Inherited from the arc the mark sits on. */
  generation: number;
  x: number;
  y: number;
}

type Marker =
  (Mark & { kind: "circle" }) | (Mark & { kind: "arrow"; angle: number });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wrap an angle difference into (-PI, PI]. */
const wrap = (d: number) => {
  let x = d;
  while (x <= -Math.PI) x += TAU;
  while (x > Math.PI) x -= TAU;
  return x;
};

/**
 * The arc from a to b struck with the compass set to `radius` — the centre is
 * where arcs of that radius swung from a and from b cross, which is the pair
 * of points a compass actually finds on paper. `side` picks which of the two
 * crossings to use; `major` keeps the long way round the circle instead of the
 * short one, which is how an arc swings clear of the figure it springs from.
 * Null when the opening is too small to span the chord.
 */
const compassArc = (
  a: Pt,
  b: Pt,
  radius: number,
  side: number,
  major: boolean,
  family: number,
  generation: number,
): Arc | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const chord = Math.hypot(dx, dy);
  const half = chord / 2;
  // A hair of tolerance: an opening set to exactly half the chord is a legal
  // semicircle, and the two rarely compare equal in floating point.
  if (radius < half - 1e-6) return null;

  const nx = -dy / chord;
  const ny = dx / chord;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;

  // How far off the chord's midpoint the two crossings sit.
  const offset = Math.sqrt(Math.max(0, radius * radius - half * half));
  const cx = mx + nx * side * offset;
  const cy = my + ny * side * offset;

  const a0 = Math.atan2(a[1] - cy, a[0] - cx);
  const a1 = Math.atan2(b[1] - cy, b[0] - cx);
  // The compass opened to exactly half the chord puts both crossings on the
  // midpoint, so there is only one centre and `side` has to choose the
  // semicircle instead.
  let sweep = offset < 1e-6 ? Math.PI * side : wrap(a1 - a0);
  // Same two points, same circle — the reflex remainder of it.
  if (major) sweep -= Math.sign(sweep) * TAU;

  return {
    family,
    generation,
    curve: -1,
    cx,
    cy,
    r: radius,
    a0,
    a1: a0 + sweep,
  };
};

const arcLength = (arc: Arc) => Math.abs(arc.a1 - arc.a0) * arc.r;

const pointOnArc = (arc: Sweep, t: number): Pt => {
  const a = lerp(arc.a0, arc.a1, t);
  return [arc.cx + Math.cos(a) * arc.r, arc.cy + Math.sin(a) * arc.r];
};

/** Unit tangent in the direction the arc is travelled. */
const tangentOnArc = (arc: Arc, t: number): Pt => {
  const a = lerp(arc.a0, arc.a1, t);
  const dir = Math.sign(arc.a1 - arc.a0);
  return [-Math.sin(a) * dir, Math.cos(a) * dir];
};

/**
 * Where the two arcs' full circles meet — nothing, one point when tangent, or
 * two. Identical and concentric circles return nothing; `retraces` handles
 * those, since they meet everywhere or nowhere.
 */
const circleMeetings = (a: Arc, b: Arc): Pt[] => {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [];
  if (d > a.r + b.r || d < Math.abs(a.r - b.r)) return [];

  const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  const mx = a.cx + (along * dx) / d;
  const my = a.cy + (along * dy) / d;
  const ox = (-dy / d) * across;
  const oy = (dx / d) * across;
  return across < 1e-9
    ? [[mx, my]]
    : [
        [mx + ox, my + oy],
        [mx - ox, my - oy],
      ];
};

/** Is this point on the drawn part of this arc, within tolerance? */
const isOnArc = (arc: Arc, x: number, y: number, tolerance: number) => {
  if (Math.abs(Math.hypot(x - arc.cx, y - arc.cy) - arc.r) > tolerance)
    return false;
  const sweep = arc.a1 - arc.a0;
  const along =
    Math.sign(sweep) * (Math.atan2(y - arc.cy, x - arc.cx) - arc.a0);
  return ((along % TAU) + TAU) % TAU <= Math.abs(sweep) + 1e-6;
};

/** How far along an arc's sweep a point on its circle sits, in radians. */
const sweepParam = (arc: Sweep, x: number, y: number) => {
  const span = Math.abs(arc.a1 - arc.a0);
  const dir = Math.sign(arc.a1 - arc.a0);
  const u = (((dir * (Math.atan2(y - arc.cy, x - arc.cx) - arc.a0)) % TAU) + TAU) % TAU;
  // An endpoint can land a hair past either end and wrap; snap it to the
  // nearer end. A full circle has no gap to wrap across.
  if (span < TAU - 1e-6 && u > span) return TAU - u < u - span ? 0 : span;
  return u;
};

/**
 * The stretch of `parent` that runs from b back to a. On an open arc there is
 * only one; on a closed circle there are two, and the one kept is the one that
 * hugs `arc` — its midpoint nearer the arc's — so the pair bound a lune rather
 * than the rest of the disc.
 */
const luneSection = (arc: Arc, parent: Arc, a: Pt, b: Pt): Sweep => {
  const dir = Math.sign(parent.a1 - parent.a0);
  const ua = sweepParam(parent, a[0], a[1]);
  const ub = sweepParam(parent, b[0], b[1]);
  const at = (u: number) => parent.a0 + dir * u;
  const direct: Sweep = { ...parent, a0: at(ub), a1: at(ua) };
  if (Math.abs(parent.a1 - parent.a0) < TAU - 1e-6) return direct;

  const around: Sweep = { ...parent, a0: at(ub), a1: at(ua < ub ? ua + TAU : ua - TAU) };
  const mid = pointOnArc(arc, 0.5);
  const gap = (s: Sweep) => {
    const [x, y] = pointOnArc(s, 0.5);
    return Math.hypot(x - mid[0], y - mid[1]);
  };
  return gap(direct) <= gap(around) ? direct : around;
};

/** Everything has to stay inside one circle — that is the whole composition. */
const withinReach = (arc: Arc, cx: number, cy: number, maxR: number) => {
  const samples = config.reachSamples;
  for (let i = 0; i <= samples; i++) {
    const [x, y] = pointOnArc(arc, i / samples);
    if (Math.hypot(x - cx, y - cy) > maxR) return false;
  }
  return true;
};

export const sketch = ({
  wrap: w,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => w.dispose());
    import.meta.hot.accept(() => w.hotReload());
  }
  import.meta.hot?.on("mcp:export", () => {
    props.exportFrame();
  });

  const cx = width / 2;
  const cy = height / 2;
  // Room is left for the lobes the major arcs throw outside the seed circle.
  const R = Math.min(width, height) * config.radius;

  /**
   * Everything the figure is, from the seed circle outward. Re-run whole on
   * any change, since a network this interdependent cannot be patched.
   */
  const build = () => {
    readOpenings();
    Random.setSeed(config.seed || rollingSeed);
    buildPalette();

    const nodes: Node[] = [];
    const arcs: Arc[] = [];
    const markers: Marker[] = [];

    // Nodes grouped by the curve they sit on. An arc may only join two nodes
    // that share one of these, so every arc is a chord of something already
    // drawn rather than a jump between unrelated parts of the figure.
    const curves: Node[][] = [];
    const newCurve = () => curves.push([]) - 1;

    const joinCurve = (node: Node, curve: number) => {
      if (node.curves.includes(curve)) return;
      node.curves.push(curve);
      curves[curve].push(node);
    };

    const addNode = (x: number, y: number, rank: number, curve: number) => {
      const node: Node = { x, y, degree: 0, rank, curves: [] };
      nodes.push(node);
      joinCurve(node, curve);
      return node;
    };

    /**
     * Would this arc meet one already drawn anywhere but at its own endpoints?
     * An arc is allowed to spring from the curve it spans and to land back on
     * it, and nothing else — no arc may cut across another.
     */
    const crosses = (candidate: Arc, ends: Pt[]) => {
      for (const arc of arcs) {
        for (const [x, y] of circleMeetings(candidate, arc)) {
          const tol = config.meetTolerance;
          if (!isOnArc(candidate, x, y, tol) || !isOnArc(arc, x, y, tol))
            continue;
          const atOwnEnd = ends.some(
            ([ex, ey]) => Math.hypot(ex - x, ey - y) < config.touchTolerance,
          );
          if (!atOwnEnd) return true;
        }
      }
      return false;
    };

    /**
     * Would this arc run along one already drawn? Endpoints are skipped — a new
     * arc always touches its parent there — so this catches an arc that retraces
     * a stretch of another, which the quantised openings make easy to hit.
     */
    const retraces = (candidate: Arc) => {
      const samples = config.overlapSamples;
      for (const arc of arcs) {
        let on = 0;
        for (let i = 1; i < samples; i++) {
          const [x, y] = pointOnArc(candidate, i / samples);
          if (isOnArc(arc, x, y, config.overlapTolerance)) on++;
        }
        if (on / (samples - 1) > config.overlapShare) return true;
      }
      return false;
    };

    /**
     * Split [t0, t1] into two or three, mark each division with a circle and
     * each resulting segment with an arrowhead at its centre. Stops once the
     * pieces get short, so long arcs end up as chains of markers and short ones
     * carry a single arrow.
     */
    interface Limits {
      minSegment: number;
      maxDepth: number;
      /** Chance a finished segment takes an arrowhead. */
      arrowChance: number;
    }

    const subdivide = (
      arc: Arc,
      t0: number,
      t1: number,
      depth: number,
      limits: Limits = { ...config, arrowChance: 1 },
    ) => {
      const len = arcLength(arc) * (t1 - t0);

      if (depth >= limits.maxDepth || len < limits.minSegment) {
        if (!Random.chance(limits.arrowChance)) return;
        const t = (t0 + t1) / 2;
        const [x, y] = pointOnArc(arc, t);
        const [tx, ty] = tangentOnArc(arc, t);
        markers.push({
          kind: "arrow",
          family: arc.family,
          generation: arc.generation,
          x,
          y,
          angle: Math.atan2(ty, tx),
        });
        return;
      }

      const parts = Random.chance(config.trisectChance) ? 3 : 2;
      for (let i = 0; i < parts; i++) {
        subdivide(
          arc,
          lerp(t0, t1, i / parts),
          lerp(t0, t1, (i + 1) / parts),
          depth + 1,
          limits,
        );
      }
      for (let i = 1; i < parts; i++) {
        const t = lerp(t0, t1, i / parts);
        const [x, y] = pointOnArc(arc, t);
        markers.push({
          kind: "circle",
          family: arc.family,
          generation: arc.generation,
          x,
          y,
        });
        // Only the coarser divisions join the network, so later arcs hang off
        // landmarks rather than off every speck of notation.
        if (depth <= config.nodeDepth) addNode(x, y, depth + 1, arc.curve);
      }
    };

    const attach = (arc: Arc, a: Node, b: Node, curve: number) => {
      arc.curve = curve;
      arcs.push(arc);
      joinCurve(a, curve);
      joinCurve(b, curve);
      a.degree++;
      b.degree++;
      subdivide(arc, 0, 1, 0);
    };

    // Seed: one circle, subdivided by the same rule as every arc after it.
    // Its division points are the first nodes; nothing on it is privileged.
    const seedCurve = newCurve();
    const start = (config.seedAngle * Math.PI) / 180;
    const circle: Arc = {
      family: 0,
      generation: 0,
      curve: seedCurve,
      cx,
      cy,
      r: R,
      a0: start,
      a1: start + TAU,
    };
    arcs.push(circle);
    // A closed curve has no endpoints, so its start is a division like the rest.
    addNode(cx + Math.cos(start) * R, cy + Math.sin(start) * R, 0, seedCurve);
    subdivide(circle, 0, 1, 0, {
      minSegment: config.minSegment / 2 ** config.seedDetail,
      maxDepth: config.maxDepth + config.seedDetail,
      arrowChance: config.seedArrowChance,
    });
    // Everything on the seed circle is the root generation.
    for (const n of nodes) n.rank = 0;

    // Preferential attachment: a node that already collects arcs collects more,
    // which is what gathers the figure into hubs instead of an even web.
    const weightOf = (n: Node) =>
      Math.pow(n.degree + config.degreeFloor, config.hubBias) /
      (1 + n.rank * config.rankPenalty);
    const pickFrom = (pool: Node[]) =>
      pool[Random.weighted(pool.map(weightOf))];

    for (let step = 0; step < config.arcCount; step++) {
      for (let attempt = 0; attempt < config.attempts; attempt++) {
        const a = pickFrom(nodes);
        // Both ends must sit on one curve, so pick a curve `a` is already on and
        // take the other end from that curve's own nodes.
        const parentCurve = Random.pick(a.curves);
        const shared = curves[parentCurve].filter((n) => n !== a);
        if (shared.length === 0) continue;
        const b = pickFrom(shared);
        // The new arc is one generation deeper than the curve it springs from.
        const parent = arcs.find((x) => x.curve === parentCurve);
        const generation = (parent?.generation ?? 0) + 1;

        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        if (chord < R * config.minChord) continue;

        // Only openings that can actually span this chord are available — a
        // short chord can take the tight settings, a long one needs a wide arm.
        const openings = config.openings
          .map((o) => o * R)
          .filter((radius) => radius >= chord / 2 - 1e-6);
        if (openings.length === 0) continue;

        const arc = compassArc(
          [a.x, a.y],
          [b.x, b.y],
          Random.pick(openings),
          Random.chance(config.sideBalance) ? 1 : -1,
          Random.chance(config.majorChance),
          Random.rangeFloor(0, families.length),
          generation,
        );
        if (!arc || !withinReach(arc, cx, cy, R * config.reach)) continue;
        if (retraces(arc)) continue;
        if (
          crosses(arc, [
            [a.x, a.y],
            [b.x, b.y],
          ])
        )
          continue;

        if (parent) arc.lune = luneSection(arc, parent, [a.x, a.y], [b.x, b.y]);
        attach(arc, a, b, newCurve());
        break;
      }
    }

    return { nodes, arcs, markers };
  };

  let scene = build();

  requestRebuild = () => {
    scene = build();
    props.render();
  };
  requestRedraw = () => props.render();

  const drawGrid = () => {
    const spacing = width / config.gridDivisions;
    context.save();
    // The wash tier is sized for fills; full-bleed it would out-shout the
    // drawing, so the ruling sits at half strength.
    context.globalAlpha = config.gridAlpha;
    context.strokeStyle = rule;
    context.lineWidth = config.gridWeight;
    context.beginPath();
    for (let x = spacing; x < width; x += spacing) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = spacing; y < height; y += spacing) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
    context.restore();
  };

  /**
   * The figure's silhouette: every arc closed by its chord (the seed circle
   * closes on itself, so it contributes its whole disc), all as one path so
   * the nonzero fill is a true union — overlaps don't double up. Each subpath
   * is traced anticlockwise so no two can cancel. Inked in the ruling's colour
   * at the ruling's strength, so it reads as a shadow of the same ground.
   */
  const drawSilhouette = () => {
    context.save();
    context.globalAlpha = config.gridAlpha / 4;
    context.fillStyle = rule;
    context.beginPath();
    for (const arc of scene.arcs) {
      const [a0, a1] = arc.a1 < arc.a0 ? [arc.a1, arc.a0] : [arc.a0, arc.a1];
      context.moveTo(
        arc.cx + Math.cos(a0) * arc.r,
        arc.cy + Math.sin(a0) * arc.r,
      );
      context.arc(arc.cx, arc.cy, arc.r, a0, a1, false);
      context.closePath();
    }
    context.fill("nonzero");
    context.restore();
  };

  /**
   * The seed disc, then each grown arc filled against the stretch of its
   * parent it spans: out along the arc, back along the parent. Filled one by one in the family's
   * wash, so nested lunes deepen where they stack.
   */
  const drawFills = () => {
    context.save();
    context.globalAlpha = config.fillAlpha;
    for (const arc of scene.arcs) {
      const lune = arc.lune;
      context.fillStyle = families[arc.family].wash;
      context.beginPath();
      context.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1, arc.a1 < arc.a0);
      // The seed circle closes on itself, so its fill is the whole disc.
      if (lune) context.arc(lune.cx, lune.cy, lune.r, lune.a0, lune.a1, lune.a1 < lune.a0);
      context.closePath();
      context.fill();
    }
    context.restore();
  };

  const drawCircle = (
    x: number,
    y: number,
    r: number,
    weight: number,
    ink: string,
  ) => {
    context.lineWidth = weight;
    context.beginPath();
    context.arc(x, y, r, 0, TAU);
    // Solid, like the arrowheads: the stroke only rounds out the dot.
    context.fillStyle = ink;
    context.fill();
    context.strokeStyle = ink;
    context.stroke();
  };

  const drawArrow = (
    x: number,
    y: number,
    size: number,
    angle: number,
    ink: string,
  ) => {
    const half = size / 2;
    const wing = size * config.arrowWing;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(half, 0);
    context.lineTo(-half, wing);
    context.lineTo(-half, -wing);
    context.closePath();
    context.fillStyle = ink;
    context.fill();
    context.lineWidth = config.weight * config.arrowWeight;
    context.strokeStyle = ink;
    context.stroke();
    context.restore();
  };

  w.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    if (config.showGrid) drawGrid();
    if (config.showSilhouette) drawSilhouette();
    if (config.showFills) drawFills();

    context.lineCap = "round";
    for (const arc of scene.arcs) {
      context.strokeStyle = families[arc.family].ink;
      // Longer arcs are the more structural ones — give them weight. The seed
      // circle takes the same rule; only its ink marks it as the origin.
      context.lineWidth =
        config.weight *
        mapRange(
          arcLength(arc),
          config.strokeLengthMin,
          config.strokeLengthMax,
          config.strokeWeightMin,
          config.strokeWeightMax,
          true,
        );
      context.beginPath();
      context.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1, arc.a1 < arc.a0);
      context.stroke();
    }

    for (const m of scene.markers) {
      const ink = families[m.family].ink;
      if (m.kind === "circle")
        drawCircle(
          m.x,
          m.y,
          config.circleSize,
          config.weight * config.circleWeight,
          ink,
        );
      else drawArrow(m.x, m.y, config.arrowSize, m.angle, ink);
    }

    // The two nodes the figure started from.
    for (const n of scene.nodes) {
      if (n.rank === 0)
        drawCircle(
          n.x,
          n.y,
          config.seedNodeSize,
          config.weight * config.seedNodeWeight,
          families[0].ink,
        );
    }
  };
};

export const settings: SketchSettings = {
  mode: "2d",
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  attributes: { colorSpace: "display-p3" },
};

ssam(sketch as Sketch<"2d">, settings);
