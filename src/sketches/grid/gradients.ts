import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
// const { colors, background, stroke } = tome.get();
// import { clrs } from '../../colors/clrs';
// import { palettes } from '../../colors/auto-albers';
import { palettes } from '../../colors/mindful-palettes';

const config = {
  gap: 0.01,
  debug: false,
};

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const colors = Random.pick(palettes);
const bg = colors.pop()!;

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  function generateAreas(rows: number, cols: number): Region[] {
    const regions: Region[] = [];
    let colIndex = 0;

    while (colIndex < cols) {
      const span = Random.rangeFloor(colIndex + 1, cols) ?? 1;

      const region = {
        id: regions.length,
        x: colIndex,
        y: 0,
        width: span - colIndex,
        height: rows,
      };

      colIndex = span;

      regions.push(region);
    }

    return regions;
  }

  const res = Random.pick([
    [12, 12],
    [8, 8],
    [6, 6],
    [4, 4],
    [2, 2],
  ]);
  const gap = Math.min(width, height) * config.gap;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  function makeGradient() {
    const colorA = Random.pick(colors);
    const colorB = Random.pick(colors);
    const colorC = Random.pick(colors);
    const gradient = context.createLinearGradient(
      width / 2,
      0,
      width / 2,
      height
    );
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(Random.range(0.25, 0.75), colorB);
    gradient.addColorStop(1, colorC);
    return gradient;
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    generateAreas(res[1], res[0]).forEach((r) => {
      context.fillStyle = makeGradient(); // Random.pick(colors);
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = gap / 2 + r.x * w + gap / 2;
      const gY = gap / 2 + r.y * h + gap / 2;

      context.fillRect(gX, gY, gW, gH);
    });

    if (config.debug) {
      context.fillStyle = 'rgba(255, 0, 0, 0.4)';
      for (let x = 0; x < res[0]; x++) {
        context.fillRect(gap + x * w, gap, w - gap, height - 2 * gap);
      }
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
