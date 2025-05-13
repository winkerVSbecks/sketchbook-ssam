import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { domainSystemGenerator } from './domain-polygon-system';
import { Domain } from './types';

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
  const dsGen = domainSystemGenerator(config.res, config.gap, width, height, {
    inset: [0, 0, 0, 0],
    doCombineSmallRegions: true,
    doCombineNarrowRegions: true,
    doReduceNarrowRegions: true,
  });

  let ds = dsGen.next().value;
  let optimized = false;

  window.addEventListener('mousedown', () => {
    if (!optimized) {
      const next = dsGen.next();
      ds = next.value;
      optimized = !!next.done;
    }
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    ds.domains.forEach((d: Domain) => {
      rc.rectangle(d.x, d.y, d.width, d.height, {
        stroke: outline,
        strokeWidth: 2,
        fill: '#fff',
        fillStyle: 'solid',
      });
    });

    // Draw grid lines
    for (let x = ds.grid.x; x <= ds.grid.w; x += ds.grid.xRes) {
      rc.line(
        x + ds.grid.gap / 2,
        ds.grid.y,
        x + ds.grid.gap / 2,
        ds.grid.y + ds.grid.h,
        {
          stroke: gridLines,
          strokeWidth: 1,
        }
      );
    }
    for (let y = ds.grid.y; y <= ds.grid.h; y += ds.grid.yRes) {
      rc.line(
        ds.grid.x,
        y + ds.grid.gap / 2,
        ds.grid.x + ds.grid.w,
        y + ds.grid.gap / 2,
        {
          stroke: gridLines,
          strokeWidth: 1,
        }
      );
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);
