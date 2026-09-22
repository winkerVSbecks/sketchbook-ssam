import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, formatCss } from 'culori';
import { Pane } from 'tweakpane';
import { logColors } from '../../colors';
import {
  cuspPalette,
  describe,
  type CuspPalette,
  type Gamut,
  type Ground,
  type Tier,
} from '../../colors/cusphanger';

/**
 * haberdashery-cusp — haberdashery coloured by cusphanger. The palette's
 * tinted ground replaces the flat black; the pegs are shaded across one WCAG
 * contrast tier of the ring hues (noise picks where on the hue sweep each
 * peg lands) and the band takes another, so pegs and band sit at different
 * contrast distances from the ground. No bevel: pegs are flat discs and the
 * band is a solid stripe in one tier with thin parallel lines in another
 * running along it — true offset curves of the band (convex pegs grow,
 * concave pegs shrink, tangents stay parallel), not a fat stroke — so the
 * tiers alone carry the depth. The band is stroked as one segment per arc
 * and one per tangent, each a solid stripe under its lines, so wherever it
 * crosses itself — including a near-full wrap of a single peg, where the
 * inner lines' departing tangent cuts across the outer lines' arc — the later
 * segment's stripe covers the earlier one. The order starts and ends half-way
 * along a tangent nothing else comes near, so the loop's one z-order break
 * never lands on a contact.
 */

interface Vec2 {
  x: number;
  y: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}
type Role = 'convex' | 'concave' | 'floater';
interface ContactPeg {
  circle: Circle;
  role: 'convex' | 'concave';
}
interface RenderCircle {
  circle: Circle;
  color: string;
}
/**
 * One stroke of the band: either a peg's arc or the tangent on to the next peg.
 * Arcs and tangents are separate strokes so that where the band wraps a peg
 * almost fully the departing tangent's stripe covers the arc's outer lines it
 * has to cut through, instead of hatching over them.
 */
interface BandSegment {
  path: Path2D;
  /** Path length from the band's start to this segment's start, for dash continuity. */
  start: number;
}

/**
 * How far (px) each band stroke is extended past both ends so neighbours
 * overlap instead of abutting: two butt caps sharing an anti-aliased edge let
 * a hairline of ground through. Extensions run along the stroke's own
 * direction, which is also the neighbour's direction at a C1 join, so they
 * stay inside the neighbour's footprint.
 */
const SEAM_OVERLAP = 0.5;

