import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Pane } from 'tweakpane';
import { mapRange } from 'canvas-sketch-util/math';

// --- 2D vector (complex number) utilities ---
interface Vec2 {
  re: number;
  im: number;
}

const cx = (re: number, im: number): Vec2 => ({ re, im });
const cxFromPolar = (r: number, theta: number): Vec2 => ({
  re: r * Math.cos(theta),
  im: r * Math.sin(theta),
});
const cxAdd = (a: Vec2, b: Vec2): Vec2 => ({
  re: a.re + b.re,
  im: a.im + b.im,
});
const cxSub = (a: Vec2, b: Vec2): Vec2 => ({
  re: a.re - b.re,
  im: a.im - b.im,
});
const cxMul = (a: Vec2, b: Vec2): Vec2 => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cxScale = (a: Vec2, n: number): Vec2 => ({ re: a.re * n, im: a.im * n });
const cxScaleDiv = (a: Vec2, n: number): Vec2 => ({
  re: a.re / n,
  im: a.im / n,
});
const cxAbs = (a: Vec2): number => Math.sqrt(a.re * a.re + a.im * a.im);

// --- Constants ---
const e0 = 8.854187e-12;
const RAD = 50;
const RESOLUTION = 50;
const MAX_PARTICLES = 15;
const HIT_RADIUS = 30;
const FLUX_COLOR = 'rgb(204,255,255)';

// --- Types ---
interface ParticleState {
  pos: Vec2;
  charge: number;
  label: string;
  dragging: boolean;
  rollover: boolean;
  offsetX: number;
  offsetY: number;
}

// --- Physics ---
function electricField(pos: Vec2, particles: ParticleState[]): Vec2 {
  let res = cx(0, 0);
  for (const p of particles) {
    const r = cxSub(pos, p.pos);
    const rAbs = cxAbs(r);
    if (rAbs * 2.5 < RAD && p.charge < 0) return cx(0, 0);
    const ur = cxScaleDiv(r, rAbs);
    res = cxAdd(res, cxScale(ur, p.charge / (rAbs * rAbs)));
  }
  return cxScaleDiv(res, 4 * Math.PI * e0);
}

function getFieldColor(alpha: number): string {
  if (alpha < 0) return 'rgb(255,0,0)';
  if (alpha > 1) return 'rgb(0,0,255)';
  if (alpha < 0.5) {
    const red = Math.round(mapRange(alpha, 0, 0.5, 150, 200));
    return `rgb(200,120,${red})`;
  }
  const green = Math.round(mapRange(alpha, 0.5, 1, 200, 150));
  return `rgb(120,${green},200)`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// --- Drawing ---

// Mirrors Plotter.drawSimpleArrow from the original (isNorm=false, so len=1, factor=4)
function drawSimpleArrow(
  ctx: CanvasRenderingContext2D,
  cp1: Vec2,
  cp2: Vec2,
  col: string,
) {
  const v1 = cxSub(cp2, cp1);
  const factor = 4; // mapRange(1, 0, 50, 0, 200) — len=1 since isNorm is false

  const rotor = cxFromPolar(1, Math.PI / 8);
  const rotorInv = cxFromPolar(1, -Math.PI / 8);

  const pA = cxSub(cp2, cxScaleDiv(cxMul(v1, rotor), factor));
  const pB = cxSub(cp2, cxScaleDiv(cxMul(v1, rotorInv), factor));
  const newP2 = cxScaleDiv(cxAdd(pA, pB), 2);
  const sw = Math.max(1, cxAbs(cxSub(pA, pB)) / 4);

  ctx.strokeStyle = col;
  ctx.lineWidth = sw;
  ctx.beginPath();
  ctx.moveTo(cp1.re, cp1.im);
  ctx.lineTo(newP2.re, newP2.im);
  ctx.stroke();

  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cp2.re, cp2.im);
  ctx.lineTo(pA.re, pA.im);
  ctx.lineTo(pB.re, pB.im);
  ctx.closePath();
  ctx.fill();
}

