import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';
import { clrs as palettes } from '../colors/clrs';
// import { palettes } from '../colors/auto-albers';
// import { palettes } from '../colors/mindful-palettes';

// const colors = {
//   base: ['#526EA5', '#8C977E', '#334B6B', '#8C977E'],
//   highlights: [
//     '#D5AF75',
//     '#E2D8BF',
//     '#D66248',
//     '#A8B2D7',
//     '#512768',
//     '#1D2B6C',
//   ],
// };
const colors = {
  base: Random.pick(palettes),
  highlights: Random.pick(palettes),
};

const config = {
  rows: 12,
  cols: 6,
  gap: 0,
  highlightSize: 8,
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  function grid(cols: number, rows: number) {
    const gap = width * config.gap;
    const w = (width - gap) / cols;
    const h = (height - gap) / rows;

    return { rows, cols, w, h };
  }

  wrap.render = ({ width, height, canvas }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    const bg = grid(config.cols, config.rows);

    for (let x = 0; x < bg.cols; x++) {
      for (let y = 0; y < bg.rows; y++) {
        const colorIndex = (x % 2 === 0 ? y : y + 1) % colors.base.length;
        context.fillStyle = colors.base[colorIndex];
        context.fillRect(x * bg.w, y * bg.h, bg.w, bg.h);
      }
    }

    const hg = grid(config.cols * 4, config.rows);

    for (let x = 1; x < hg.cols; x++) {
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';

      Array.from({ length: hg.rows * 18 }).forEach((_, idx) => {
        const y = lerp(0, hg.rows * hg.h, idx / (hg.rows * 18));
        context.beginPath();
        context.moveTo(x * hg.w - 5, y);
        context.lineTo(x * hg.w + 5, y);
        context.stroke();
      });
    }

    for (let y = 0; y < hg.rows; y++) {
      const h = hg.h / config.highlightSize;
      const y1 = Random.rangeFloor(0, config.highlightSize - 1) * h;

      if (Random.chance(0.4)) {
        context.fillStyle = Random.pick(colors.highlights);
        context.fillRect(0, y1 + y * hg.h, width, h);
      } else {
        let start = 0;

        while (start < hg.cols) {
          const x = Random.rangeFloor(2, 8);
          const w = x * hg.w;

          context.fillStyle = Random.pick(colors.highlights);
          context.fillRect(start * hg.w, y1 + y * hg.h, start + w, h);

          start += x;
        }
      }
    }

    const ditheredImage = scaleCanvasAndApplyDither(
      width,
      height,
      0.5,
      canvas,
      (data) =>
        dither(data, {
          greyscaleMethod: 'none',
          ditherMethod: 'atkinson',
        })
    );
    context.drawImage(ditheredImage, 0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
