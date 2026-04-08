import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Pane } from 'tweakpane';
import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';

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

// --- Types ---
interface ParticleState {
  pos: Vec2;
  charge: number;
  label: string;
  dragging: boolean;
  rollover: boolean;
  offsetX: number;
  offsetY: number;
  color: string;
}

// --- Physics ---
function electricField(pos: Vec2, particles: ParticleState[]): Vec2 {
  let res = cx(0, 0);
  for (const p of particles) {
    const r = cxSub(pos, p.pos);
    const rAbs = cxAbs(r);
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

/**
 * Draw a directed polyline with a linear gradient between colorStart and colorEnd,
 * with periodic arrowheads interpolated along the path.
 */
function drawDirectedPath(
  ctx: CanvasRenderingContext2D,
  path: Vec2[],
  colorStart: string,
  colorEnd: string,
  widths: number[],
) {
  if (path.length < 2) return;

  const x0 = path[0].re;
  const y0 = path[0].im;
  const xN = path[path.length - 1].re;
  const yN = path[path.length - 1].im;

  // Gradient defined in canvas-space — still applies correctly per segment
  const grad = ctx.createLinearGradient(x0, y0, xN, yN);
  grad.addColorStop(0, colorStart);
  grad.addColorStop(1, colorEnd);
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';

  for (let i = 1; i < path.length; i++) {
    const w = (widths[i - 1] + (widths[i] ?? widths[i - 1])) / 2;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(path[i - 1].re, path[i - 1].im);
    ctx.lineTo(path[i].re, path[i].im);
    ctx.stroke();
  }
}

/**
 * Linearly interpolate between two CSS color strings (supports rgb(...) and hex).
 * Falls back to colorStart on parse failure.
 */
function lerpColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseColor(color: string): [number, number, number] | null {
  // rgb(r,g,b) or rgba(r,g,b,a)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3]),
    ];
  }
  // hex #rrggbb or #rgb
  const hexMatch = color.match(/^#([0-9a-fA-F]{3,6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
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

  // Generate palette once; cycle through colors for each particle
  const palette: string[] = randomPalette();
  const bg = palette.pop()!;

  let particles: ParticleState[] = palette.map((c) =>
    randomParticle(Random.pick([1, -1]) as 1 | -1, c),
  );

  // let particles: ParticleState[] = [
  //   {
  //     pos: cx((3 * width) / 9, height / 2),
  //     charge: 1.602176e-19,
  //     label: '+',
  //     dragging: false,
  //     rollover: false,
  //     offsetX: 0,
  //     offsetY: 0,
  //     color: palette[0],
  //   },
  //   {
  //     pos: cx((6 * width) / 9, height / 2),
  //     charge: -1.602176e-19,
  //     label: '-',
  //     dragging: false,
  //     rollover: false,
  //     offsetX: 0,
  //     offsetY: 0,
  //     color: palette[1 % palette.length],
  //   },
  // ];

  let moving: Vec2[] = [];
  let paths: Vec2[][] = [];
  // Track which particle index "owns" each path (for gradient color)
  let pathOwners: number[] = [];
  // Per-point stroke widths: thick where sparse, thin where dense
  let pathWidths: number[][] = [];

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
    pathOwners.length = 0;
    pathWidths.length = 0;
  }

  function randomParticle(sign: 1 | -1, color: string) {
    return {
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
      color,
    };
  }

  function addParticle(sign: 1 | -1) {
    if (particles.length >= MAX_PARTICLES) return;
    const colorIndex = particles.length % palette.length;
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
      color: palette[colorIndex],
    });
    clearFlux();
  }

  function removeParticle() {
    if (particles.length > 1) particles.pop();
    clearFlux();
  }

  function fieldWidth(pos: Vec2): number {
    const f = cxScale(electricField(pos, particles), 1e15);
    const mag = cxAbs(f);
    return clamp(
      params.widthFalloff / (mag + 1),
      params.minWidth,
      params.maxWidth,
    );
  }

  function generatePaths() {
    const di = (Math.PI * 2) / 30;
    for (let pi = 0; pi < particles.length; pi++) {
      const p = particles[pi];
      if (p.charge > 0) {
        for (let j = 0; j <= Math.PI * 2; j += di) {
          const pt = cxAdd(p.pos, cxFromPolar(RAD / 4, j));
          moving.push({ ...pt });
          paths.push([{ ...p.pos }, { ...pt }]);
          pathOwners.push(pi);
          pathWidths.push([params.minWidth, fieldWidth(pt)]);
        }
      }
    }
    const di1 = 70;
    for (let i = 0; i <= Math.max(width, height); i += di1) {
      // Edge seeds have no owner — use index -1, will fall back to first particle color
      if (i <= width) {
        moving.push(cx(i, 2));
        paths.push([cx(i, 2)]);
        pathOwners.push(-1);
        pathWidths.push([fieldWidth(cx(i, 2))]);
        moving.push(cx(i, height - 2));
        paths.push([cx(i, height - 2)]);
        pathOwners.push(-1);
        pathWidths.push([fieldWidth(cx(i, height - 2))]);
      }
      if (i <= height) {
        moving.push(cx(2, i));
        paths.push([cx(2, i)]);
        pathOwners.push(-1);
        pathWidths.push([fieldWidth(cx(2, i))]);
        moving.push(cx(width - 2, i));
        paths.push([cx(width - 2, i)]);
        pathOwners.push(-1);
        pathWidths.push([fieldWidth(cx(width - 2, i))]);
      }
    }
  }

  /**
   * Find the nearest particle to a given point and return its color.
   */
  function nearestParticleColor(pos: Vec2): string {
    let best = Infinity;
    let col = palette[0];
    for (const p of particles) {
      const d = cxAbs(cxSub(pos, p.pos));
      if (d < best) {
        best = d;
        col = p.color;
      }
    }
    return col;
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

  const params = {
    showParticles: false,
    showArrows: false,
    minWidth: 0,
    maxWidth: 12 * 2,
    widthFalloff: 256, //80,
    stepMin: 2,
    stepMax: 6,
  };

  pane = new Pane({ title: 'Electric Field' });
  pane.addButton({ title: 'Add (+)' }).on('click', () => addParticle(1));
  pane.addButton({ title: 'Add (-)' }).on('click', () => addParticle(-1));
  pane.addButton({ title: 'Remove' }).on('click', removeParticle);
  pane.addButton({ title: 'Draw Flux' }).on('click', generatePaths);
  pane.addButton({ title: 'Clear' }).on('click', clearFlux);
  pane.addBinding(params, 'showParticles', { label: 'Show Particles' });
  pane.addBinding(params, 'showArrows', { label: 'Show Arrows' });
  pane.addBinding(params, 'minWidth', {
    label: 'Min Width',
    min: 0.1,
    max: 10,
    step: 0.1,
  });
  pane.addBinding(params, 'maxWidth', {
    label: 'Max Width',
    min: 0.1,
    max: 200,
    step: 0.1,
  });
  pane.addBinding(params, 'widthFalloff', {
    label: 'Width Falloff',
    min: 1,
    max: 500,
    step: 1,
  });
  pane.addBinding(params, 'stepMin', {
    label: 'Step Min',
    min: 0.5,
    max: 20,
    step: 0.5,
  });
  pane.addBinding(params, 'stepMax', {
    label: 'Step Max',
    min: 0.5,
    max: 50,
    step: 0.5,
  });

  wrap.render = ({ width, height, frame }: SketchProps) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (frame === 0) {
      generatePaths();
    }

    // Draw electric field arrows
    if (params.showArrows) {
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
    }

    // Step flux particles forward and draw their current positions
    for (let i = 0; i < moving.length; i++) {
      const p = moving[i];
      if (p.re < 0 || p.re > width || p.im < 0 || p.im > height) continue;

      // Snap to negative particle center and terminate when close enough
      let absorbed = false;
      for (const particle of particles) {
        if (particle.charge < 0 && cxAbs(cxSub(p, particle.pos)) < RAD * 0.4) {
          paths[i].push({ ...particle.pos });
          pathWidths[i].push(params.minWidth);
          moving[i] = cx(-1, p.im);
          absorbed = true;
          break;
        }
      }
      if (absorbed) continue;

      const field = cxScale(electricField(p, particles), 1e15);
      const fieldAbs = cxAbs(field);
      if (fieldAbs === 0) continue;
      const step = cxScale(
        field,
        clamp(fieldAbs, params.stepMin, params.stepMax) / fieldAbs,
      );
      moving[i] = cxAdd(p, step);
      paths[i].push({ ...moving[i] });
      pathWidths[i].push(
        clamp(
          params.widthFalloff / (fieldAbs + 1),
          params.minWidth,
          params.maxWidth,
        ),
      );
      if (step.re === 0 && step.im === 0) moving[i] = cx(-1, p.im);
    }

    // Draw full flux paths with gradient between particle colors
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.length < 2) continue;
      const ownerIdx = pathOwners[i];
      const colorStart = ownerIdx >= 0 ? particles[ownerIdx].color : palette[0];
      const colorEnd = nearestParticleColor(path[path.length - 1]);
      drawDirectedPath(ctx, path, colorStart, colorEnd, pathWidths[i]);
    }

    // Draw charged particles
    if (!params.showParticles) return;
    for (const p of particles) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.dragging
        ? p.color + '64'
        : p.rollover
          ? p.color + 'b3'
          : p.color;
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
