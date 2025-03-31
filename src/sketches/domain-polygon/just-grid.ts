import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateDomainSystem } from './domain-polygon-system';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('697379');
Random.setSeed('792545');

const outline = '#333';
const bg = '#fff';

const config = {
  gap: 0.02,
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
    context.lineWidth = 2;
    context.fillStyle = bg;
    domains.forEach((d) => {
      context.beginPath();
      context.rect(d.x, d.y, d.width, d.height);
      context.fill();
      context.stroke();
    });

    // Draw grid lines
    context.strokeStyle = '#aaa';
    context.lineWidth = 1;

    for (let x = grid.x; x <= grid.w; x += grid.xRes) {
      context.beginPath();
      context.moveTo(x + grid.gap / 2, grid.y);
      context.lineTo(x + grid.gap / 2, grid.y + grid.h);
      context.stroke();
    }
    for (let y = grid.y; y <= grid.h; y += grid.yRes) {
      context.beginPath();
      context.moveTo(grid.x, y + grid.gap / 2);
      context.lineTo(grid.x + grid.w, y + grid.gap / 2);
      context.stroke();
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
