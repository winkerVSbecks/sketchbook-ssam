import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
const { colors, background, stroke } = tome.get();

const config = {
  gap: 0.01,
};

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
    [6, 6],
    [4, 4],
    [3, 3],
    [2, 2],
  ]);
  const gap = Math.min(width, height) * config.gap;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = stroke || background;
    context.fillRect(0, 0, width, height);

    generateAreas(res[1], res[0]).forEach((r) => {
      context.fillStyle = Random.pick(colors);
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = gap / 2 + r.x * w + gap / 2;
      const gY = gap / 2 + r.y * h + gap / 2;

      context.fillRect(gX, gY, gW, gH);
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