// Mirrors Plotter.drawArrowTip from the original
function drawArrowTip(
  ctx: CanvasRenderingContext2D,
  p1: Vec2,
  p2: Vec2,
  col: string,
  len: number,
) {
  const diff = cxSub(p2, p1);
  const d = cxAbs(diff);
  if (d < 1e-10) return;
  const v1 = cxScaleDiv(diff, d);

  const rotor = cxFromPolar(1, Math.PI / 8);
  const rotorInv = cxFromPolar(1, -Math.PI / 8);

  const pA = cxSub(p2, cxScale(cxMul(v1, rotor), len));
  const pB = cxSub(p2, cxScale(cxMul(v1, rotorInv), len));

  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.moveTo(p2.re, p2.im);
  ctx.lineTo(pA.re, pA.im);
  ctx.lineTo(pB.re, pB.im);
  ctx.closePath();
  ctx.fill();
}

// Mirrors Plotter.drawDirectedPath — polyline with periodic arrowheads
function drawDirectedPath(
  ctx: CanvasRenderingContext2D,
  path: Vec2[],
  col: string,
) {
  if (path.length < 2) return;

  const MAX_DIST = 150;
  const TIP_SIZE = 15;

  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(path[0].re, path[0].im);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].re, path[i].im);
  }
  ctx.stroke();

  let dist = 0;
  let prev = path[0];
  for (let i = 1; i < path.length; i++) {
    const curr = path[i];
    dist += cxAbs(cxSub(prev, curr));
    if (dist >= MAX_DIST) {
      drawArrowTip(ctx, prev, curr, col, TIP_SIZE);
      while (dist >= MAX_DIST) dist -= MAX_DIST;
    }
    prev = curr;
  }
}

