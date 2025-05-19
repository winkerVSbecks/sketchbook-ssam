import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateDomainSystem } from './domain-polygon-system';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('697379');
// Random.setSeed('792545');

const outline = '#333';
const bg = '#fff';

const config = {
  gap: 0, //0.02,
  debug: false,
  res: Random.pick([
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains, grid } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [0, 0, 0, 0],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    }
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = outline;
    context.lineWidth = 8;
    context.fillStyle = bg;
    domains.forEach((d) => {
      // Always left to right gradient
      const x0 = d.x,
        y0 = d.y,
        x1 = d.x + d.width,
        y1 = d.y;
      const grad = context.createLinearGradient(x0, y0, x1, y1);
      // Dark on left, light on right
      const dark = Random.range(30, 80);
      const light = Random.range(200, 255);
      grad.addColorStop(0, `rgb(${dark},${dark},${dark})`);
      grad.addColorStop(1, `rgb(${light},${light},${light})`);
      context.fillStyle = grad;
      context.beginPath();
      context.rect(d.x, d.y, d.width, d.height);
      context.fill();
      // context.strokeStyle = outline;
      // context.lineWidth = 8;
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
