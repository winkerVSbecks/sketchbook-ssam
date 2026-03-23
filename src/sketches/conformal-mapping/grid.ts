import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';

/**
 * The core idea
 *
 * Every point on a 2D grid is treated as a complex number z = x + iy. The sketch applies
 * f(z) = z² to each point and draws the result side-by-side with the original.
 *
 *   ---
 *
 *   Complex number math
 *
 *   function transform(z: Complex): Complex {
 *     return {
 *       re: z.re * z.re - z.im * z.im,  // Re(z²) = x² - y²
 *       im: 2 * z.re * z.im,             // Im(z²) = 2xy
 *     };
 *   }
 *
 *   This is just the algebraic expansion of (x + iy)².
 *
 *   ---
 *
 *   Grid representation
 *
 *   The grid is two families of lines:
 *   - Horizontal lines (hLines) — fixed imaginary part, varying real part
 *   - Vertical lines (vLines) — fixed real part, varying imaginary part
 *
 *   Each line is an array of 200 sampled Complex points across [-1.5, 1.5]. After
 *   generating them, each point is run through transform() to produce the mapped versions (hLinesT,
 *   vLinesT).
 *
 *   ---
 *
 *   Drawing
 *
 *   toCanvas() converts a complex number to pixel coordinates — real part maps to x,
 *  imaginary part maps to y (flipped, since canvas y increases downward).
 *
 *   The canvas is split in half:
 *   - Left — original grid at inputScale (sized to fit ±1.5)
 *   - Right — transformed grid at outputScale (sized to fit ±4.5, since Im(z²) reaches ±2·1.5·1.5 = 4.5)
 *
 *   The two colors (coral/blue) distinguish horizontal vs vertical line families, making
 *   it easy to see how each family deforms through the mapping.
 *
 *   ---
 *   What you'll see
 *
 *   Straight horizontal/vertical lines on the left become parabolas on the right — a classic property of z².
 *   The two families remain perpendicular after mapping (that's what
 *   "conformal" means: angle-preserving).
 */

interface Complex {
  re: number;
  im: number;
}

interface Transform {
  fn: (z: Complex) => Complex;
  label: string;
  inputExtentRe: number;
  inputExtentIm: number;
  outputExtent: number;
}

const transforms: Record<string, Transform> = {
  z2: {
    label: 'z²',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 4.5,
    fn: (z) => ({ re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }),
  },
  inv_z: {
    label: '1/z',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 3,
    fn: (z) => {
      const d = z.re * z.re + z.im * z.im;
      return { re: z.re / d, im: -z.im / d };
    },
  },
  z2_half: {
    label: 'z²/2',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 2.25,
    fn: (z) => ({ re: (z.re * z.re - z.im * z.im) / 2, im: z.re * z.im }),
  },
  inv_2z2: {
    label: '1/(2z²)',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 5,
    fn: (z) => {
      const re2 = z.re * z.re - z.im * z.im;
      const im2 = 2 * z.re * z.im;
      const d = 2 * (re2 * re2 + im2 * im2);
      return { re: re2 / d, im: -im2 / d };
    },
  },
  exp_z: {
    label: 'eᶻ',
    // Re ∈ [-ln2, ln2] → circles radius 0.5–2; Im ∈ [-π, π] → full circles
    inputExtentRe: Math.log(2),
    inputExtentIm: Math.PI,
    outputExtent: 2,
    fn: (z) => {
      const r = Math.exp(z.re);
      return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
    },
  },
  sin_z: {
    label: 'sin(z)',
    // Re ∈ [-π, π] closes the ellipses; Im extent sets outermost ellipse radius via cosh
    inputExtentRe: Math.PI,
    inputExtentIm: Math.acosh(2),
    outputExtent: 2.1,
    fn: (z) => ({
      re: Math.sin(z.re) * Math.cosh(z.im),
      im: Math.cos(z.re) * Math.sinh(z.im),
    }),
  },
  cos_z: {
    label: 'cos(z)',
    inputExtentRe: Math.PI,
    inputExtentIm: Math.acosh(2),
    outputExtent: 2.1,
    fn: (z) => ({
      re: Math.cos(z.re) * Math.cosh(z.im),
      im: -Math.sin(z.re) * Math.sinh(z.im),
    }),
  },
  ln_z: {
    label: 'ln(z)',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: Math.PI,
    fn: (z) => ({
      re: 0.5 * Math.log(z.re * z.re + z.im * z.im),
      im: Math.atan2(z.im, z.re),
    }),
  },
};

