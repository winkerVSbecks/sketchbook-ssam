import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import { createNaleeSystem } from '../nalee-system';
import { makeDomain, clipDomain } from '../domain';
import { Config, DomainToWorld } from '../types';
import { xyToCoords } from '../utils';
import { makePolarDomain, polarDomainToWorld } from '../polar-utils';

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

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1]; //100;

  const radius = width * 0.25;
  const [cx, cy] = [width * 0.5, height * 0.5];

  const domainToWorld: DomainToWorld = polarDomainToWorld(
    radiusRes,
    thetaRes,
    [cx, cy],
    radius
  );
  let startAngle = 10;
  let angle = startAngle;
  let domain = makePolarDomain([10, radiusRes], [0, startAngle], domainToWorld);
  const naleeSystem = createNaleeSystem(
    domain,
    config,
    domainToWorld,
    colors,
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead, frame } = props;

    if (frame === 0) {
      naleeSystem.reset();
      domain = makePolarDomain([10, radiusRes], [0, startAngle], domainToWorld);
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const newDomain = domain.concat(
      makePolarDomain(
        [10, radiusRes],
        [startAngle, mapRange(playhead, 0, 1, startAngle, thetaRes)],
        domainToWorld
      )
    );
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
