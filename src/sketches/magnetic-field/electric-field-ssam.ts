import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

// Single-file conversion of the p5.js Electric Field sketch to an ssam 2D canvas sketch.
// Implements minimal Complex math, particle interactions, field arrows, and streamline paths.

// ---------- Math utils ----------
const PI = Math.PI;
const TAU = Math.PI * 2;

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clip(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

class Complex {
  re: number;
  im: number;
  constructor(re: number | { abs: number; arg: number }, im?: number) {
    if (typeof re === 'number') {
      this.re = re;
      this.im = im ?? 0;
    } else {
      // Polar
      this.re = re.abs * Math.cos(re.arg);
      this.im = re.abs * Math.sin(re.arg);
    }
  }
  add(o: Complex) {
    return new Complex(this.re + o.re, this.im + o.im);
  }
  sub(o: Complex) {
    return new Complex(this.re - o.re, this.im - o.im);
  }
  mul(s: number | Complex) {
    if (typeof s === 'number') return new Complex(this.re * s, this.im * s);
    return new Complex(
      this.re * s.re - this.im * s.im,
      this.re * s.im + this.im * s.re
    );
  }
  div(s: number) {
    return new Complex(this.re / s, this.im / s);
  }
  abs() {
    return Math.hypot(this.re, this.im);
  }
  arg() {
    return Math.atan2(this.im, this.re);
  }
  conjugate() {
    return new Complex(this.re, -this.im);
  }
  unit() {
    const a = this.abs();
    return a === 0 ? new Complex(0, 0) : this.div(a);
  }
}

// ---------- Drawing helpers (Canvas 2D) ----------
function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  txt: string,
  x: number,
  y: number
) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y);
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  p: Complex,
  color = '#fff',
  size = 3
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.re, p.im, size, 0, TAU);
  ctx.fill();
}

function drawSimpleArrow(
  ctx: CanvasRenderingContext2D,
  from: Complex,
  to: Complex,
  color: string,
  nrm = 4
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(from.re, from.im);
  ctx.lineTo(to.re, to.im);
  ctx.stroke();

  // Tip
  const v = to.sub(from);
  const len = v.abs() || 1;
  const u = v.div(len);
  const tip = to;
  const left = new Complex(
    u.re * -nrm - u.im * nrm + tip.re,
    u.im * -nrm + u.re * nrm + tip.im
  );
  const right = new Complex(
    u.re * -nrm + u.im * nrm + tip.re,
    u.im * -nrm - u.re * nrm + tip.im
  );
  ctx.beginPath();
  ctx.moveTo(tip.re, tip.im);
  ctx.lineTo(left.re, left.im);
  ctx.lineTo(right.re, right.im);
  ctx.closePath();
  ctx.fill();
}

// ---------- Simulation types ----------
type ChargeSign = -1 | 1;

class Particle {
  rad: number;
  label: string;
  mass: number;
  charge: number;
  pos: Complex;
  dragging = false;
  rollover = false;
  bs = 30; // hit box radius
  offsetX = 0;
  offsetY = 0;

  constructor(rad: number, sign: ChargeSign, initPos: Complex) {
    this.rad = rad;
    if (sign < 0) {
      this.label = '-';
      this.mass = 9.109382e-31;
      this.charge = -1.602176e-19;
    } else {
      this.label = '+';
      this.mass = 1.672621e-27;
      this.charge = 1.602176e-19;
    }
    this.pos = initPos;
  }

  hit(mx: number, my: number) {
    return (
      mx > this.pos.re - this.bs &&
      mx < this.pos.re + this.bs &&
      my > this.pos.im - this.bs &&
      my < this.pos.im + this.bs
    );
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = 4;

    const isNeg = this.charge < 0;
    if (isNeg) {
      ctx.strokeStyle = 'rgb(198, 74, 75)';
      if (this.dragging) {
        ctx.fillStyle = 'rgba(223, 149, 139, 0.4)';
      } else if (this.rollover) {
        ctx.fillStyle = 'rgba(223, 149, 139, 0.7)';
      } else {
        ctx.fillStyle = 'rgb(223, 149, 139)';
      }
    } else {
      ctx.strokeStyle = 'rgb(27, 117, 8)';
      if (this.dragging) {
        ctx.fillStyle = 'rgba(103, 145, 203, 0.4)';
      } else if (this.rollover) {
        ctx.fillStyle = 'rgba(103, 145, 203, 0.6)';
      } else {
        ctx.fillStyle = 'rgb(103, 145, 203)';
      }
    }

    drawCircle(ctx, this.pos.re, this.pos.im, this.rad);

    if (this.rad > 10) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      drawTextCentered(ctx, this.label, this.pos.re, this.pos.im);
    }
  }
}

