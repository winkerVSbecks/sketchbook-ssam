import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerpFrames } from 'canvas-sketch-util/math';
import { createNaleeSystem, makeDomain, xyToCoords } from '../nalee';
import type { Config, Walker } from '../nalee';
import { drawShape } from '../nalee/paths';

Random.setSeed(Random.getRandomSeed());

interface Complex {
  re: number;
  im: number;
}

// z² conformal map: input extent ±1.5, output extent ±4.5
const INPUT_EXTENT = 1.5;
const OUTPUT_EXTENT = 4.5;

function zSquared(z: Complex): Complex {
  return { re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im };
}

function applyConformal(
  pt: Point,
  cx: number,
  cy: number,
  halfSize: number,
): Point {
  const z: Complex = {
    re: ((pt[0] - cx) / halfSize) * INPUT_EXTENT,
    im: -((pt[1] - cy) / halfSize) * INPUT_EXTENT,
  };
  const w = zSquared(z);
  const outScale = halfSize / OUTPUT_EXTENT;
  return [cx + w.re * outScale, cy - w.im * outScale];
}

function makeConformalStyle(cx: number, cy: number, halfSize: number) {
  return function (
    context: CanvasRenderingContext2D,
    walker: Walker,
    pts: Point[],
  ) {
    const transformed = pts.map((pt) => applyConformal(pt, cx, cy, halfSize));

    let l = 0;
    for (let i = 1; i < transformed.length; i++) {
      l += Math.hypot(
        transformed[i][0] - transformed[i - 1][0],
        transformed[i][1] - transformed[i - 1][1],
      );
    }

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = walker.color;
    context.lineWidth = 4;
    drawShape(context, transformed, false);
    context.stroke();
    context.restore();
  };
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cx = width / 2;
  const cy = height / 2;
  const halfSize = Math.min(width, height) / 2;

  const size = 16;
  const config: Config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size,
    stepSize: Math.round(size / 3),
    walkerCount: 20,
    padding: 0.03125,
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

  const colors = [
    '#FFDE73',
    '#EE7744',
    '#F9BC4F',
    '#2C7C79',
    '#4C4D78',
    '#FFF5E0',
  ];
  const bg = '#101019';

  const naleeSystem = createNaleeSystem(
    domain,
    config,
    domainToWorld,
    colors,
    bg,
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.fillStyle = bg;
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
