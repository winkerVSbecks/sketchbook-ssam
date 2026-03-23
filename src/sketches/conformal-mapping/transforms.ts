import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';

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

const transforms: Transform[] = [
  {
    label: 'z²',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 4.5,
    fn: (z) => ({ re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }),
  },
  {
    label: '1/z',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 3,
    fn: (z) => {
      const d = z.re * z.re + z.im * z.im;
      return { re: z.re / d, im: -z.im / d };
    },
  },
  {
    label: 'z²/2',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: 2.25,
    fn: (z) => ({ re: (z.re * z.re - z.im * z.im) / 2, im: z.re * z.im }),
  },
  {
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
  {
    label: 'eᶻ',
    inputExtentRe: Math.log(2),
    inputExtentIm: Math.PI,
    outputExtent: 2,
    fn: (z) => {
      const r = Math.exp(z.re);
      return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
    },
  },
  {
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
  {
    label: 'cos(z)',
    inputExtentRe: Math.PI,
    inputExtentIm: Math.acosh(2),
    outputExtent: 2.1,
    fn: (z) => ({
      re: Math.cos(z.re) * Math.cosh(z.im),
      im: -Math.sin(z.re) * Math.sinh(z.im),
    }),
  },
  {
    label: 'ln(z)',
    inputExtentRe: 1.5,
    inputExtentIm: 1.5,
    outputExtent: Math.PI,
    fn: (z) => ({
      re: 0.5 * Math.log(z.re * z.re + z.im * z.im),
      im: Math.atan2(z.im, z.re),
    }),
  },
];

const config = {
  cols: 3,
  rows: 3,
  gridLines: 12,
  samples: 150,
  cellPadding: 28,
  labelHeight: 28,
  lineWidth: 1,
  bg: '#f7f6f2',
  cellBorder: '#e8e7e3',
  colorH: '#d95f4b',
  colorV: '#2f7ec4',
  baseExtent: 1.5,
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

function drawCell(
  context: CanvasRenderingContext2D,
  hLines: Complex[][],
  vLines: Complex[][],
  label: string,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  xScale: number,
  yScale: number,
  lineWidth: number,
): void {
  const cx = cellX + cellW / 2;
  const cy = cellY + cellH / 2 + config.labelHeight / 2;

  context.save();
  context.beginPath();
  context.rect(cellX, cellY, cellW, cellH);
  context.clip();

  context.lineJoin = 'round';
  drawLines(context, hLines, cx, cy, xScale, yScale, config.colorH, lineWidth);
  drawLines(context, vLines, cx, cy, xScale, yScale, config.colorV, lineWidth);

  context.restore();

  // Label below clip so it's never cut off
  context.fillStyle = '#aaa';
  context.font = '400 18px monospace';
  context.textAlign = 'center';
  context.fillText(label, cx, cellY + config.labelHeight - 6);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cellW = width / config.cols;
  const cellH = height / config.rows;
  const usable =
    Math.min(cellW, cellH) - config.cellPadding * 2 - config.labelHeight;

  // Base grid (identity) — cell [0,0]
  const baseScale = usable / (config.baseExtent * 2);
  const baseHLines = makeHLines(
    config.baseExtent,
    config.baseExtent,
    config.gridLines,
    config.samples,
  );
  const baseVLines = makeVLines(
    config.baseExtent,
    config.baseExtent,
    config.gridLines,
    config.samples,
  );

  // Pre-compute transformed lines for each transform
  const transformedData = transforms.map(
    ({ fn, label, inputExtentRe, inputExtentIm, outputExtent }) => {
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
      const scale = usable / (outputExtent * 2);
      return {
        label,
        hLines: hLines.map((line) => line.map(fn)),
        vLines: vLines.map((line) => line.map(fn)),
        scale,
      };
    },
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    // Cell borders
    context.strokeStyle = config.cellBorder;
    context.lineWidth = 1;
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        context.strokeRect(col * cellW, row * cellH, cellW, cellH);
      }
    }

    // Cell [0,0]: base grid
    drawCell(
      context,
      baseHLines,
      baseVLines,
      'z',
      0,
      0,
      cellW,
      cellH,
      baseScale,
      baseScale,
      config.lineWidth,
    );

    // Remaining cells: transforms in order
    for (let i = 0; i < transformedData.length; i++) {
      const { label, hLines, vLines, scale } = transformedData[i];
      const idx = i + 1; // cell index (0 is base grid)
      const col = idx % config.cols;
      const row = Math.floor(idx / config.cols);
      drawCell(
        context,
        hLines,
        vLines,
        `f(z) = ${label}`,
        col * cellW,
        row * cellH,
        cellW,
        cellH,
        scale,
        scale,
        config.lineWidth,
      );
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
