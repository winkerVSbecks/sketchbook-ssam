import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { Delaunay } from 'd3-delaunay';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config, DomainToWorld, Node } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { drawShape } from '../nalee/paths';

const bg = '#FDFCF3';
const base = '#ECE5F0';

const [foregrounds, backgrounds] = Random.pick([
  [
    Random.shuffle(['#2A42FF', '#AB2A00', '#C15F3D', '#EB562F']),
    Random.shuffle(['#002500', '#CEFF00', '#2B0404']),
  ],
  [
    Random.shuffle(['#002500', '#CEFF00', '#2B0404']),
    Random.shuffle(['#2A42FF', '#AB2A00', '#C15F3D', '#EB562F']),
  ],
]) as [string[], string[]];

// log and visualize the colors in console
console.log(`%c ${bg}`, `background: ${bg}; color: ${bg}`);
console.log(`%c ${base}`, `background: ${base}; color: ${base}`);
console.log('backgrounds');
console.log(
  backgrounds.map((color) => `%c ${color}`).join(' '),
  ...backgrounds.map((color) => `background: ${color}; color: ${color}`)
);
console.log('foregrounds');
console.log(
  foregrounds.map((color) => `%c ${color}`).join(' '),
  ...foregrounds.map((color) => `background: ${color}; color: ${color}`)
);

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
    pathStyle: 'animatedLine',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  const hullSystems = Array.from({ length: backgrounds.length }).map((_, i) => {
    return createHullSystem(
      config,
      domain,
      domainToWorld,
      foregrounds[i % foregrounds.length],
      backgrounds[i]
    );
  });

  const hulls = hullSystems.map(({ hull }) => hull);

  const bgSystemCD = hulls.reduce((d, c) => {
    return clipDomain(d, c, true);
  }, domain);
  const bgSystem = createNaleeSystem(
    bgSystemCD,
    { ...config, pathStyle: 'solidStyle', walkerCount: 1 },
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

    hullSystems.forEach(({ hull, color }) => {
      context.fillStyle = color;
      drawShape(
        context,
        hull.map((pt) => domainToWorld(...pt))
      );
      context.fill();
    });
    bgSystem(props);
    hullSystems.forEach(({ system }) => {
      system(props);
    });
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
    color: bg,
  };
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
