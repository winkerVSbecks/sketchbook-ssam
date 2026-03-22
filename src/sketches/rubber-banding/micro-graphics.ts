import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const DEBUG = false;

type CircleKind = 'asterisk' | 'ring' | 'gear';

interface Vec2 {
  x: number;
  y: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
  kind: CircleKind;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const grid = makeGrid(width, height);
  let circles: Circle[] = [];
  const lw = width * 0.003;

  wrap.render = ({ width, height, frame, playhead }: SketchProps) => {
    if (frame === 0) {
      circles = generateLayout(grid, width, height);
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    if (DEBUG) {
      context.fillStyle = 'rgba(255, 0, 0, 0.5)';
      for (const pt of grid) {
        context.beginPath();
        context.arc(pt.x, pt.y, lw * 2, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawUIElements(context, width, height, lw, playhead);

    context.strokeStyle = '#111111';
    context.lineWidth = lw;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    drawRubberBand(context, circles);

    const angle = playhead * Math.PI * 2;
    for (const c of circles) {
      drawCircle(context, c, lw, angle);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [900, 600],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

// --- Layout ---

function makeGrid(width: number, height: number): Vec2[] {
  // Grid lives in the rubber band area [0, 0, width*2/3, height]
  const areaW = (width * 2) / 3;
  const size = Math.min(areaW, height) * 0.65;
  const step = size / 2;
  const ox = (areaW - size) / 2;
  const oy = (height - size) / 2;
  const pts: Vec2[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      pts.push({ x: ox + col * step, y: oy + row * step });
    }
  }
  return pts;
}

function generateLayout(grid: Vec2[], width: number, height: number): Circle[] {
  // step = half the grid size; max radius keeps circles within their cell
  const step = (Math.min((width * 2) / 3, height) * 0.65) / 2;
  const minR = step * 0.28;
  const maxR = step * 0.44;
  return pickCircles(grid, minR, maxR);
}

function pickCircles(grid: Vec2[], minR: number, maxR: number): Circle[] {
  const shuffled = Random.shuffle([...grid]);
  const kinds = Random.shuffle(['asterisk', 'ring', 'gear'] as CircleKind[]);
  const result: Circle[] = [];

  for (const pt of shuffled) {
    if (result.length === 3) break;
    const r = Random.range(minR, maxR);
    const overlaps = result.some(
      (c) => Math.hypot(c.x - pt.x, c.y - pt.y) < c.r + r + 15,
    );
    if (!overlaps) {
      result.push({ ...pt, r, kind: kinds[result.length] });
    }
  }

  if (result.length < 3) {
    return hullCircles([
      { x: grid[0].x, y: grid[0].y, r: minR, kind: kinds[0] },
      { x: grid[4].x, y: grid[4].y, r: minR, kind: kinds[1] },
      { x: grid[8].x, y: grid[8].y, r: minR, kind: kinds[2] },
    ]);
  }

  return hullCircles(result);
}

function hullCircles(circles: Circle[]): Circle[] {
  const sorted = [...circles].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross =
    (sorted[1].x - sorted[0].x) * (sorted[2].y - sorted[0].y) -
    (sorted[1].y - sorted[0].y) * (sorted[2].x - sorted[0].x);

  const hull =
    Math.abs(cross) < 1 ? [sorted[0], sorted[sorted.length - 1]] : circles;

  const cx = hull.reduce((s, c) => s + c.x, 0) / hull.length;
  const cy = hull.reduce((s, c) => s + c.y, 0) / hull.length;
  return [...hull].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}

// --- Circle drawing ---

function drawCircle(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  lw: number,
  angle: number,
): void {
  // Fill first to occlude rubber band beneath
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fillStyle = c.kind === 'gear' ? '#111111' : '#ffffff';
  ctx.fill();

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = lw;

  if (c.kind !== 'gear') {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (c.kind === 'asterisk') drawAsterisk(ctx, c.x, c.y, c.r, lw, angle);
  else if (c.kind === 'ring') drawRing(ctx, c.x, c.y, c.r, lw);
  else drawGear(ctx, c.x, c.y, c.r, angle);
}

function drawAsterisk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  lw: number,
  angle: number,
): void {
  const spokes = 8;
  const len = r * 0.62;
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  lw: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = lw;
  ctx.stroke();
}

// Solid black filled circle with a white gear shape and centre hole.
// Teeth are rectangular: sides offset by a fixed pixel distance in the
// tangent direction so width is the same at inner and outer radius.
function drawGear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
): void {
  const N = 12;
  const innerR = r * 0.36;
  const outerR = r * 0.54;
  // Half-width of each tooth in pixels (constant, so no taper)
  const hw = ((innerR * Math.PI) / N) * 0.55;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const base = (i / N) * Math.PI * 2;
    const rx = Math.cos(base);
    const ry = Math.sin(base);
    const tx = -ry;
    const ty = rx;

    const p0x = rx * innerR - hw * tx;
    const p0y = ry * innerR - hw * ty;
    if (i === 0) ctx.moveTo(p0x, p0y);
    else ctx.lineTo(p0x, p0y);
    ctx.lineTo(rx * outerR - hw * tx, ry * outerR - hw * ty);
    ctx.lineTo(rx * outerR + hw * tx, ry * outerR + hw * ty);
    ctx.lineTo(rx * innerR + hw * tx, ry * innerR + hw * ty);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Centre hole
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = '#111111';
  ctx.fill();

  ctx.restore();
}

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

// --- Rubber band ---

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

// --- UI decoration elements ---

function drawUIElements(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lw: number,
  playhead: number,
): void {
  drawTopRightPanel(ctx, (w * 2) / 3, 0, w / 3, h / 2, lw);
  drawBottomLeftPanel(ctx, 0, (h * 2) / 3, w / 3, h / 3, lw, playhead);
  drawBottomRightGroup(ctx, (w * 2) / 3, h / 2, w / 3, h / 2, lw, playhead);
}

// 稿 + large 009 + pill bar — fitted to rect (rx, ry, rw, rh)
function drawTopRightPanel(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  lw: number,
): void {
  const pad = rw * 0.08;

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';

  // Small kanji top-left
  ctx.font = `${rh * 0.12}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText('稿', rx + pad, ry + pad);

  // Large bold number sized to fill the rect
  const numSize = Math.min(rw * 0.82, rh * 0.52);
  ctx.font = `900 ${numSize}px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('009', rx + pad, ry + rh * 0.78);

  // Pill near the bottom
  const pillW = rw * 0.75;
  const pillH = rh * 0.06;
  const pillX = rx + (rw - pillW) / 2;
  const pillY = ry + rh * 0.88;
  const pillR = pillH / 2;
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.arc(pillX + pillW - pillR, pillY + pillR, pillR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.arc(pillX + pillR, pillY + pillR, pillR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = lw;
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
}

// Ring of small outlined circles with animated radius wave — fitted to rect
function drawBottomLeftPanel(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  lw: number,
  playhead: number,
): void {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const ringR = Math.min(rw, rh) * 0.3;
  const N = 16;
  const minR = lw * 0.5;
  const maxR = lw * 1.8;

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const dx = cx + Math.cos(angle) * ringR;
    const dy = cy + Math.sin(angle) * ringR;
    const wave =
      Math.sin(playhead * Math.PI * 2 - (i / N) * Math.PI * 2) * 0.5 + 0.5;
    const dotR = minR + (maxR - minR) * wave;
    ctx.beginPath();
    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
  }
}

// Animated rounded rectangles — fitted to rect (rx, ry, rw, rh)
function drawBottomRightGroup(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  lw: number,
  playhead: number,
): void {
  const pad = rw * 0.06;
  const groupH = rh * 0.14;
  const groupY = ry + (rh - groupH) / 2;
  const gap = rw * 0.03;
  const N = 5;
  const totalRectW = rw - 2 * pad - (N - 1) * gap;

  const phases = [0, 1.26, 2.51, 3.77, 5.03];
  const minWeight = 0.08;
  const raw = phases.map(
    (p) =>
      minWeight +
      (1 - minWeight) * (Math.sin(playhead * Math.PI * 2 + p) * 0.5 + 0.5),
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const portions = raw.map((v) => v / sum);

  ctx.fillStyle = '#111111';
  let curX = rx + pad;
  for (const portion of portions) {
    const rectW = portion * totalRectW;
    const radius = Math.min(rectW / 2, groupH * 0.18);
    roundRect(ctx, curX, groupY, rectW, groupH, radius);
    ctx.fill();
    curX += rectW + gap;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
  ctx.closePath();
}
