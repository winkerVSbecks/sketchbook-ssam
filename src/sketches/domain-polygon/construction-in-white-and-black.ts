import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { generateDomainSystem } from './domain-polygon-system';
import { randomPalette } from '../../colors';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
Random.setSeed('257104');

const bg = 'white';

const colors = Random.shuffle(randomPalette());

const config = {
  gap: 0, //0.005,
  debug: false,
  res: Random.pick([
    // [32, 32],
    // [24, 24],
    // [16, 16],
    [12, 12],
    [8, 8],
    [6, 6],
    [4, 4],
    [2, 2],
  ]),
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [0, 0, 0, 0],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    },
    {
      w: width * 1,
      h: height * 1,
      x: width * 0, //.03125,
      y: height * 0, //.03125,
    }
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    console.log(domains);

    domains.forEach((d) => {
      // Always left to right gradient
      const x0 = d.x;
      const y0 = d.y;
      const x1 = d.x + d.width;
      const y1 = d.y;
      const gradient = context.createLinearGradient(x0, y0, x1, y1);

      const c1 = colors[Math.floor(x0 % colors.length)];
      const c2 = colors[Math.floor(x1 % colors.length)];

      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c2);

      context.fillStyle = gradient;
      context.beginPath();
      context.rect(d.x, d.y, d.width, d.height);
      context.fill();
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [800 * 2, 600 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
