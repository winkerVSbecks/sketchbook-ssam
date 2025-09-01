import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import paper from 'paper';
import { createNaleeSystem } from '../nalee-system';
import {
  clipPolarDomainWithWorldCoords,
  makePolarDomain,
  polarDomainToWorld,
} from '../polar-utils';
import { Config, DomainToWorld } from '../types';
import { randomPalette } from '../../../colors/riso';

// const { bg, inkColors: colors } = randomPalette();
const bg = '#201c1d';
const colors = Random.shuffle([
  '#5f6ce0',
  '#ffad72',
  '#bafc9d',
  '#bf8dff',
  '#ffb06b',
  '#fc9de7',
  '#d4ffff',
  '#ffffff',
  '#fff3d4',
]);

// const bg = '#f6f6f4';
// const colors = ['#ff5937', '#4169ff', '#cc4529', '#1a3299', '#48bb78'];

paper.setup(null as unknown as HTMLCanvasElement);

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 12;
  const config = {
    resolution: [Math.floor(height / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 3,
    walkerCount: 10,
    padding: 1 / 32,
    pathStyle: 'pipeStyle',
    flat: true,
  } satisfies Config;

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1] / 1.25; //100;

  const circles = Array.from({ length: 5 }).map(() => {
    const cx = Random.range(0.4, 0.6) * width;
    const cy = Random.range(0.4, 0.6) * height;
    const maxRadius = Math.min(cx, cy, width - cx, height - cy);
    const radius = Random.range(0.5, 1) * (maxRadius * 0.8);
    return { cx, cy, radius };
  });

  const systems = circles.map(({ cx, cy, radius }, idx) => {
    const domainToWorld: DomainToWorld = polarDomainToWorld(
      radiusRes,
      thetaRes,
      [cx, cy],
      radius
    );

    const domain = makePolarDomain(
      [10, radiusRes],
      [0, thetaRes],
      domainToWorld
    );

    const otherCircles = circles.filter((_, i) => i < idx);

    const clippedDomain = otherCircles.reduce((d, c) => {
      return clipPolarDomainWithWorldCoords(
        d,
        [c.cx, c.cy],
        c.radius + size * 1.5,
        true
      );
    }, domain);

    return createNaleeSystem(
      clippedDomain,
      config,
      domainToWorld,
      [colors[idx % colors.length]],
      bg
    );
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    systems.forEach((system) => system(props));
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
