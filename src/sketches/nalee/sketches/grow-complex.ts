import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { lerpFrames } from 'canvas-sketch-util/math';
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

  const initialShape: Point[] = [
    [20, 10],
    [40, 10],
    [50, 10],
    [50, 20],
    [50, 40],
    [70, 40],
    [70, 50],
    [60, 50],
    [60, 50],
    [40, 50],
    [40, 20],
    [20, 20],
  ];

  const domain = makeDomain(config.resolution, domainToWorld);
  const clippedDomain = clipDomain(domain, initialShape);
  const naleeSystem = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld,
    colors,
    bg
  );

  let shape = [...initialShape];

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead, frame } = props;

    if (frame === 0) {
      naleeSystem.reset();
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    shape[0] = lerpFrames([initialShape[0], [40, 10]], playhead);
    shape[1] = lerpFrames([initialShape[1], [40, 10]], playhead);
    shape[2] = lerpFrames([initialShape[2], [50, 10]], playhead);
    shape[3] = lerpFrames([initialShape[3], [50, 20]], playhead);
    shape[4] = lerpFrames([initialShape[4], [50, 40]], playhead);
    shape[5] = lerpFrames([initialShape[5], [70, 40]], playhead);
    shape[6] = lerpFrames([initialShape[6], [70, 80]], playhead);
    shape[7] = lerpFrames([initialShape[7], [60, 80]], playhead);
    shape[8] = lerpFrames([initialShape[8], [60, 50]], playhead);
    shape[9] = lerpFrames([initialShape[9], [40, 50]], playhead);
    shape[10] = lerpFrames([initialShape[10], [40, 20]], playhead);
    shape[11] = lerpFrames([initialShape[11], [40, 20]], playhead);

    const newDomain = clipDomain(domain, shape);
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
