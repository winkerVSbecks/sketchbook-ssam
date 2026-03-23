import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { createNaleeSystem, makeDomain, xyToCoords } from '../nalee';
import type { Config, Walker } from '../nalee';
import { drawShape } from '../nalee/paths';
import { clrs } from '../../colors/clrs';

Random.setSeed(Random.getRandomSeed());

interface Complex {
  re: number;
  im: number;
}

interface Transform {
  label: string;
  inputExtent: number;
  outputExtent: number;
  fn: (z: Complex) => Complex;
}

const transforms: Transform[] = [
  {
    label: 'z²',
    inputExtent: 1.5,
    outputExtent: 4.5,
    fn: (z) => ({ re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }),
  },
  {
    label: '1/z',
    inputExtent: 1.5,
    outputExtent: 3,
    fn: (z) => {
      const d = z.re * z.re + z.im * z.im || 1e-10;
      return { re: z.re / d, im: -z.im / d };
    },
  },
  {
    label: 'z²/2',
    inputExtent: 1.5,
    outputExtent: 2.25,
    fn: (z) => ({ re: (z.re * z.re - z.im * z.im) / 2, im: z.re * z.im }),
  },
  {
    label: '1/(2z²)',
    inputExtent: 1.5,
    outputExtent: 5,
    fn: (z) => {
      const re2 = z.re * z.re - z.im * z.im;
      const im2 = 2 * z.re * z.im;
      const d = 2 * (re2 * re2 + im2 * im2) || 1e-10;
      return { re: re2 / d, im: -im2 / d };
    },
  },
  {
    label: 'eᶻ',
    inputExtent: Math.log(2),
    outputExtent: 2,
    fn: (z) => {
      const r = Math.exp(z.re);
      return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
    },
  },
  {
    label: 'sin(z)',
    inputExtent: Math.PI,
    outputExtent: 2.1,
    fn: (z) => ({
      re: Math.sin(z.re) * Math.cosh(z.im),
      im: Math.cos(z.re) * Math.sinh(z.im),
    }),
  },
  {
    label: 'cos(z)',
    inputExtent: Math.PI,
    outputExtent: 2.1,
    fn: (z) => ({
      re: Math.cos(z.re) * Math.cosh(z.im),
      im: -Math.sin(z.re) * Math.sinh(z.im),
    }),
  },
  {
    label: 'ln(z)',
    inputExtent: 1.5,
    outputExtent: Math.PI,
    fn: (z) => ({
      re: 0.5 * Math.log(z.re * z.re + z.im * z.im || 1e-10),
      im: Math.atan2(z.im, z.re),
    }),
  },
];

function paletteFromIndex(index: number): { bg: string; colors: string[] } {
  const palette = clrs[index];
  const bg = Random.shuffle(palette).pop()!;
  return { bg: bg, colors: palette };
}

const initialPaletteIndex = Random.rangeFloor(0, clrs.length);

const PARAMS = {
  paletteIndex: initialPaletteIndex,
  transformIndex: 0,
  lineWidth: 4,
  size: 16,
  walkerCount: 20,
  padding: 0.03125,
  ...paletteFromIndex(initialPaletteIndex),
};

function applyConformal(
  pt: Point,
  cx: number,
  cy: number,
  halfSize: number,
  transform: Transform,
): Point {
  const { inputExtent, outputExtent, fn } = transform;
  const z: Complex = {
    re: ((pt[0] - cx) / halfSize) * inputExtent,
    im: -((pt[1] - cy) / halfSize) * inputExtent,
  };
  const w = fn(z);
  const outScale = halfSize / outputExtent;
  return [cx + w.re * outScale, cy - w.im * outScale];
}

function makeConformalStyle(cx: number, cy: number, halfSize: number) {
  return function (
    context: CanvasRenderingContext2D,
    walker: Walker,
    pts: Point[],
  ) {
    const transform = transforms[PARAMS.transformIndex];
    const transformed = pts.map((pt) =>
      applyConformal(pt, cx, cy, halfSize, transform),
    );

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = walker.color;
    context.lineWidth = PARAMS.lineWidth;
    drawShape(context, transformed, false);
    context.stroke();
    context.restore();
  };
}

function buildSystem(
  width: number,
  height: number,
  cx: number,
  cy: number,
  halfSize: number,
) {
  const config: Config = {
    resolution: [
      Math.floor(width / PARAMS.size),
      Math.floor(height / PARAMS.size),
    ],
    size: PARAMS.size,
    stepSize: Math.round(PARAMS.size / 3),
    walkerCount: PARAMS.walkerCount,
    padding: PARAMS.padding,
    pathStyle: makeConformalStyle(cx, cy, halfSize),
    flat: true,
  };
  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height,
  );
  const domain = makeDomain(config.resolution, domainToWorld);
  return createNaleeSystem(
    domain,
    config,
    domainToWorld,
    PARAMS.colors,
    PARAMS.bg,
  );
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const cx = width / 2;
  const cy = height / 2;
  const halfSize = Math.min(width, height) / 2;

  const pane = new Pane() as any;
  pane.containerElem_.style.zIndex = 1;

  const transformOptions = Object.fromEntries(
    transforms.map((t, i) => [t.label, i]),
  );
  pane
    .addBinding(PARAMS, 'paletteIndex', {
      label: 'palette',
      min: 0,
      max: clrs.length - 1,
      step: 1,
    })
    .on('change', ({ value }: { value: number }) => {
      Object.assign(PARAMS, paletteFromIndex(value));
    });
  pane.addBinding(PARAMS, 'transformIndex', {
    label: 'transform',
    options: transformOptions,
  });
  pane.addBinding(PARAMS, 'lineWidth', {
    label: 'line width',
    min: 1,
    max: 20,
    step: 1,
  });
  pane.addBinding(PARAMS, 'size', { min: 4, max: 64, step: 4 });
  pane.addBinding(PARAMS, 'walkerCount', {
    label: 'walkers',
    min: 1,
    max: 100,
    step: 1,
  });
  pane.addBinding(PARAMS, 'padding', { min: 0, max: 0.1, step: 0.005 });

  let naleeSystem = buildSystem(width, height, cx, cy, halfSize);
  pane.addButton({ title: 'Regenerate' }).on('click', () => {
    naleeSystem = buildSystem(width, height, cx, cy, halfSize);
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      wrap.dispose();
      pane.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = (props: SketchProps) => {
    context.fillStyle = PARAMS.bg;
    context.fillRect(0, 0, width, height);
    naleeSystem(props);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
