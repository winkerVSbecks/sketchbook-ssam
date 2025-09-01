import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee-system';
import { makePolarDomain } from '../polar-utils';
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

  const radius = width * 0.3;
  const [cx, cy] = [width / 2, height / 2];

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1]; //100;

  const domainToWorld: DomainToWorld = (r: number, theta: number) => {
    const worldX =
      cx +
      ((radius * r) / radiusRes) * Math.cos((theta * Math.PI * 2) / thetaRes);
    const worldY =
      cy +
      ((radius * r) / radiusRes) * Math.sin((theta * Math.PI * 2) / thetaRes);
    return [worldX, worldY];
  };

  const domain = makePolarDomain(
    [10, radiusRes],
    [22, thetaRes],
    domainToWorld
  );
  const naleeSystem = createNaleeSystem(
    domain,
    config,
    domainToWorld,
    colors,
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

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