const config = {
  count: 16,
  dentCount: 4,
  minR: 20,
  maxR: 160,
  spread: 0.75,
  /** Overall width of the band: the outer lines sit at ±strokeWidth/2. */
  strokeWidth: 40,
  /** Number of parallel lines the band is drawn with. */
  bandLines: 8,
  /** Width of each band line. */
  lineWidth: 2,
  dotRadius: 7,
  /** Spacing between a peg's concentric rings. */
  ringGap: 8,
  relaxIterations: 24,
  hullFill: false,
  showPegs: true,
  /** Drop every peg the settled band doesn't touch; the floaters only shaped the layout. */
  onlyContacts: true,
  dashLength: 200,
  gapLength: 4,
  loops: 2,
  /** Degrees between neighbouring hues on cusphanger's ring. */
  angle: 48,
  /** Hues taken off the ring. */
  hueCount: 3,
  ground: 'random' as Ground | 'random',
  gamut: 'p3' as Gamut,
  saturation: 0.6,
  coolWarm: 0,
  /** Contrast tier the pegs are shaded across. */
  pegTier: 'mid' as Tier,
  /** Contrast tier the band's solid stripe takes. */
  stripeTier: 'high' as Tier,
  /** Contrast tier the lines along the band (and hull fill) take. */
  bandTier: 'low' as Tier,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'dentCount', { min: 0, max: 60, step: 1 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'spread', { min: 0.3, max: 1.0, step: 0.01 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 100, step: 0.1 });
pane.addBinding(config, 'bandLines', { min: 1, max: 12, step: 1 });
pane.addBinding(config, 'lineWidth', { min: 0.5, max: 4, step: 0.25 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 30, step: 0.5 });
pane.addBinding(config, 'ringGap', { min: 2, max: 40, step: 0.5 });
pane.addBinding(config, 'relaxIterations', { min: 0, max: 24, step: 1 });
pane.addBinding(config, 'hullFill');
pane.addBinding(config, 'showPegs');
pane.addBinding(config, 'onlyContacts');
pane.addBinding(config, 'dashLength', { min: 1, max: 200, step: 1 });
pane.addBinding(config, 'gapLength', { min: 1, max: 200, step: 1 });
pane.addBinding(config, 'loops', { min: 1, max: 20, step: 1 });

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
const tierOptions = { high: 'high', mid: 'mid', low: 'low' };
colorFolder.addBinding(config, 'pegTier', { options: tierOptions });
colorFolder.addBinding(config, 'stripeTier', { options: tierOptions });
colorFolder.addBinding(config, 'bandTier', { options: tierOptions });
const regenBtn = colorFolder.addButton({ title: 'Regenerate palette' });

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // One seed for the geometry (positions + noise field) so regenerating the
  // palette never moves a peg: the palette draws from its own seed and hands
  // the geometry seed back afterwards.
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  let paletteSeed = Random.getRandomSeed();
  let paletteKey = '';
  let palette: CuspPalette;
  let bg = '';

  const ensurePalette = () => {
    const key = `${paletteSeed}|${config.angle}|${config.hueCount}|${config.ground}|${config.gamut}|${config.saturation}|${config.coolWarm}`;
    if (key === paletteKey) return;
    Random.setSeed(paletteSeed);
    palette = cuspPalette({
      angle: config.angle,
      count: config.hueCount,
      ground: config.ground === 'random' ? undefined : config.ground,
      gamut: config.gamut,
      saturation: config.saturation,
      coolWarm: config.coolWarm,
    });
    Random.setSeed(seed);
    bg = palette.bg.css;
    paletteKey = key;
    console.log('Seed:', seed, 'Palette seed:', paletteSeed);
    console.log('Palette:', describe(palette));
    logColors(palette.colors);
  };

  // Sweep across the ring hues within one contrast tier, interpolated in
  // OKLCH so the pegs stay at that tier's distance from the ground.
  const tierScale = (tier: Tier) =>
    interpolate(
      palette.tiers[tier].map((s) => s.css),
      'oklch',
    );
  const colorMap = (t: number) => formatCss(tierScale(config.pegTier)(t));
  const bandColor = () => formatCss(tierScale(config.bandTier)(0.5));
  const stripeColor = () => formatCss(tierScale(config.stripeTier)(0.5));

  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  // Fixed noise time so the precomputed geometry is independent of playhead.
  const SNAPSHOT_T = 0;

  let positions: Vec2[] = [];
  let roles: Role[] = [];
  let contactOrder: number[] = [];
  let floaterIndices: number[] = [];
  let cacheKey = '';

  let renderCircles: RenderCircle[] = [];
  // The band, split into arc and tangent strokes so it can be drawn segment
  // by segment with a solid stripe under each: where the band crosses itself
  // the later segment covers the earlier one instead of hatching over it.
  let fillPath: Path2D = new Path2D();
  let centreSegs: BandSegment[] = [];
  /** lineSegs[k][i]: line k (an offset of the centreline), segment i. */
  let lineSegs: BandSegment[][] = [];

  const ensurePositions = () => {
    const halfCS = config.strokeWidth / 2;
    const key = `${config.count}|${config.maxR}|${config.dentCount}|${config.spread}`;
    if (key === cacheKey) return;

    const usableW = width * config.spread;
    const usableH = height * config.spread;
    const xLo = (width - usableW) / 2;
    const yLo = (height - usableH) / 2;
    const margin = config.maxR + 4;
    const minDist =
      ((Math.min(usableW, usableH) - 2 * margin) / Math.sqrt(config.count)) *
      0.75;
    positions = [];
    let attempts = 0;
    while (positions.length < config.count && attempts < config.count * 40) {
      attempts++;
      const pt = {
        x: Random.range(xLo + margin, xLo + usableW - margin),
        y: Random.range(yLo + margin, yLo + usableH - margin),
      };
      if (
        !positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)
      ) {
        positions.push(pt);
      }
    }

    // Provisional circles at maxR for topology-only hull classification
    const provisionalCircles: Circle[] = positions.map((p) => ({
      x: p.x,
      y: p.y,
      r: config.maxR + halfCS,
    }));

    const hullCcwOrder = convexHullOfDisks(provisionalCircles);
    const hullSet = new Set(hullCcwOrder);
    const allIndices = positions.map((_, i) => i);
    const interiorIndices = allIndices.filter((i) => !hullSet.has(i));

    // Shuffle interior indices with seeded Random, then pick dentCount of them
    const shuffled = [...interiorIndices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Random.value() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const dentCount = Math.min(config.dentCount, interiorIndices.length);
    const dentedSet = new Set(shuffled.slice(0, dentCount));

    roles = allIndices.map((i): Role => {
      if (hullSet.has(i)) return 'convex';
      if (dentedSet.has(i)) return 'concave';
      return 'floater';
    });

    // Start with the convex-hull traversal and splice each concave peg in
    // at the position that least lengthens the cycle (cheapest insertion).
    // Angle-sorting concave pegs around the centroid was the root cause of
    // the band's self-crossings: a concave peg's angular position around
    // the centroid does not always correspond to the hull edge it sits
    // closest to.
    const order = [...hullCcwOrder];
    const concaveIndices = allIndices.filter((i) => roles[i] === 'concave');
    for (const idx of concaveIndices) {
      const p = positions[idx];
      let bestPos = 1;
      let bestCost = Infinity;
      for (let i = 0; i < order.length; i++) {
        const a = positions[order[i]];
        const b = positions[order[(i + 1) % order.length]];
        const cost =
          Math.hypot(a.x - p.x, a.y - p.y) +
          Math.hypot(p.x - b.x, p.y - b.y) -
          Math.hypot(a.x - b.x, a.y - b.y);
        if (cost < bestCost) {
          bestCost = cost;
          bestPos = i + 1;
        }
      }
      order.splice(bestPos, 0, idx);
    }

    // 2-opt cleanup: if any two non-adjacent center-to-center edges of the
    // contact cycle still cross, reverse the segment between them. Each
    // reversal removes one crossing without altering which pegs are
    // contacts. Bounded by an iteration cap as a safety net.
    const twoOptCap = Math.max(40, order.length * order.length);
    let twoOptIter = 0;
    let improved = true;
    while (improved && twoOptIter < twoOptCap) {
      improved = false;
      twoOptIter++;
      const m = order.length;
      twoOpt: for (let i = 0; i < m; i++) {
        for (let j = i + 2; j < m; j++) {
          if (i === 0 && j === m - 1) continue;
          const a = positions[order[i]];
          const b = positions[order[(i + 1) % m]];
          const c = positions[order[j]];
          const d = positions[order[(j + 1) % m]];
          if (segmentsCross(a, b, c, d)) {
            const slice = order.slice(i + 1, j + 1).reverse();
            for (let k = 0; k < slice.length; k++) {
              order[i + 1 + k] = slice[k];
            }
            improved = true;
            break twoOpt;
          }
        }
      }
    }

    contactOrder = order;
    floaterIndices = allIndices.filter((i) => roles[i] === 'floater');

    cacheKey = key;
  };

  const computeGeometry = () => {
    ensurePalette();
    ensurePositions();

    const halfCS = config.strokeWidth / 2;
    const usableW = width * config.spread;
    const usableH = height * config.spread;
    const xLo = (width - usableW) / 2;
    const yLo = (height - usableH) / 2;
    const xHi = xLo + usableW;
    const yHi = yLo + usableH;

    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, SNAPSHOT_T);
      const r = mapRange(t, -1, 1, config.minR, config.maxR, true);
      return { x: p.x, y: p.y, r };
    });

    // Resolve overlaps: each colliding pair separates along their centerline,
    // weighted so the larger circle barely moves and the smaller is displaced.
    for (let iter = 0; iter < config.relaxIterations; iter++) {
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i];
          const b = circles[j];
          const ra = a.r + halfCS;
          const rb = b.r + halfCS;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = ra + rb;
          if (d >= minD || d < 1e-6) continue;
          const overlap = minD - d;
          const nx = dx / d;
          const ny = dy / d;
          const totalR = ra + rb;
          const aShare = rb / totalR;
          const bShare = ra / totalR;
          a.x -= nx * overlap * aShare;
          a.y -= ny * overlap * aShare;
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;
        }
      }
      for (const c of circles) {
        const r = c.r + halfCS;
        c.x = Math.min(Math.max(c.x, xLo + r), xHi - r);
        c.y = Math.min(Math.max(c.y, yLo + r), yHi - r);
      }
    }

    // Fixup loop: ensure no halo-halo overlap and no tangent segment of the
    // band crosses through a non-incident circle. For band violations, first
    // try to shrink the offending circle so its halo just clears the segment;
    // if shrinking alone can't clear it (the segment is closer than halfCS +
    // minRadiusFloor), shrink to the floor and nudge perpendicular to the
    // segment to recover the rest. Every contact and floater is in scope —
    // only the two circles incident to the current edge are skipped — because
    // the provisional-radius hull can mis-classify pegs once drift and
    // relaxation move things around.
    const minRadiusFloor = config.minR;
    const fixupPasses = 32;

    for (let pass = 0; pass < fixupPasses; pass++) {
      let changed = false;

      // Phase 1: pair-separate halos by movement. Strict (no overlap tolerance)
      // so circle fills never end up overlapping.
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i];
          const b = circles[j];
          const ra = a.r + halfCS;
          const rb = b.r + halfCS;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = ra + rb;
          if (d >= minD || d < 1e-6) continue;
          const overlap = minD - d;
          const nx = dx / d;
          const ny = dy / d;
          const totalR = ra + rb;
          const aShare = rb / totalR;
          const bShare = ra / totalR;
          a.x -= nx * overlap * aShare;
          a.y -= ny * overlap * aShare;
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;
          changed = true;
        }
      }
      for (const c of circles) {
        const r = c.r + halfCS;
        c.x = Math.min(Math.max(c.x, xLo + r), xHi - r);
        c.y = Math.min(Math.max(c.y, yLo + r), yHi - r);
      }

      // Phase 1.5: shrink fallback. If movement + bounds clamping left a pair
      // still overlapping (e.g. both circles are pinned against the boundary
      // and have no room to move), shrink the larger one until they clear.
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i];
          const b = circles[j];
          const ra = a.r + halfCS;
          const rb = b.r + halfCS;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const minD = ra + rb;
          if (d >= minD || d < 1e-6) continue;
          const overlap = minD - d;
          if (a.r >= b.r && a.r > minRadiusFloor) {
            a.r = Math.max(minRadiusFloor, a.r - overlap - 0.1);
            changed = true;
          } else if (b.r > minRadiusFloor) {
            b.r = Math.max(minRadiusFloor, b.r - overlap - 0.1);
            changed = true;
          }
        }
      }

      const haloProbe: Circle[] = circles.map((c) => ({
        x: c.x,
        y: c.y,
        r: c.r + halfCS,
      }));
      if (haloProbe.length < 2 || contactOrder.length < 2) {
        if (!changed) break;
        continue;
      }

      const probeContacts: ContactPeg[] = contactOrder.map((i) => ({
        circle: haloProbe[i],
        role: roles[i] as 'convex' | 'concave',
      }));
      const probeFloaters = floaterIndices.map((i) => haloProbe[i]);
      const expanded = expandWithFloaters(probeContacts, probeFloaters);
      const en = expanded.length;
      if (en < 2) {
        if (!changed) break;
        continue;
      }

      const edges = expanded.map((cp, i) => {
        const next = expanded[(i + 1) % en];
        return getRoleAwareTangent(
          cp.circle,
          next.circle,
          cp.role === 'convex' ? 'outside' : 'inside',
          next.role === 'convex' ? 'outside' : 'inside',
        );
      });

      for (let i = 0; i < circles.length; i++) {
        const haloI = haloProbe[i];
        const c = circles[i];
        for (let e = 0; e < edges.length; e++) {
          const aCircle = expanded[e].circle;
          const bCircle = expanded[(e + 1) % en].circle;
          if (aCircle === haloI || bCircle === haloI) continue;

          const ea = edges[e].t1;
          const eb = edges[e].t2;
          const segVec = sub(eb, ea);
          const segLenSq = dot(segVec, segVec);
          if (segLenSq < 1e-12) continue;
          const tParam = Math.max(
            0,
            Math.min(1, dot(sub({ x: c.x, y: c.y }, ea), segVec) / segLenSq),
          );
          const closest = add(ea, scale(segVec, tParam));
          const distVec = sub({ x: c.x, y: c.y }, closest);
          const dist = vlen(distVec);
          const safeDist = c.r + halfCS;
          // Require ≥ 0.5 px clearance; shrink/nudge to 1.0 px. The band's
          // inner stroke edge sits halfCS inside the centerline, so 1.0 px
          // of centerline-to-halo clearance gives the band's near edge 1.0 px
          // of visible separation from every non-incident circle's fill.
          // Without this, expandWithFloaters can also insert a marginal
          // floater as a contact with a tiny-chord arc — a kink in the
          // bevel gradient.
          if (dist >= safeDist + 0.5) continue;

          if (dist >= halfCS + minRadiusFloor + 1.0) {
            c.r = dist - halfCS - 1.0;
            changed = true;
          } else {
            c.r = minRadiusFloor;
            const needed = minRadiusFloor + halfCS - dist + 1.0;
            let nx: number;
            let ny: number;
            if (dist > 1e-6) {
              nx = distVec.x / dist;
              ny = distVec.y / dist;
            } else {
              const segLen = Math.sqrt(segLenSq);
              nx = -segVec.y / segLen;
              ny = segVec.x / segLen;
            }
            c.x += nx * needed;
            c.y += ny * needed;
            changed = true;
          }
        }
      }

      if (!changed) break;
    }

    const haloCircles: Circle[] = circles.map((c) => ({
      x: c.x,
      y: c.y,
      r: c.r + halfCS,
    }));

    fillPath = new Path2D();
    centreSegs = [];
    lineSegs = [];
    // Indices of the pegs the band actually wraps once the layout is settled.
    let touching: Set<number> | null = null;
    if (haloCircles.length >= 2 && contactOrder.length >= 2) {
      const contacts: ContactPeg[] = contactOrder.map((i) => ({
        circle: haloCircles[i],
        role: roles[i] as 'convex' | 'concave',
      }));
      const floaters = floaterIndices.map((i) => haloCircles[i]);
      const expanded = expandWithFloaters(contacts, floaters);
      touching = new Set(expanded.map((cp) => haloCircles.indexOf(cp.circle)));
      rubberBandPath(fillPath, expanded, 0);
      // Cut the stroke order mid-way along one clear tangent (see
      // chooseSeamTangent); chosen once, from the centreline, so every
      // offset line is cut at the same place.
      const seam = chooseSeamTangent(expanded);
      centreSegs = rubberBandSegments(expanded, 0, seam);
      const n = config.bandLines;
      lineSegs = Array.from({ length: n }, (_, k) =>
        rubberBandSegments(
          expanded,
          n === 1 ? 0 : mapRange(k, 0, n - 1, -halfCS, halfCS),
          seam,
        ),
      );
    }

    // Every peg took part in the relaxation, but only the ones the band
    // touches are drawn: the untouched floaters leave their room behind.
    renderCircles = circles
      .filter((_, i) => !config.onlyContacts || !touching || touching.has(i))
      .map((c) => {
        const t = noise(c.x, c.y, SNAPSHOT_T);
        const color = colorMap(mapRange(t, -1, 1, 0, 1, true));
        return { circle: c, color };
      });
  };

  computeGeometry();
  pane.on('change', () => computeGeometry());
  regenBtn.on('click', () => {
    paletteSeed = Random.getRandomSeed();
    computeGeometry();
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (config.hullFill) {
      context.fillStyle = bandColor();
      context.fill(fillPath);
    }

    context.lineJoin = 'round';

    // Conveyor-belt dash: advance offset by an integer number of full
    // dash+gap periods over the duration so the pattern wraps seamlessly.
    // Each segment subtracts its start length so the pattern runs unbroken
    // across the per-segment strokes.
    const dashPeriod = config.dashLength + config.gapLength;
    const dashOffset = -playhead * config.loops * dashPeriod;
    const band = bandColor();
    const stripe = stripeColor();
    // Wide enough to cover every line plus a little breathing room.
    const stripeWidth = config.strokeWidth + config.lineWidth * 2 + 2;

    for (let i = 0; i < centreSegs.length; i++) {
      // Solid stripe under this segment's lines. Also hides whatever earlier
      // segments drew where the band overlaps itself — including the arc a
      // tangent departs from when the band has wrapped that peg nearly 360°.
      context.setLineDash([]);
      context.lineDashOffset = 0;
      context.lineWidth = stripeWidth;
      context.strokeStyle = stripe;
      context.stroke(centreSegs[i].path);

      // Thin parallel lines: one offset curve per line, all in the band tier.
      context.setLineDash([config.dashLength, config.gapLength]);
      context.lineWidth = config.lineWidth;
      context.strokeStyle = band;
      for (const segs of lineSegs) {
        context.lineDashOffset = dashOffset - segs[i].start;
        context.stroke(segs[i].path);
      }
    }

    context.setLineDash([]);
    context.lineDashOffset = 0;

    if (config.showPegs) {
      // Stipple pass: concentric rings stepping in from the peg's edge to a
      // solid centre dot, all in the peg's colour. The outermost ring is
      // skipped, leaving a gap of ground between the band and the peg so the
      // band's inner line stays legibly the band's.
      context.lineWidth = config.lineWidth;
      for (const rc of renderCircles) {
        const c = rc.circle;
        context.strokeStyle = rc.color;
        for (
          let r = c.r - config.lineWidth - config.ringGap;
          r > config.dotRadius + config.ringGap * 0.5;
          r -= config.ringGap
        ) {
          context.beginPath();
          context.arc(c.x, c.y, r, 0, Math.PI * 2);
          context.stroke();
        }

        context.fillStyle = rc.color;
        context.beginPath();
        context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);

// --- Vec2 math ---

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}
function vlen(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

// Proper open-segment crossing test: returns true only when [a,b] and [c,d]
// strictly cross interior-to-interior. Shared endpoints and collinear overlap
// don't count as a crossing — exactly what 2-opt wants on a closed cycle.
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return (
    ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
    ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
  );
}

// --- Convex hull of disk centers (Andrew's monotone chain) ---
// Approximation: uses centers only; valid when radius spread is modest.

function convexHullOfDisks(circles: Circle[]): number[] {
  const n = circles.length;
  if (n < 3) return circles.map((_, i) => i);

  const indices = circles
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = circles[a];
      const cb = circles[b];
      return ca.x !== cb.x ? ca.x - cb.x : ca.y - cb.y;
    });

  const cross3 = (o: number, a: number, b: number): number => {
    const oc = circles[o];
    const ac = circles[a];
    const bc = circles[b];
    return (ac.x - oc.x) * (bc.y - oc.y) - (ac.y - oc.y) * (bc.x - oc.x);
  };

  const lower: number[] = [];
  for (const i of indices) {
    while (
      lower.length >= 2 &&
      cross3(lower[lower.length - 2], lower[lower.length - 1], i) <= 0
    )
      lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = indices.length - 1; k >= 0; k--) {
    const i = indices[k];
    while (
      upper.length >= 2 &&
      cross3(upper[upper.length - 2], upper[upper.length - 1], i) <= 0
    )
      upper.pop();
    upper.push(i);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// --- Role-aware tangent ---
// Computes the tangent segment between two circles given their contact roles.
// side 'outside' = band wraps around the circle exterior (convex peg).
// side 'inside'  = band dips into the circle interior (concave peg).
//
// Derivation: let s = +1 for outside, -1 for inside.
// The tangent normal n satisfies dot(c2-c1, n) = s1*r1 - s2*r2,
// giving a = (s1*r1 - s2*r2) / d, b = sqrt(1 - a²).
// Tangent points: t1 = c1 + s1*r1*n,  t2 = c2 + s2*r2*n.

function getRoleAwareTangent(
  c1: Circle,
  c2: Circle,
  side1: 'outside' | 'inside',
  side2: 'outside' | 'inside',
): { t1: Vec2; t2: Vec2 } {
  const s1 = side1 === 'outside' ? 1 : -1;
  const s2 = side2 === 'outside' ? 1 : -1;
  const diff = sub(c2, c1);
  const d = vlen(diff);
  if (d < 1e-6) return { t1: { x: c1.x, y: c1.y }, t2: { x: c2.x, y: c2.y } };
  const dir = scale(diff, 1 / d);
  const right = perpRight(dir);
  const a = (s1 * c1.r - s2 * c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const n = add(scale(dir, a), scale(right, b));
  return {
    t1: add(c1, scale(n, s1 * c1.r)),
    t2: add(c2, scale(n, s2 * c2.r)),
  };
}

// --- Segment / disk intersection (parametric t along segment a→b) ---

function intersectSegmentDisk(
  a: Vec2,
  b: Vec2,
  c: Circle,
): { t: number } | null {
  const d = sub(b, a);
  const f = sub(a, c as Vec2);
  const dd = dot(d, d);
  if (dd < 1e-12) return null;
  const fd = dot(f, d);
  const ff = dot(f, f) - c.r * c.r;
  const disc = fd * fd - dd * ff;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-fd - sq) / dd;
  const t1 = (-fd + sq) / dd;
  if (t1 < 0 || t0 > 1) return null;
  return { t: Math.max(0, t0) };
}

// --- Rubber band path ---

// Traces the band through an already-expanded contact list, offset `offset`
// px outward from the centreline. Offsetting is exact for this geometry: a
// convex peg's arc grows by `offset`, a concave peg's arc (wrapped from the
// inside) shrinks by it, and the tangent between two so-adjusted circles is
// parallel to the original because (s1·r1 − s2·r2) is unchanged.
// The expanded contacts with every circle moved `offset` px outward.
function offsetContacts(expanded: ContactPeg[], offset: number): ContactPeg[] {
  return expanded.map((cp) => ({
    role: cp.role,
    circle: {
      x: cp.circle.x,
      y: cp.circle.y,
      r: Math.max(
        0.5,
        cp.role === 'convex' ? cp.circle.r + offset : cp.circle.r - offset,
      ),
    },
  }));
}

// Tangent segment from each contact to the next, role-aware.
function tangentEdges(expanded: ContactPeg[]): { t1: Vec2; t2: Vec2 }[] {
  const n = expanded.length;
  return expanded.map((cp, i) => {
    const next = expanded[(i + 1) % n];
    return getRoleAwareTangent(
      cp.circle,
      next.circle,
      cp.role === 'convex' ? 'outside' : 'inside',
      next.role === 'convex' ? 'outside' : 'inside',
    );
  });
}

// Arc angles at contact `i`: where the band arrives from the previous peg and
// departs toward the next, plus the swept angle in the band's travel direction.
function arcAt(
  expanded: ContactPeg[],
  edges: { t1: Vec2; t2: Vec2 }[],
  i: number,
): { aAngle: number; dAngle: number; anticlockwise: boolean; sweep: number } {
  const n = expanded.length;
  const cp = expanded[i];
  const c = cp.circle;
  const arrival = edges[(i - 1 + n) % n].t2;
  const departure = edges[i].t1;
  const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
  const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);
  // Convex pegs: short arc on outside (clockwise in canvas Y-down).
  // Concave pegs: short arc on inside (anticlockwise in canvas Y-down).
  const anticlockwise = cp.role === 'concave';
  const TAU = Math.PI * 2;
  const sweep = anticlockwise
    ? (((aAngle - dAngle) % TAU) + TAU) % TAU
    : (((dAngle - aAngle) % TAU) + TAU) % TAU;
  return { aAngle, dAngle, anticlockwise, sweep };
}

// The band as open sub-paths in drawing order — each contact's arc, then the
// tangent on to the next contact — with each segment's start distance along
// the band (measured from contact 0's arrival, for the dash pattern).
//
// Arc and tangent are separate strokes on purpose: when the band wraps a peg
// nearly all the way round, the inner lines' departing tangent has to cross
// the outer lines' arc, and only a stripe drawn between the two hides that.
//
// The closed loop's "later stroke covers earlier" has to break somewhere.
// Breaking it at a contact puts that contact's arc at the bottom of the
// z-order and its arriving tangent at the top, so anything crossing there is
// sandwiched between them and the arrival's butt end shows. Instead the
// tangent `seam` is split at its midpoint and the order rotated to begin
// with its second half and end with its first: the two halves are collinear
// and cannot overlap, and every contact gets arrival → arc → departure. All
// seams are C1 and every stroke overlaps its neighbours by SEAM_OVERLAP.
function rubberBandSegments(
  expandedBase: ContactPeg[],
  offset = 0,
  seam = 0,
): BandSegment[] {
  const expanded = offsetContacts(expandedBase, offset);
  const n = expanded.length;
  if (n < 2) return [];
  const edges = tangentEdges(expanded);
  const seamIndex = Math.min(Math.max(seam, 0), n - 1);
  const e = SEAM_OVERLAP;

  // A straight stroke from a to b, extended `e` px past both ends. Its
  // `start` is pulled back by `e` so the dash pattern is unmoved.
  const line = (a: Vec2, b: Vec2, at: number): BandSegment => {
    const d = sub(b, a);
    const len = vlen(d);
    const u = len > 1e-9 ? scale(d, e / len) : { x: 0, y: 0 };
    const path = new Path2D();
    path.moveTo(a.x - u.x, a.y - u.y);
    path.lineTo(b.x + u.x, b.y + u.y);
    return { path, start: at - e };
  };

  // Path order first, with the seam tangent as two halves.
  const inOrder: BandSegment[] = [];
  let cut = 0;
  let start = 0;
  for (let i = 0; i < n; i++) {
    const c = expanded[i].circle;
    const { aAngle, dAngle, anticlockwise, sweep } = arcAt(expanded, edges, i);
    // Extend the arc by `e` px of arc length at each end, in its own sweep
    // direction, so it overlaps the tangents it joins.
    const dir = anticlockwise ? -1 : 1;
    const ext = (dir * e) / c.r;
    const arc = new Path2D();
    arc.arc(c.x, c.y, c.r, aAngle - ext, dAngle + ext, anticlockwise);
    inOrder.push({ path: arc, start: start - e });
    start += c.r * sweep;

    const { t1, t2 } = edges[i];
    const len = vlen(sub(t2, t1));
    if (i === seamIndex) {
      const mid = scale(add(t1, t2), 0.5);
      inOrder.push(line(t1, mid, start));
      cut = inOrder.length - 1;
      inOrder.push(line(mid, t2, start + len / 2));
    } else {
      inOrder.push(line(t1, t2, start));
    }
    start += len;
  }

  // Rotate: second half of the seam tangent first, first half last.
  return inOrder.slice(cut + 1).concat(inOrder.slice(0, cut + 1));
}

// Which tangent to cut the stroke order in. The cut is invisible only if no
// other part of the band lies over it, so take the tangent whose midpoint is
// farthest from every other tangent chord and from every contact's halo
// circle (the arc is approximated by its full circle, which is conservative
// and also right for near-full wraps); ties go to the longer tangent.
function chooseSeamTangent(expanded: ContactPeg[]): number {
  const n = expanded.length;
  if (n < 2) return 0;
  const edges = tangentEdges(expanded);
  let best = 0;
  let bestClearance = -Infinity;
  let bestLen = -Infinity;
  for (let j = 0; j < n; j++) {
    const { t1, t2 } = edges[j];
    const len = vlen(sub(t2, t1));
    const mid = scale(add(t1, t2), 0.5);
    let clearance = Infinity;
    for (let k = 0; k < n; k++) {
      if (k !== j) {
        clearance = Math.min(
          clearance,
          pointSegmentDistance(mid, edges[k].t1, edges[k].t2),
        );
      }
      const c = expanded[k].circle;
      clearance = Math.min(clearance, Math.abs(vlen(sub(mid, c)) - c.r));
    }
    if (
      clearance > bestClearance ||
      (clearance === bestClearance && len > bestLen)
    ) {
      best = j;
      bestClearance = clearance;
      bestLen = len;
    }
  }
  return best;
}

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq < 1e-12) return vlen(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
  return vlen(sub(p, add(a, scale(ab, t))));
}

