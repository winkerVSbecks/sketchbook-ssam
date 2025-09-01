import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import paper from 'paper';
import { createNaleeSystem } from '../nalee-system';
import { clipPolarDomainWithWorldCoords } from '../polar-utils';
import { Config } from '../types';
import { makeDomain } from '../domain';
import { xyToCoords } from '../utils';

const bg = '#f6f6f4';
const palettes = [
  {
    stroke: '#ff5937',
    contrast: '#4169ff',
  },
  {
    stroke: '#4169ff',
    contrast: '#ff5937',
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

  const circles = Array.from({ length: count }).map(() => {
    const cx = Math.round(Random.range(0.4, 0.6) * width);
    const cy = Math.round(Random.range(0.4, 0.6) * height);
    const maxRadius = Math.min(cx, cy, width - cx, height - cy);
    const radius = Math.round(Random.range(0.5, 1) * (maxRadius * 0.8));
    return { cx, cy, radius };
  });

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const baseDomain = makeDomain(config.resolution, domainToWorld);
  const baseClippedDomain = circles.reduce((d, c) => {
    return clipPolarDomainWithWorldCoords(
      d,
      [c.cx, c.cy],
      c.radius + size * 1.75,
      true
    );
  }, baseDomain);
  const baseSystem = createNaleeSystem(
    baseClippedDomain,
    config,
    domainToWorld,
    [palette.stroke],
    bg
  );

  const domain = makeDomain(config.resolution, domainToWorld);
  const clippedDomain = circles.flatMap((c) => {
    return clipPolarDomainWithWorldCoords(
      domain,
      [c.cx, c.cy],
      c.radius + size * 1.5
    );
  });
  const system = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld,
    [palette.contrast],
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    baseSystem(props);
    system(props);

    // circles.forEach((circle) => {
    //   context.strokeStyle = '#000';
    //   context.beginPath();
    //   context.arc(circle.cx, circle.cy, circle.radius + size, 0, Math.PI * 2);
    //   context.stroke();
    // });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
