import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';

const shades = Random.shuffle([0.05, Random.range(0.075, 0.15), 0.2]);

const colors = Array.from({ length: 3 }, () => {
  // const a = Random.range(0.05, 0.2);
  const a = shades.shift()!;
  return `color(display-p3 ${[a, a, a].join(' ')} / 1)`;
});
const background = '#000';

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  function generateAreas(rows: number, cols: number): Region[] {
    const grid: Grid = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(null));
    const regions: Region[] = [];
    let rowIndex = 0;

    while (rowIndex < rows) {
      const colIndex = grid[rowIndex].findIndex((cell) => cell === null);
      if (colIndex === -1) {
        rowIndex++;
        continue;
      }

      let maxWidth = 0,
        maxHeight = 0;

      while (
        colIndex + maxWidth < cols &&
        grid[rowIndex][colIndex + maxWidth] === null
      )
        maxWidth++;
      while (
        rowIndex + maxHeight < rows &&
        grid[rowIndex + maxHeight][colIndex] === null
      )
        maxHeight++;

      const region = {
        id: regions.length,
        x: colIndex,
        y: rowIndex,
        width: Random.rangeFloor(1, maxWidth),
        height: Random.rangeFloor(1, maxHeight),
      };

      for (let row = rowIndex; row < rowIndex + region.height; row++) {
        for (let col = colIndex; col < colIndex + region.width; col++) {
          grid[row][col] = region.id;
        }
      }
      regions.push(region);
    }
    return regions;
  }

  const res = Random.pick([
    [4, 4],
    [3, 3],
  ]);
  const gap = width * 0.01;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    generateAreas(res[0], res[1]).forEach((r) => {
      const x = gap / 2 + r.x * w + gap / 2;
      const y = gap / 2 + r.y * h + gap / 2;
      const rectW = r.width * w - gap;
      const rectH = r.height * h - gap;

      const D = [
        Random.range(x + rectW * 0.25, x + rectW * 0.75),
        Random.range(y + rectH * 0.25, y + rectH * 0.75),
      ];

      const pts = [
        [x, y],
        [D[0], y],
        [x + rectW, y],
        [x + rectW, D[1]],
        [x + rectW, y + rectH],
        [x, y + rectH],
      ];

      const faces = [
        [pts[0], pts[1], D, pts[5]],
        [pts[1], pts[2], pts[3], D],
        [D, pts[3], pts[4], pts[5]],
      ];

      faces.forEach((face, idx) => {
        context.fillStyle = colors[idx % colors.length];
        context.beginPath();
        drawPath(context, face);
        context.fill();
      });
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
