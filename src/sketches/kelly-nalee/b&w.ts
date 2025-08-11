import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { createNaleeSystem, makeDomain, xyToCoords } from '../nalee';
import type { Config } from '../nalee';

const colors = [
  '#000',
  // '#fff',
  // 'oklch(0.985 0 0)',
  // 'oklch(0.97 0 0)',
  // 'oklch(0.922 0 0)',
  // 'oklch(0.87 0 0)',
  // 'oklch(0.708 0 0)',
  // 'oklch(0.556 0 0)',
  // 'oklch(0.439 0 0)',
  // 'oklch(0.371 0 0)',
  // 'oklch(0.269 0 0)',
  // 'oklch(0.205 0 0)',
  // 'oklch(0.145 0 0)',
];
const bg = '#fff';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 16;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 2,
    walkerCount: 30,
    padding: 1 / 128, //0.03125, // 1 / 32
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

    // Draw composition

    naleeSystem(props);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1920 / 2, 1080 / 2],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
