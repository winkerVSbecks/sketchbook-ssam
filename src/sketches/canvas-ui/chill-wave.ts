import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { createShell, type Camera, type Pt, type SceneView } from '../../ui';

/**
 * Chill wave: a looping dashed sine-like stroke built from cubic segments, wiped
 * on the right by a paper-coloured mask. Ported from a 1080² canvas-sketch piece;
 * the wave colour is driven by hue / saturation / lightness sliders and the wave
 * sits directly on the shell's paper and grid.
 */

const clrs = {
  /** Wipe-mask colour: the shell's default paper, so the wipe reads clean against the chrome. */
  paper: '#f6f6f5',
};

/** Original canvas pixels per world unit (1080 px canvas → 4 grid cells). */
const PX_PER_UNIT = 270;

// --- Geometry (original pixel values, kept verbatim so the segment shape is unchanged)
const W = 260;
const H = 160;
const A = H / 4;
const STEPS = 7;
const SHIFT = 2;
const M = 0.512286623256592433;

/**
 * Path commands of one rising segment — the dash length is measured from this.
 * Horizontal advances keep the original `A` (fixed period); `a` is the scaled amplitude.
 */
const startCommands = (x0: number, y0: number, a: number) => [
  'M', x0, y0,
  'c', A * M, 0, -(1 - A) * M, -a, A, -a,
];

/** The full wave: a start segment plus `STEPS` smooth up/down pairs. */
const waveCommands = (x0: number, y0: number, a: number) => [
  ...startCommands(x0, y0, a),
  ...new Array(STEPS)
    .fill(0)
    .flatMap(() => ['s', -(1 - A) * M, a, A, a, 's', -(1 - A) * M, -a, A, -a]),
];

/** Arc length of the start segment in original pixels, via an SVG path (as the original did). */
const measureEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
const measureSegment = (a: number): number => {
  measureEl.setAttribute('d', startCommands(0, 0, a).join(' '));
  return measureEl.getTotalLength();
};

export const sketch = ({ wrap, context, canvas, width, height, pixelRatio, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      shell.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const shell = createShell({
    ctx: context,
    canvas,
    width,
    height,
    pixelRatio,
    grid: { cols: 4, subdivisions: 6, xOrigin: 'right' },
    params: [
      { id: 'hue', label: 'hue', min: 0, max: 360, value: 260, step: 1, knobColor: '#8a5cf5' },
      { id: 'saturation', label: 'saturation', min: 0, max: 100, value: 80, step: 1, knobColor: '#e8541e' },
      { id: 'lightness', label: 'lightness', min: 0, max: 100, value: 60, step: 1, knobColor: '#111111' },
      { id: 'weight', label: 'weight', min: 1, max: 40, value: 12, step: 0.5 },
      { id: 'amplitude', label: 'Amplitude', min: 0.2, max: 2, value: 1, step: 0.05, knobColor: '#8a5cf5' },
    ],
    // Five sliders are taller than the default panel slot — lift it clear of the bottom edge
    panel: { y: height - 480 },
    onChange: () => props.render(),
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      shell,
      camera: shell.camera,
      loupe: shell.loupe,
      repaint: () => props.render(),
    };
  }

  // The original drew in a frame translated to (centre.x, centre.y - H/2), y down.
  // Map that local pixel frame into world units about the fit centre, flipping
  // axes as the camera does so the piece reads the same way as the original.
  const cam0 = shell.camera;
  const sx = cam0.flipX ? -1 : 1;
  const sy = cam0.flipY ? -1 : 1;
  const toWorld = (lx: number, ly: number): Pt => ({
    x: cam0.fitCenter.x + (sx * lx) / PX_PER_UNIT,
    y: cam0.fitCenter.y + (sy * (ly - H / 2)) / PX_PER_UNIT,
  });

  /** SVG path data in world units for the wave starting at local (x0, y0). */
  const worldPathData = (x0: number, y0: number, a: number): string => {
    const cmds = waveCommands(x0, y0, a);
    const out: (string | number)[] = [];
    let i = 0;
    while (i < cmds.length) {
      const c = cmds[i++] as string;
      out.push(c);
      if (c === 'M') {
        const p = toWorld(cmds[i++] as number, cmds[i++] as number);
        out.push(p.x, p.y);
      } else {
        // 'c' and 's' are relative: scale the deltas, flipping per axis
        const n = c === 'c' ? 6 : 4;
        for (let k = 0; k < n; k += 2) {
          out.push((sx * (cmds[i++] as number)) / PX_PER_UNIT, (sy * (cmds[i++] as number)) / PX_PER_UNIT);
        }
      }
    }
    return out.join(' ');
  };

  /** Affine world → screen matrix for `cam` (sampled from `worldToScreen`). */
  const worldMatrix = (cam: Camera): DOMMatrix => {
    const o = cam.worldToScreen({ x: 0, y: 0 });
    const ex = cam.worldToScreen({ x: 1, y: 0 });
    const ey = cam.worldToScreen({ x: 0, y: 1 });
    return new DOMMatrix([ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y]);
  };

  /** Build a rect (local pixel frame) as a world-space path, then leave the context in screen space. */
  const localRect = (ctx: CanvasRenderingContext2D, cam: Camera, x0: number, y0: number, x1: number, y1: number) => {
    const a = toWorld(x0, y0);
    const b = toWorld(x1, y1);
    ctx.save();
    cam.apply(ctx);
    ctx.beginPath();
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  };

  let playhead = 0;

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { hue, saturation, lightness, weight, amplitude } = view.params;
    const k = view.magnification;
    const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
    // Scaled amplitude: original a = h/4; the horizontal period and the mask are unchanged
    const a = A * amplitude;
    const segmentLength = measureSegment(a);

    // The wave, built in world units and mapped to screen pixels so dashes are in px
    const x0 = (-STEPS / 2) * A - SHIFT * A * playhead;
    const y0 = H / 2 + a / 2;
    const path = new Path2D();
    path.addPath(new Path2D(worldPathData(x0, y0, a)), worldMatrix(cam));

    const len = (segmentLength * cam.scale) / PX_PER_UNIT;
    ctx.save();
    ctx.strokeStyle = view.magnified ? shell.hatch(color) : color;
    ctx.lineWidth = weight * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([len * STEPS, len * SHIFT, 0, len * STEPS]);
    ctx.lineDashOffset = -SHIFT * len * playhead;
    ctx.stroke(path);
    ctx.restore();

    // Right-hand wipe mask, in the shell's paper colour
    localRect(ctx, cam, W * 0.7, 0, W * 3, H);
    ctx.fillStyle = clrs.paper;
    ctx.fill();
  };

  wrap.render = (p: SketchProps) => {
    playhead = p?.playhead ?? playhead;
    shell.render(drawScene);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