// ---------- Sketch ----------
export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  document.title = 'Electric Field (ssam)';

  // Constants
  const e0 = 8.854187e-12;
  const RAD = 50;

  // State
  let W = width;
  let H = height;
  let isFixed = true; // if false, first particle follows mouse
  let potDraw = false; // whether to generate streamline paths
  let system: Particle[] = [];
  let moving: Complex[] = [];
  let paths: Complex[][] = [];
  let mouseX = 0;
  let mouseY = 0;
  // Note: we don't need a pressed flag beyond drag state on particles

  // Initialize two charges
  function addParticle(sign: ChargeSign) {
    const p = new Particle(
      RAD,
      sign,
      new Complex(
        randRange(RAD * 2, W - RAD * 2),
        randRange(RAD * 2, H - RAD * 2)
      )
    );
    system.push(p);
  }

  addParticle(1);
  addParticle(-1);
  // Set initial positions like the p5 sketch
  system[0].pos.re = (3 * W) / 9;
  system[0].pos.im = H / 2;
  system[1].pos.re = (6 * W) / 9;
  system[1].pos.im = H / 2;

  // Field function E at position
  function E(pos: Complex) {
    let res = new Complex(0, 0);
    for (let i = 0; i < system.length; i++) {
      const p = system[i];
      const r = pos.sub(p.pos);
      const rAbs = r.abs();
      if (rAbs * 2.5 < RAD && p.charge < 0) {
        return new Complex(0, 0);
      }
      const ur = r.div(rAbs || 1);
      res = res.add(ur.mul(p.charge / ((rAbs || 1) * (rAbs || 1))));
    }
    return res.div(4 * PI * e0);
  }

  function getColor(alpha: number): string {
    if (alpha < 0) return 'rgb(255, 0, 0)';
    if (alpha > 1) return 'rgb(0, 0, 255)';
    if (alpha < 0.5) {
      const red = Math.trunc(((alpha - 0) / 0.5) * (200 - 150) + 150);
      return `rgb(200, 120, ${red})`;
    } else {
      const green = Math.trunc(((alpha - 0.5) / 0.5) * (150 - 200) + 200);
      return `rgb(120, ${green}, 200)`;
    }
  }

  function drawField(ctx: CanvasRenderingContext2D) {
    const resolution = 50;
    for (let i = resolution; i < W; i += resolution) {
      for (let j = resolution; j < H; j += resolution) {
        let elect = E(new Complex(i, j)).mul(1e15);
        const eAbs = elect.abs();
        const col = getColor(1 - Math.exp(-eAbs / 50));
        elect = elect.mul(((resolution * 0.6) / (eAbs || 1)) as number);
        drawSimpleArrow(
          ctx,
          new Complex(i, j),
          new Complex(i + elect.re, j + elect.im),
          col
        );
      }
    }
  }

  function clearScreen() {
    potDraw = false;
    moving.length = 0;
    paths.length = 0;
  }

  function generatePaths() {
    const di = TAU / 30;

    for (let i = 0; i < system.length; i++) {
      const p = system[i];
      if (p.charge > 0) {
        for (let ang = 0; ang <= TAU + 1e-6; ang += di) {
          const pt = p.pos.add(new Complex({ abs: RAD / 4, arg: ang }));
          moving.push(pt);
          paths.push([pt]);
        }
      }
    }

    const di1 = 70;
    for (let i = 0; i <= W || i <= H; i += di1) {
      if (i <= W) {
        moving.push(new Complex(i, 2));
        paths.push([new Complex(i, 2)]);
        moving.push(new Complex(i, H - 2));
        paths.push([new Complex(i, H - 2)]);
      }
      if (i <= H) {
        moving.push(new Complex(2, i));
        paths.push([new Complex(2, i)]);
        moving.push(new Complex(W - 2, i));
        paths.push([new Complex(W - 2, i)]);
      }
    }
  }

  function updateMovingParticles(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < moving.length; i++) {
      const p = moving[i];
      if (!(p.re < 0 || p.re > W || p.im < 0 || p.im > H)) {
        let elect = E(p).mul(1e15);
        const len = clip(elect.abs(), 6, 15);
        elect = elect.mul(len / (elect.abs() || 1));
        moving[i] = p.add(elect);
        drawPoint(ctx, moving[i], '#ccffff', 2);
        paths[i].push(moving[i]);

        if (elect.re === 0 && elect.im === 0) {
          moving[i].re = -1; // mark off-screen
        }
      }
    }
  }

  // ---------- Events ----------
  function updateHoverCursor() {
    const over = system.some((p) => p.hit(mouseX, mouseY));
    canvas.style.cursor = over ? 'pointer' : 'default';
  }

  function onMouseDown(ev: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (ev.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (ev.clientY - rect.top) * (canvas.height / rect.height);

    for (const drag of system) {
      if (drag.hit(mouseX, mouseY)) {
        drag.dragging = true;
        drag.offsetX = drag.pos.re - mouseX;
        drag.offsetY = drag.pos.im - mouseY;
      }
    }
  }
  function onMouseUp() {
    for (const drag of system) drag.dragging = false;
  }
  function onMouseMove(ev: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (ev.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (ev.clientY - rect.top) * (canvas.height / rect.height);

    for (const e of system) {
      e.rollover = e.hit(mouseX, mouseY);
      if (e.dragging) {
        clearScreen();
        e.pos.re = mouseX + e.offsetX;
        e.pos.im = mouseY + e.offsetY;
      }
    }
    updateHoverCursor();
  }

  function onKeyDown(ev: KeyboardEvent) {
    const code = ev.code;
    if (code === 'KeyF') {
      potDraw = true;
      if (potDraw) generatePaths();
    } else if (code === 'KeyC') {
      clearScreen();
    } else if (code === 'KeyQ') {
      isFixed = !isFixed;
    } else if (code === 'Equal' || ev.key === '+') {
      if (system.length < 15) {
        const p = new Particle(
          RAD,
          1,
          new Complex(
            randRange(RAD * 2, W - RAD * 2),
            randRange(RAD * 2, H - RAD * 2)
          )
        );
        system.push(p);
      }
      clearScreen();
    } else if (code === 'Minus' || ev.key === '-') {
      if (system.length < 15) {
        const p = new Particle(
          RAD,
          -1,
          new Complex(
            randRange(RAD * 2, W - RAD * 2),
            randRange(RAD * 2, H - RAD * 2)
          )
        );
        system.push(p);
      }
      clearScreen();
    } else if (code === 'Digit0' || ev.key === '0') {
      if (system.length > 0) system.pop();
      clearScreen();
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', onKeyDown);

  // ---------- Render Loop ----------
  wrap.render = ({ width, height }: SketchProps) => {
    W = width;
    H = height;

    // Follow mouse when not fixed
    if (!isFixed && system[0]) {
      system[0].pos = new Complex(mouseX, mouseY);
    }

    // Background
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    // Field
    drawField(context);

    // Streamlines
    updateMovingParticles(context);
    context.strokeStyle = 'rgb(204,255,255)';
    context.lineWidth = 2;
    for (const path of paths) {
      if (path.length < 2) continue;
      context.beginPath();
      context.moveTo(path[0].re, path[0].im);
      for (let i = 1; i < path.length; i++)
        context.lineTo(path[i].re, path[i].im);
      context.stroke();
    }

    // Particles
    for (const e of system) e.draw(context);
  };

  wrap.resize = ({ width, height }: SketchProps) => {
    W = width;
    H = height;
    clearScreen();
  };

  wrap.unload = () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKeyDown);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
