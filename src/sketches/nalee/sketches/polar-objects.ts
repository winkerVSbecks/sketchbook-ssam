import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import paper from 'paper';
import { createNaleeSystem } from '../nalee-system';
import {
  clipPolarDomainWithWorldCoords,
  makePolarDomain,
  polarDomainToWorld,
} from '../polar-utils';
import { Config, DomainToWorld } from '../types';

const bg = '#f6f6f4';
const palettes = [
  {
    stroke: '#ff5937',
    pairs: [
      ['#ff5937', '#f6f6f4'],
      ['#f6f6f4', '#ff5937'],
    ],
  },
  {
    stroke: '#4169ff',
    pairs: [
      ['#4169ff', '#f6f6f4'],
      ['#f6f6f4', '#4169ff'],
    ],
  },
];

paper.setup(null as unknown as HTMLCanvasElement);

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 9;
  const config = {
    resolution: [Math.floor(height / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 3,
    walkerCount: 10,
    padding: 1 / 32,
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const palette = Random.pick(palettes);
  const count = Random.rangeFloor(2, 6);

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1] / 1.25; //100;

  const circles = Array.from({ length: count }).map(() => {
    const cx = Math.round(Random.range(0.4, 0.6) * width);
    const cy = Math.round(Random.range(0.4, 0.6) * height);
    const maxRadius = Math.min(cx, cy, width - cx, height - cy);
    const radius = Math.round(Random.range(0.5, 1) * (maxRadius * 0.8));
    return { cx, cy, radius };
  });

  const systems = circles
    .map(({ cx, cy, radius }, idx) => {
      const tr = mapRange(radius, 0, 0.8 * width, thetaRes * 0.5, thetaRes * 2);

      const domainToWorld: DomainToWorld = polarDomainToWorld(
        radiusRes,
        tr,
        [cx, cy],
        radius
      );

      const domain = makePolarDomain([10, radiusRes], [0, tr], domainToWorld);

      const otherCircles = circles.filter((_, i) => i < idx);

      const clippedDomain = otherCircles.reduce((d, c) => {
        return clipPolarDomainWithWorldCoords(
          d,
          [c.cx, c.cy],
          c.radius + size * 1.5,
          true
        );
      }, domain);

      const [c, b] = palette.pairs[idx % palette.pairs.length];

      const system = createNaleeSystem(
        clippedDomain,
        config,
        domainToWorld,
        [c],
        b
      );

      return { system, circle: { cx, cy, radius }, color: b };
    })
    .reverse();

  const circlePaths = circles.map(({ cx, cy, radius }) => {
    return new paper.Path.Circle(new paper.Point(cx, cy), radius * 1.125);
  });

  const paperUnionPath = circlePaths.reduce((acc, p) => {
    return acc === undefined ? p : (acc as any).unite(p);
  }, undefined as unknown) as paper.PathItem;
  const unionPath = new Path2D(paperUnionPath.pathData);

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.restore();
    context.lineWidth = 10;
    context.strokeStyle = palette.stroke;
    context.stroke(unionPath);

    context.save();
    systems.forEach(({ system, circle, color }) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(circle.cx, circle.cy, circle.radius + size, 0, Math.PI * 2);
      context.fill();
      system(props);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
