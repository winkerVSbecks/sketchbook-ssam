import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';

interface Vec2 {
  x: number;
  y: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}

const config = {
  count: 80,
  maxConnections: 1,
  maxConnDistFactor: 0.18,
  minR: 8,
  maxR: 46,
  hatchSpacing: 4,
  hatchAngle: Math.PI / 4,
  baselineY: 0.12,
  masterX: 0.5,
  masterR: 70,
  masterGap: 24,
  topBiasPower: 1.7,
  driftAmt: 0.018,
  pulleyTabRatio: 0.32,
  bg: '#f1ebdd',
  ink: '#111111',
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 10, max: 200, step: 1 });
pane.addBinding(config, 'maxConnections', { min: 0, max: 3, step: 1 });
pane.addBinding(config, 'maxConnDistFactor', { min: 0.05, max: 0.5, step: 0.01 });
pane.addBinding(config, 'minR', { min: 2, max: 30, step: 1 });
pane.addBinding(config, 'maxR', { min: 10, max: 90, step: 1 });
pane.addBinding(config, 'hatchSpacing', { min: 2, max: 12, step: 0.5 });
pane.addBinding(config, 'hatchAngle', { min: 0, max: Math.PI, step: 0.01 });
pane.addBinding(config, 'baselineY', { min: 0.05, max: 0.95, step: 0.01 });
pane.addBinding(config, 'masterX', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'masterR', { min: 30, max: 160, step: 1 });
pane.addBinding(config, 'masterGap', { min: 0, max: 120, step: 1 });
pane.addBinding(config, 'topBiasPower', { min: 1, max: 4, step: 0.1 });
pane.addBinding(config, 'driftAmt', { min: 0, max: 0.08, step: 0.001 });
pane.addBinding(config, 'pulleyTabRatio', { min: 0.1, max: 0.6, step: 0.01 });
pane.addBinding(config, 'bg');
pane.addBinding(config, 'ink');

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

  const maxConnDist = width * config.maxConnDistFactor;

  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  const margin = 80;
  const master: Circle = {
    x: width * config.masterX,
    y: height * config.baselineY + config.masterGap + config.masterR,
    r: config.masterR,
  };
  const hangTop = master.y + master.r + 60;
  const hangBottom = height - margin;
  const minDist = ((width - 2 * margin) / Math.sqrt(config.count)) * 0.95;
  const positions: Vec2[] = [];
  let attempts = 0;
  while (positions.length < config.count && attempts < config.count * 80) {
    attempts++;
    const ty = Math.pow(Math.random(), config.topBiasPower);
    const pt = {
      x: Random.range(margin, width - margin),
      y: mapRange(ty, 0, 1, hangTop, hangBottom),
    };
    if (!positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) {
      positions.push(pt);
    }
  }

  // Pulley-to-pulley warp tangents
  const allPairs: [number, number][] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = Math.hypot(
        positions[j].x - positions[i].x,
        positions[j].y - positions[i].y,
      );
      if (d <= maxConnDist) allPairs.push([i, j]);
    }
  }

  const edges: [number, number][] = [];
  const connCount = new Array(positions.length).fill(0);
  for (const [i, j] of Random.shuffle(allPairs)) {
    if (
      connCount[i] < config.maxConnections &&
      connCount[j] < config.maxConnections
    ) {
      edges.push([i, j]);
      connCount[i]++;
      connCount[j]++;
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    const driftAmt = width * config.driftAmt;
    const baselineY = height * config.baselineY;

    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, playhead);
      const ceilingProx = 1 - mapRange(p.y, hangTop, hangBottom, 0, 1, true);
      const baseR = mapRange(ceilingProx, 0, 1, config.minR, config.maxR);
      const r = baseR * mapRange(t, -1, 1, 0.88, 1.12, true);
      const dx = noise(p.x + 500, p.y, playhead) * driftAmt;
      const dy = noise(p.x, p.y + 500, playhead) * driftAmt;
      return { x: p.x + dx, y: p.y + dy, r };
    });

    // Ceiling line
    context.strokeStyle = config.ink;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(margin * 0.5, baselineY);
    context.lineTo(width - margin * 0.5, baselineY);
    context.stroke();

    // Master pulley's own suspension: tab top up to the ceiling
    context.lineWidth = 0.8;
    context.beginPath();
    context.moveTo(master.x, master.y - master.r);
    context.lineTo(master.x, baselineY);
    context.stroke();

    // Each pulley's strand: from its tab up, tangent to the master pulley, wrapping over to the top
    context.lineWidth = 0.6;
    for (const c of circles) {
      drawWrappedStrand(context, c.x, c.y - c.r, master);
    }

    // Rubber-band tangent pairs (cross-bracing between hanging pulleys)
    context.lineWidth = 1;
    context.lineJoin = 'round';
    for (const [i, j] of edges) {
      const ci = circles[i];
      const cj = circles[j];
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      if (d > ci.r + cj.r + 2) {
        drawRubberBand(context, [ci, cj]);
      }
    }

    // Master pulley (drawn after strands so they appear to wrap around it)
    drawPulleyTab(context, master, config.ink, config.pulleyTabRatio);
    drawHatchedCircle(
      context,
      master,
      config.hatchSpacing,
      config.hatchAngle,
      config.bg,
      config.ink,
    );

    // Small pulleys
    for (const c of circles) {
      drawPulleyTab(context, c, config.ink, config.pulleyTabRatio);
      drawHatchedCircle(
        context,
        c,
        config.hatchSpacing,
        config.hatchAngle,
        config.bg,
        config.ink,
      );
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
function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}
function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}

