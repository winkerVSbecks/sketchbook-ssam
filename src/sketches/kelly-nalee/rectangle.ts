import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import {
  createNaleeSystem,
  makeDomain,
  xyToCoords,
  clipDomainWithWorldCoords,
} from '../nalee';
import type { Config } from '../nalee';
import { clrs } from '../../colors/clrs';
import { drawPath } from '@daeinc/draw';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

let colors = Random.pick(clrs);
const bg = colors.pop();

const config = {
  x: 0.3,
  w: 0.6,
  y: 0.1,
  h: 0.8,
  debug: false,
};

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const clipRects: Point[][] = [
    [
      [config.x * width, config.y * height],
      [(config.x + config.w) * width, config.y * height],
      [(config.x + config.w) * width, (config.y + config.h) * height],
      [config.x * width, (config.y + config.h) * height],
    ],
  ];

  const size = 8;
  const naleeConfig = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 2,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    naleeConfig.resolution,
    naleeConfig.padding,
    width,
    height
  );

  const domain = makeDomain(naleeConfig.resolution, domainToWorld);
  const systems = clipRects.map((clipRect) => {
    const clippedDomain = clipDomainWithWorldCoords(domain, clipRect);
    return createNaleeSystem(
      clippedDomain,
      naleeConfig,
      domainToWorld,
      colors,
      bg
    );
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw composition
    if (config.debug) {
      context.strokeStyle = colors[0];
      clipRects.forEach((path) => {
        drawPath(context, path);
        context.stroke();
      });
    }

    systems.forEach((system) => {
      system(props);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
