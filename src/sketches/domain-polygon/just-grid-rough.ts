import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { generateDomainSystem } from './domain-polygon-system';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('697379');
// Random.setSeed('792545');
// Random.setSeed('81889');

const outline = '#333';
const gridLines = '#aaa';
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

export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  const rc = rough.canvas(canvas);
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

    domains.forEach((d) => {
      rc.rectangle(d.x, d.y, d.width, d.height, {
        stroke: outline,
        strokeWidth: 2,
        fill: '#fff',
        fillStyle: 'solid',
      });
    });

    // Draw grid lines
    for (let x = grid.x; x <= grid.w; x += grid.xRes) {
      rc.line(x + grid.gap / 2, grid.y, x + grid.gap / 2, grid.y + grid.h, {
        stroke: gridLines,
        strokeWidth: 1,
      });
    }
    for (let y = grid.y; y <= grid.h; y += grid.yRes) {
      rc.line(grid.x, y + grid.gap / 2, grid.x + grid.w, y + grid.gap / 2, {
        stroke: gridLines,
        strokeWidth: 1,
      });
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
