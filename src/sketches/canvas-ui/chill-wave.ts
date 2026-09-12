import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { createShell, type Camera, type Pt, type SceneView } from '../../ui';

/**
 * Chill wave: a looping dashed sine-like stroke built from cubic segments that
 * travels across the whole grid. Ported from a 1080² canvas-sketch piece (minus
 * its right-hand wipe mask); the wave colour is driven by hue / saturation /
 * lightness sliders, `amplitude` scales its height and `wavelength` stretches
 * it horizontally. The wave sits directly on the shell's paper and grid.
 */

/** Original canvas pixels per world unit (1080 px canvas → 4 grid cells). */
const PX_PER_UNIT = 270;

// --- Geometry (original pixel values, kept verbatim so the segment shape is unchanged)
const H = 160;
const A = H / 4;
const STEPS = 7;
const SHIFT = 2;
const M = 0.512286623256592433;

/**
 * Path commands of one rising segment — the dash length is measured from this.
 * Every horizontal delta (the `A`-based x steps and the control-point x offsets)
 * is scaled by `wl` (wavelength); `a` is the scaled amplitude.
 */
const startCommands = (x0: number, y0: number, a: number, wl: number) => [
  'M', x0, y0,
  'c', A * M * wl, 0, -(1 - A) * M * wl, -a, A * wl, -a,
];

/** The full wave: a start segment plus `STEPS` smooth up/down pairs. */
const waveCommands = (x0: number, y0: number, a: number, wl: number) => [
  ...startCommands(x0, y0, a, wl),
  ...new Array(STEPS)
    .fill(0)
    .flatMap(() => [
      's', -(1 - A) * M * wl, a, A * wl, a,
      's', -(1 - A) * M * wl, -a, A * wl, -a,
    ]),
];

/** Arc length of the start segment in original pixels, via an SVG path (as the original did). */
const measureEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
const measureSegment = (a: number, wl: number): number => {
  measureEl.setAttribute('d', startCommands(0, 0, a, wl).join(' '));
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
      { id: 'wavelength', label: 'wavelength', min: 0.5, max: 2, value: 1, step: 0.05, knobColor: '#e8541e' },
    ],
    // Six sliders are taller than the default panel slot: lift it clear of the bottom
    // edge and park it in the toolbar's column so it doesn't sit on top of the wave.
    panel: { x: 52, y: height - 560 },
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
  const worldPathData = (x0: number, y0: number, a: number, wl: number): string => {
    const cmds = waveCommands(x0, y0, a, wl);
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

  let playhead = 0;

  const drawScene = (ctx: CanvasRenderingContext2D, cam: Camera, view: SceneView) => {
    const { hue, saturation, lightness, weight, amplitude, wavelength } = view.params;
    const k = view.magnification;
    const color = `hsl(${hue} ${saturation}% ${lightness}%)`;
    // Scaled amplitude (original a = h/4) and wavelength (×1 = the original period).
    // The start offset and the measured segment follow the wavelength so dashes stay aligned.
    const a = A * amplitude;
    const wl = wavelength;
    const segmentLength = measureSegment(a, wl);

    // The wave, built in world units and mapped to screen pixels so dashes are in px
    const x0 = ((-STEPS / 2) * A - SHIFT * A * playhead) * wl;
    const y0 = H / 2 + a / 2;
    const path = new Path2D();
    path.addPath(new Path2D(worldPathData(x0, y0, a, wl)), worldMatrix(cam));

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
