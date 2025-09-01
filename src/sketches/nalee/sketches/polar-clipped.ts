import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee-system';
import {
  clipPolarDomainWithWorldCoords,
  makePolarDomain,
  polarDomainToWorld,
} from '../polar-utils';
import { Config, DomainToWorld } from '../types';
import { randomPalette } from '../../../colors/riso';

// const { bg, inkColors: colors } = randomPalette();
// const bg = '#fff';
// const colors = ['#f13401', '#0769ce', '#f1d93c', '#11804b'];
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
    walkerCount: 10,
    padding: 1 / 32,
    pathStyle: 'pipeStyle',
    flat: true,
  } satisfies Config;

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1]; //100;

  const radius = width * 0.3;
  const [cx, cy] = [width * 0.4, height * 0.5];
  const radius2 = width * 0.25;
  const [cx2, cy2] = [width * 0.6, height * 0.5];

  const domainToWorld1: DomainToWorld = polarDomainToWorld(
    radiusRes,
    thetaRes,
    [cx, cy],
    radius
  );
  const domain = makePolarDomain(
    [10, radiusRes],
    [0, thetaRes],
    domainToWorld1
  );
  const clippedDomain = clipPolarDomainWithWorldCoords(
    domain,
    [cx2, cy2],
    radius2 + size * 1.5,
    true
  );
  const naleeSystem = createNaleeSystem(
    clippedDomain,
    config,
    domainToWorld1,
    colors,
    bg
  );

  const domainToWorld2: DomainToWorld = polarDomainToWorld(
    radiusRes,
    thetaRes,
    [cx2, cy2],
    radius2
  );
  const domain2 = makePolarDomain(
    [10, radiusRes],
    [0, thetaRes],
    domainToWorld2
  );
  const naleeSystem2 = createNaleeSystem(
    domain2,
    config,
    domainToWorld2,
    colors,
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    naleeSystem(props);
    naleeSystem2(props);
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