function rubberBandPath(
  path: Path2D,
  expandedBase: ContactPeg[],
  offset = 0,
): void {
  const expanded = offsetContacts(expandedBase, offset);
  const n = expanded.length;
  if (n < 2) return;
  const edges = tangentEdges(expanded);

  // Place the moveTo/closePath seam at the midpoint of the last tangent
  // instead of at peg 0's arrival. The seam is then a join between two
  // collinear halves of the same straight line, which lineJoin='round'
  // renders as a true no-op — whereas a seam at a line→arc transition
  // can produce a visible kink in the bevel gradient under nested strokes
  // even when the path is mathematically C1 continuous.
  const seamEdge = edges[n - 1];
  const seamMid: Vec2 = {
    x: (seamEdge.t1.x + seamEdge.t2.x) / 2,
    y: (seamEdge.t1.y + seamEdge.t2.y) / 2,
  };
  path.moveTo(seamMid.x, seamMid.y);
  path.lineTo(seamEdge.t2.x, seamEdge.t2.y);

  for (let i = 0; i < n; i++) {
    const c = expanded[i].circle;
    const { aAngle, dAngle, anticlockwise } = arcAt(expanded, edges, i);
    path.arc(c.x, c.y, c.r, aAngle, dAngle, anticlockwise);
    if (i < n - 1) {
      path.lineTo(edges[i].t2.x, edges[i].t2.y);
    } else {
      path.lineTo(seamMid.x, seamMid.y);
    }
  }

  path.closePath();
}

