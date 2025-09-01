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
import { makeDomain } from '../domain';
import { xyToCoords } from '../utils';

const bg = '#f6f6f4';
const palettes = [
  {
    stroke: '#ff5937',
    contrast: '#4169ff',
    pairs: [
      ['#ff5937', '#f6f6f4'],
      ['#f6f6f4', '#ff5937'],
    ],
  },
  {
    stroke: '#4169ff',
    contrast: '#ff5937',
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
  const thetaRes = 80; //config.resolution[1] * 0.75; //100;

  const circles = Array.from({ length: count })
    .map(() => {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const radius = Math.round(Random.range(0.2, 0.4) * width);
      return { cx, cy, radius };
    })
    .sort((a, b) => a.radius - b.radius);

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);
  const clippedDomain = circles.reduce((d, c) => {
    return clipPolarDomainWithWorldCoords(
      d,
      [c.cx, c.cy],
      c.radius + size * 2,
      true
    );
  }, domain);
  const baseSystem = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld,
    [Random.chance() ? palette.contrast : palette.stroke],
    bg
  );

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

      return {
        system,
        circle: { cx, cy, radius, offset: Random.range(0, Math.PI * 2) },
        color: b,
      };
    })
    .reverse();

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    baseSystem(props);
    systems.forEach(({ system, circle, color }, idx) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(circle.cx, circle.cy, circle.radius + size, 0, Math.PI * 2);
      context.fill();

      context.save();
      // Move origin to the center of the circle
      context.translate(circle.cx, circle.cy);
      // Rotate around the new origin
      context.rotate(
        circle.offset + Math.PI * 2 * playhead * (idx % 2 === 0 ? 1 : -1)
      );
      // Translate back so the system draws in the right place
      context.translate(-circle.cx, -circle.cy);

      // Call system with the rotated context
      system(props);
      context.restore();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1, //window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
