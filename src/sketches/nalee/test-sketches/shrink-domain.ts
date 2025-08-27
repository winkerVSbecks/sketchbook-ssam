import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import { createNaleeSystem } from '../nalee-system';
import { makeDomain, clipDomain } from '../domain';
import { Config } from '../types';
import { xyToCoords } from '../utils';

const bg = '#201c1d';
const colors = [
  '#5f6ce0',
  '#ffad72',
  '#bafc9d',
  '#bf8dff',
  // '#2a1f38',
  '#ffb06b',
  // '#382718',
  '#fc9de7',
  // '#382333',
  '#d4ffff',
  '#ffffff',
  '#fff3d4',
];

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 12;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
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
  const clippedDomain = clipDomain(domain, [
    [10, 10],
    [80, 10],
    [80, 80],
    [10, 80],
  ]);
  const naleeSystem = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld,
    colors,
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead, frame } = props;

    if (frame === 0) {
      naleeSystem.reset();
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const w = 80; //Math.round(mapRange(playhead, 0, 1, 80, 40, true));
    const h = Math.round(mapRange(playhead, 0, 1, 80, 40, true));

    const newDomain = clipDomain(domain, [
      [10, 10],
      [w, 10],
      [w, h],
      [10, h],
    ]);
    // console.log(newDomain.length);

    naleeSystem.grow(newDomain);

    naleeSystem(props);
  };
};

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
