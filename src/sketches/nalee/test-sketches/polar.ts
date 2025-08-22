import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee-system';
import { makePolarDomain } from '../domain';
import { Config, DomainToWorld } from '../types';
import { randomPalette } from '../../../colors';

const colors = randomPalette();
const bg = colors.pop()!;

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
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const radius = width * 0.4;
  const [cx, cy] = [width / 2, height / 2];

  const radiusRes = 20;
  const thetaRes = 100;

  const domainToWorld: DomainToWorld = (r: number, theta: number) => {
    const worldX =
      cx +
      ((radius * r) / radiusRes) * Math.cos((theta * Math.PI * 2) / thetaRes);
    const worldY =
      cy +
      ((radius * r) / radiusRes) * Math.sin((theta * Math.PI * 2) / thetaRes);
    return [worldX, worldY];
  };

  const domain = makePolarDomain(radiusRes, thetaRes, domainToWorld);
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
  animate: false,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
