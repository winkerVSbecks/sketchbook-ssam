import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
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
  },
  {
    stroke: '#4169ff',
    contrast: '#ff5937',
  },
];

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

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = 80; //config.resolution[1] * 0.75; //100;

  const circle = {
    radius: width * 0.4,
    cx: width * 0.5,
    cy: height + width * 0.4,
  };

  const baseDomainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );
  const baseDomain = makeDomain(config.resolution, baseDomainToWorld);
  const baseClippedDomain = clipPolarDomainWithWorldCoords(
    baseDomain,
    [circle.cx, circle.cy],
    circle.radius + size * 2,
    true
  );
  const baseSystem = createNaleeSystem(
    baseClippedDomain,
    config,
    baseDomainToWorld,
    [palette.stroke],
    bg
  );

  const domainToWorld: DomainToWorld = polarDomainToWorld(
    radiusRes,
    thetaRes,
    [circle.cx, circle.cy],
    circle.radius
  );
  const domain = makePolarDomain([10, radiusRes], [0, thetaRes], domainToWorld);
  const clippedDomain = clipPolarDomainWithWorldCoords(
    domain,
    [circle.cx, circle.cy],
    circle.radius + size * 1.5
  );
  const system = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld,
    [palette.contrast],
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead, frame } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      baseSystem.reset();
    }

    const y = circle.cy - circle.radius * Math.sin(playhead * Math.PI);

    const newBaseDomain = clipPolarDomainWithWorldCoords(
      baseDomain,
      [circle.cx, y],
      circle.radius + size * 2,
      true
    );
    baseSystem.grow(newBaseDomain);

    baseSystem(props);

    context.save();
    context.translate(0, y - circle.cy);
    system(props);
    context.restore();
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