const config = {
  transform: 'z2', // z2 | inv_z | z2_half | inv_2z2 | exp_z | sin_z | cos_z | ln_z
  gridLines: 12,
  samples: 200,
  margin: 80,
  lineWidth: 1.5,
  bg: '#f7f6f2',
  colorH: '#d95f4b',
  colorV: '#2f7ec4',
};

function toCanvas(
  z: Complex,
  cx: number,
  cy: number,
  xScale: number,
  yScale: number,
): [number, number] {
  return [cx + z.re * xScale, cy - z.im * yScale];
}

function makeHLines(
  extentRe: number,
  extentIm: number,
  n: number,
  samples: number,
): Complex[][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const im = mapRange(i, 0, n, -extentIm, extentIm);
    return Array.from({ length: samples + 1 }, (_, j) => ({
      re: mapRange(j, 0, samples, -extentRe, extentRe),
      im,
    }));
  });
}

function makeVLines(
  extentRe: number,
  extentIm: number,
  n: number,
  samples: number,
): Complex[][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const re = mapRange(i, 0, n, -extentRe, extentRe);
    return Array.from({ length: samples + 1 }, (_, j) => ({
      re,
      im: mapRange(j, 0, samples, -extentIm, extentIm),
    }));
  });
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: Complex[][],
  cx: number,
  cy: number,
  xScale: number,
  yScale: number,
  color: string,
  lineWidth: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  for (const line of lines) {
    context.beginPath();
    for (let i = 0; i < line.length; i++) {
      const [x, y] = toCanvas(line[i], cx, cy, xScale, yScale);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawAxes(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfLen: number,
): void {
  context.strokeStyle = '#ccc';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(cx - halfLen, cy);
  context.lineTo(cx + halfLen, cy);
  context.moveTo(cx, cy - halfLen);
  context.lineTo(cx, cy + halfLen);
  context.stroke();
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  context.fillStyle = '#aaa';
  context.font = '400 32px monospace';
  context.textAlign = 'center';
  context.fillText(text, x, y);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const { fn, label, inputExtentRe, inputExtentIm, outputExtent } =
    transforms[config.transform];

  const hLines = makeHLines(
    inputExtentRe,
    inputExtentIm,
    config.gridLines,
    config.samples,
  );
  const vLines = makeVLines(
    inputExtentRe,
    inputExtentIm,
    config.gridLines,
    config.samples,
  );
  const hLinesT = hLines.map((line) => line.map(fn));
  const vLinesT = vLines.map((line) => line.map(fn));

  const halfW = width / 2;
  const panelW = halfW - config.margin * 2;
  // Input uses separate x/y scales so the grid always fills the panel as a square
  const inputXScale = panelW / (inputExtentRe * 2);
  const inputYScale = panelW / (inputExtentIm * 2);
  // Output is isometric to preserve conformal proportions
  const outputScale = panelW / (outputExtent * 2);
  const cy = height / 2;
  const lcx = halfW / 2;
  const rcx = halfW + halfW / 2;

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    // Divider
    context.save();
    context.strokeStyle = '#ddd';
    context.lineWidth = 1;
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(halfW, 0);
    context.lineTo(halfW, height);
    context.stroke();
    context.setLineDash([]);
    context.restore();

    // Axes
    drawAxes(context, lcx, cy, halfW / 2 - config.margin / 2);
    drawAxes(context, rcx, cy, halfW / 2 - config.margin / 2);

    // Labels
    drawLabel(context, 'z', lcx, config.margin / 2 + 8);
    drawLabel(context, `f(z) = ${label}`, rcx, config.margin / 2 + 8);

    // Original grid
    context.lineJoin = 'round';
    drawLines(
      context,
      hLines,
      lcx,
      cy,
      inputXScale,
      inputYScale,
      config.colorH,
      config.lineWidth,
    );
    drawLines(
      context,
      vLines,
      lcx,
      cy,
      inputXScale,
      inputYScale,
      config.colorV,
      config.lineWidth,
    );

    // Transformed grid (isometric — same scale for both axes)
    drawLines(
      context,
      hLinesT,
      rcx,
      cy,
      outputScale,
      outputScale,
      config.colorH,
      config.lineWidth,
    );
    drawLines(
      context,
      vLinesT,
      rcx,
      cy,
      outputScale,
      outputScale,
      config.colorV,
      config.lineWidth,
    );
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
