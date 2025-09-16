import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { Delaunay } from 'd3-delaunay';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { color, keys, ColorType } from '../../colors/radix';

// Blacks, whites, and yellows remain constant,
// while reds, blues, and greens display "crucial hue variations dictated by context"

const colors = {
  blacks: [color('gray', 12), color('mauve', 12), color('slate', 12)],
  whites: [color('gray', 3), color('mauve', 3), color('slate', 3)],
  yellows: [
    color('amber', 9),
    color('amber', 10),
    color('yellow', 5),
    color('yellow', 9),
  ],
  reds: [color('tomato', 9), color('red', 9)],
  blues: [
    color('indigo', 9),
    color('indigo', 10),
    color('blue', 9),
    color('blue', 10),
    color('blue', 11),
  ],
  greens: [
    color('jade', 10),
    color('jade', 11),
    color('green', 10),
    color('green', 11),
    color('grass', 9),
  ],
};

type Hue = keyof typeof colors;

const pair: [Hue, Hue] = Random.pick([
  ['blacks', 'reds'],
  ['blacks', 'blues'],
  ['blacks', 'greens'],
  ['whites', 'reds'],
  ['whites', 'blues'],
  ['whites', 'greens'],
  ['yellows', 'reds'],
  ['yellows', 'blues'],
  ['yellows', 'greens'],
]);

const constant = Random.pick(colors[pair[0]]);
const variation = Random.pick(colors[pair[1]]);
const bg = color('gray', 1);

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 9;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size - 1,
    stepSize: size / 3,
    walkerCount: 20,
    padding: 1 / 64,
    pathStyle: 'infinitePipeStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  const points = new PoissonDiskSampling({
    shape: [config.resolution[0], config.resolution[1]],
    tries: 20,
    minDistance: Math.round(Math.max(...config.resolution) * 0.25),
    maxDistance: Math.max(...config.resolution),
  })
    .fill()
    .concat(
      Random.pick([
        [
          [0, 0],
          [config.resolution[0], 0],
        ],
        [
          [0, config.resolution[1]],
          [config.resolution[0], config.resolution[1]],
        ],
        [
          [0, 0],
          [0, config.resolution[1]],
        ],
        [
          [config.resolution[0], 0],
          [config.resolution[0], config.resolution[1]],
        ],
      ])
    );

  let delaunay: Delaunay<number[]> = Delaunay.from(points as Point[]);

  const { points: dPoints, triangles } = delaunay;
  const polygons: Point[][] = [];

  for (let i = 0; i < triangles.length / 3; i++) {
    const t0 = triangles[i * 3 + 0];
    const t1 = triangles[i * 3 + 1];
    const t2 = triangles[i * 3 + 2];
    polygons.push([
      [dPoints[t0 * 2], dPoints[t0 * 2 + 1]],
      [dPoints[t1 * 2], dPoints[t1 * 2 + 1]],
      [dPoints[t2 * 2], dPoints[t2 * 2 + 1]],
    ]);
  }

  const hull = delaunay.hullPolygon();
  const paddedHull = padPolygon(hull, 0.02);

  const hullCD = clipDomain(domain, hull);
  const hullSystem = createNaleeSystem(
    hullCD,
    config,
    domainToWorld,
    [variation],
    bg
  );

  const bgSystemCD = clipDomain(domain, paddedHull, true);
  const bgSystem = createNaleeSystem(
    bgSystemCD,
    { ...config, pathStyle: 'solidStyle' },
    domainToWorld,
    [constant],
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.lineCap = 'round';
    context.lineJoin = 'round';

    bgSystem(props);
    hullSystem(props);
  };
};

function padPolygon(polygon: Point[], padding: number): Point[] {
  // Calculate centroid
  const n = polygon.length;
  const cx = polygon.reduce((sum, [x]) => sum + x, 0) / n;
  const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / n;

  // Pad each vertex away from centroid
  return polygon.map(([x, y]) => [
    cx + (x - cx) * (1 + padding),
    cy + (y - cy) * (1 + padding),
  ]);
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