// --- Rubber band tangent pair ---

function getTangentPoints(c1: Circle, c2: Circle): { t1: Vec2; t2: Vec2 } {
  const dir = normalize(sub(c2, c1));
  const n = perpRight(dir);
  return {
    t1: add(c1, scale(n, c1.r)),
    t2: add(c2, scale(n, c2.r)),
  };
}

function drawRubberBand(
  ctx: CanvasRenderingContext2D,
  circles: Circle[],
): void {
  const n = circles.length;
  const edges = circles.map((c, i) =>
    getTangentPoints(c, circles[(i + 1) % n]),
  );

  ctx.beginPath();
  const firstArrival = edges[n - 1].t2;
  ctx.moveTo(firstArrival.x, firstArrival.y);

  for (let i = 0; i < n; i++) {
    const c = circles[i];
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;

    const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);

    ctx.arc(c.x, c.y, c.r, aAngle, dAngle, false);
    ctx.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  ctx.stroke();
}

// --- Strand: tangent from a point to the master pulley, then wrap over to its top ---

function drawWrappedStrand(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  master: Circle,
): void {
  const dx = startX - master.x;
  const dy = startY - master.y;
  const d = Math.hypot(dx, dy);
  if (d <= master.r) return;

  const angleCP = Math.atan2(dy, dx);
  const alpha = Math.acos(master.r / d);
  const side = startX < master.x ? 1 : -1;
  const tangentAngle = angleCP + side * alpha;

  const tangentX = master.x + master.r * Math.cos(tangentAngle);
  const tangentY = master.y + master.r * Math.sin(tangentAngle);
  const topAngle = -Math.PI / 2;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(tangentX, tangentY);
  ctx.arc(master.x, master.y, master.r, tangentAngle, topAngle, side === -1);
  ctx.stroke();
}

// --- Pulley tab (the anchor on top) ---

function drawPulleyTab(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  color: string,
  ratio: number,
): void {
  const tabW = Math.max(4, c.r * ratio);
  const tabH = Math.max(6, c.r * 0.55);
  const topY = c.y - c.r;
  ctx.fillStyle = color;
  ctx.fillRect(c.x - tabW / 2, topY - tabH, tabW, tabH);
}

// --- Hatched disc ---

function drawHatchedCircle(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  spacing: number,
  angle: number,
  paperColor: string,
  inkColor: string,
): void {
  // Paper fill so strands behind don't bleed through
  ctx.fillStyle = paperColor;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 0.7;
  drawHatchSet(ctx, c, spacing, angle);
  drawHatchSet(ctx, c, spacing, angle + Math.PI / 2);

  ctx.restore();

  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHatchSet(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  spacing: number,
  angle: number,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  const len = c.r * 1.5;
  const steps = Math.ceil((c.r * 1.5) / spacing);
  for (let i = -steps; i <= steps; i++) {
    const offset = i * spacing;
    const cx = c.x + px * offset;
    const cy = c.y + py * offset;
    ctx.beginPath();
    ctx.moveTo(cx - dx * len, cy - dy * len);
    ctx.lineTo(cx + dx * len, cy + dy * len);
    ctx.stroke();
  }
}