// Inserts floater circles as convex contacts wherever the current tangent
// segments cross them. Each floater is inserted at most once.
function expandWithFloaters(
  contacts: ContactPeg[],
  floaters: Circle[],
): ContactPeg[] {
  if (floaters.length === 0) return contacts;

  const result: ContactPeg[] = [];
  const n = contacts.length;
  const added = new Set<Circle>();

  for (let i = 0; i < n; i++) {
    result.push(contacts[i]);
    const a = contacts[i];
    const b = contacts[(i + 1) % n];

    const { t1, t2 } = getRoleAwareTangent(
      a.circle,
      b.circle,
      a.role === 'convex' ? 'outside' : 'inside',
      b.role === 'convex' ? 'outside' : 'inside',
    );

    const hits: { t: number; circle: Circle }[] = [];
    for (const f of floaters) {
      if (!added.has(f) && intersectSegmentDisk(t1, t2, f) !== null) {
        const seg = sub(t2, t1);
        const proj =
          dot(sub({ x: f.x, y: f.y }, t1), seg) /
          Math.max(dot(seg, seg), 1e-12);
        hits.push({ t: Math.max(0, Math.min(1, proj)), circle: f });
      }
    }

    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) {
      result.push({ circle: h.circle, role: 'convex' });
      added.add(h.circle);
    }
  }

  return result;
}
