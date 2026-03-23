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

const config = {
  gridLines: 12,
  samples: 200,
  inputExtent: 1.5,
  // z² output: Re ∈ [-2.25, 2.25], Im ∈ [-4.5, 4.5] → use max dim
  get outputExtent() {
    return this.inputExtent * this.inputExtent * 2;
  },
  margin: 80,
  lineWidth: 1.5,
  bg: '#f7f6f2',
  colorH: '#d95f4b',
  colorV: '#2f7ec4',
};

// Conformal map: z → z²
function transform(z: Complex): Complex {
  return {
    re: z.re * z.re - z.im * z.im,
    im: 2 * z.re * z.im,
  };
}

function toCanvas(
  z: Complex,
  cx: number,
  cy: number,
  scale: number,
): [number, number] {
  return [cx + z.re * scale, cy - z.im * scale];
}

function makeHLines(extent: number, n: number, samples: number): Complex[][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const im = mapRange(i, 0, n, -extent, extent);
    return Array.from({ length: samples + 1 }, (_, j) => ({
      re: mapRange(j, 0, samples, -extent, extent),
      im,
    }));
  });
}

function makeVLines(extent: number, n: number, samples: number): Complex[][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const re = mapRange(i, 0, n, -extent, extent);
    return Array.from({ length: samples + 1 }, (_, j) => ({
      re,
      im: mapRange(j, 0, samples, -extent, extent),
    }));
  });
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: Complex[][],
  cx: number,
  cy: number,
  scale: number,
  color: string,
  lineWidth: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  for (const line of lines) {
    context.beginPath();
    for (let i = 0; i < line.length; i++) {
      const [x, y] = toCanvas(line[i], cx, cy, scale);
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

  const hLines = makeHLines(
    config.inputExtent,
    config.gridLines,
    config.samples,
  );
  const vLines = makeVLines(
    config.inputExtent,
    config.gridLines,
    config.samples,
  );
  const hLinesT = hLines.map((line) => line.map(transform));
  const vLinesT = vLines.map((line) => line.map(transform));

  const halfW = width / 2;
  const inputScale = (halfW - config.margin * 2) / (config.inputExtent * 2);
  const outputScale = (halfW - config.margin * 2) / (config.outputExtent * 2);
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
    drawLabel(context, 'f(z) = z²', rcx, config.margin / 2 + 8);

    // Original grid
    context.lineJoin = 'round';
    drawLines(
      context,
      hLines,
      lcx,
      cy,
      inputScale,
      config.colorH,
      config.lineWidth,
    );
    drawLines(
      context,
      vLines,
      lcx,
      cy,
      inputScale,
      config.colorV,
      config.lineWidth,
    );

    // Transformed grid
    drawLines(
      context,
      hLinesT,
      rcx,
      cy,
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
