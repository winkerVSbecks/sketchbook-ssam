import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { Delaunay } from 'd3-delaunay';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config, DomainToWorld, Node } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { hexadic, pentadic } from '../../colors/oklch';
import { carmen } from '../../colors/found';

// const [bg, base, ...accents] = pentadic();
const [bg, base, ...accents] = [
  '#FDFCF3',
  '#ECE5F0',
  '#002500',
  '#CEFF00',
  '#2A42FF',
  '#2B0404',
  '#AB2A00',
  '#C15F3D',
  '#EB562F',
];
// log and visualize the colors in console
console.log(`%c ${bg}`, `background: ${bg}; color: ${bg}`);
accents.forEach((color) => {
  console.log(`%c ${color}`, `background: ${color}; color: ${color}`);
});

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 8;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 2,
    walkerCount: 20,
    padding: 1 / 64,
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  const clrs = Random.shuffle(accents);
  const hullSystems = Array.from({ length: accents.length }).map((_, i) => {
    return createHullSystem(config, domain, domainToWorld, clrs[i], bg);
  });

  // const paddedHulls = hullSystems.map(({ hull }) => padPolygon(hull, 0.02));
  const hulls = hullSystems.map(({ hull }) => hull);

  const bgSystemCD = hulls.reduce((d, c) => {
    return clipDomain(d, c, true);
  }, domain);
  const bgSystem = createNaleeSystem(
    bgSystemCD,
    { ...config, pathStyle: 'solidStyle', walkerCount: 150 },
    domainToWorld,
    [base],
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
    hullSystems.forEach(({ system }) => system(props));
  };
};

function createHullSystem(
  config: Config,
  domain: Node[],
  domainToWorld: DomainToWorld,
  fg: string,
  bg: string
) {
  const points = new PoissonDiskSampling({
    shape: [config.resolution[0], config.resolution[1]],
    tries: 10,
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

  const hull = delaunay.hullPolygon();

  const hullCD = clipDomain(domain, hull);
  const system = createNaleeSystem(hullCD, config, domainToWorld, [fg], bg);

  return {
    system,
    hull,
  };
}

// function padPolygon(polygon: Point[], padding: number): Point[] {
//   // Calculate centroid
//   const n = polygon.length;
//   const cx = polygon.reduce((sum, [x]) => sum + x, 0) / n;
//   const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / n;

//   // Pad each vertex away from centroid
//   return polygon.map(([x, y]) => [
//     cx + (x - cx) * (1 + padding),
//     cy + (y - cy) * (1 + padding),
//   ]);
// }

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