// --- Sketch ---
export const sketch = ({
  wrap,
  context,
  canvas,
  width,
  height,
}: SketchProps) => {
  let pane: Pane;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      wrap.dispose();
      pane?.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const ctx = context as CanvasRenderingContext2D;

  let particles: ParticleState[] = [
    {
      pos: cx((3 * width) / 9, height / 2),
      charge: 1.602176e-19,
      label: '+',
      dragging: false,
      rollover: false,
      offsetX: 0,
      offsetY: 0,
    },
    {
      pos: cx((6 * width) / 9, height / 2),
      charge: -1.602176e-19,
      label: '-',
      dragging: false,
      rollover: false,
      offsetX: 0,
      offsetY: 0,
    },
  ];

  let moving: Vec2[] = [];
  let paths: Vec2[][] = [];

  function getCanvasPos(e: MouseEvent): Vec2 {
    const rect = canvas.getBoundingClientRect();
    return cx(
      ((e.clientX - rect.left) / rect.width) * width,
      ((e.clientY - rect.top) / rect.height) * height,
    );
  }

  function clearFlux() {
    moving.length = 0;
    paths.length = 0;
  }

  function addParticle(sign: 1 | -1) {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push({
      pos: cx(
        RAD * 2 + Math.random() * (width - RAD * 4),
        RAD * 2 + Math.random() * (height - RAD * 4),
      ),
      charge: sign * 1.602176e-19,
      label: sign > 0 ? '+' : '-',
      dragging: false,
      rollover: false,
      offsetX: 0,
      offsetY: 0,
    });
    clearFlux();
  }

  function removeParticle() {
    if (particles.length > 1) particles.pop();
    clearFlux();
  }

  function generatePaths() {
    const di = (Math.PI * 2) / 30;
    for (const p of particles) {
      if (p.charge > 0) {
        for (let j = 0; j <= Math.PI * 2; j += di) {
          const pt = cxAdd(p.pos, cxFromPolar(RAD / 4, j));
          moving.push({ ...pt });
          paths.push([{ ...pt }]);
        }
      }
    }
    const di1 = 70;
    for (let i = 0; i <= Math.max(width, height); i += di1) {
      if (i <= width) {
        moving.push(cx(i, 2));
        paths.push([cx(i, 2)]);
        moving.push(cx(i, height - 2));
        paths.push([cx(i, height - 2)]);
      }
      if (i <= height) {
        moving.push(cx(2, i));
        paths.push([cx(2, i)]);
        moving.push(cx(width - 2, i));
        paths.push([cx(width - 2, i)]);
      }
    }
  }

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const { re: mx, im: my } = getCanvasPos(e);
    let anyCursor = false;
    for (const p of particles) {
      p.rollover =
        Math.abs(mx - p.pos.re) < HIT_RADIUS &&
        Math.abs(my - p.pos.im) < HIT_RADIUS;
      if (p.dragging) {
        clearFlux();
        p.pos = cx(mx + p.offsetX, my + p.offsetY);
        canvas.style.cursor = 'grabbing';
        anyCursor = true;
      } else if (p.rollover) {
        canvas.style.cursor = 'grab';
        anyCursor = true;
      }
    }
    if (!anyCursor) canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const { re: mx, im: my } = getCanvasPos(e);
    for (const p of particles) {
      if (
        Math.abs(mx - p.pos.re) < HIT_RADIUS &&
        Math.abs(my - p.pos.im) < HIT_RADIUS
      ) {
        p.dragging = true;
        p.offsetX = p.pos.re - mx;
        p.offsetY = p.pos.im - my;
      }
    }
  });

  canvas.addEventListener('mouseup', () => {
    for (const p of particles) p.dragging = false;
  });

  pane = new Pane({ title: 'Electric Field' });
  pane.addButton({ title: 'Add (+)' }).on('click', () => addParticle(1));
  pane.addButton({ title: 'Add (-)' }).on('click', () => addParticle(-1));
  pane.addButton({ title: 'Remove' }).on('click', removeParticle);
  pane.addButton({ title: 'Draw Flux' }).on('click', generatePaths);
  pane.addButton({ title: 'Clear' }).on('click', clearFlux);

  wrap.render = ({ width, height }: SketchProps) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Draw electric field arrows
    for (let i = RESOLUTION; i < width; i += RESOLUTION) {
      for (let j = RESOLUTION; j < height; j += RESOLUTION) {
        const field = cxScale(electricField(cx(i, j), particles), 1e15);
        const eAbs = cxAbs(field);
        if (eAbs === 0) continue;
        const alpha = 1 - Math.exp(-eAbs / 50);
        const col = getFieldColor(alpha);
        const scaled = cxScale(field, (RESOLUTION * 0.6) / eAbs);
        drawSimpleArrow(ctx, cx(i, j), cx(i + scaled.re, j + scaled.im), col);
      }
    }

    // Step flux particles forward and draw their current positions
    for (let i = 0; i < moving.length; i++) {
      const p = moving[i];
      if (p.re < 0 || p.re > width || p.im < 0 || p.im > height) continue;
      const field = cxScale(electricField(p, particles), 1e15);
      const fieldAbs = cxAbs(field);
      if (fieldAbs === 0) continue;
      const step = cxScale(field, clamp(fieldAbs, 6, 15) / fieldAbs);
      moving[i] = cxAdd(p, step);
      paths[i].push({ ...moving[i] });
      // dot at head
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(moving[i].re, moving[i].im, 5, 0, Math.PI * 2);
      ctx.fill();
      if (step.re === 0 && step.im === 0) moving[i] = cx(-1, p.im);
    }

    // Draw full flux paths
    for (const path of paths) {
      drawDirectedPath(ctx, path, FLUX_COLOR);
    }

    // Draw charged particles
    for (const p of particles) {
      ctx.lineWidth = 4;
      if (p.charge < 0) {
        ctx.strokeStyle = 'rgb(198,74,75)';
        ctx.fillStyle = p.dragging
          ? 'rgba(223,149,139,0.39)'
          : p.rollover
            ? 'rgba(223,149,139,0.70)'
            : 'rgb(223,149,139)';
      } else {
        ctx.strokeStyle = 'rgb(27,117,8)';
        ctx.fillStyle = p.dragging
          ? 'rgba(103,145,203,0.39)'
          : p.rollover
            ? 'rgba(103,145,203,0.63)'
            : 'rgb(103,145,203)';
      }
      ctx.beginPath();
      ctx.arc(p.pos.re, p.pos.im, RAD / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'white';
      ctx.font = `bold ${RAD * 0.6}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, p.pos.re, p.pos.im);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);
