import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import PoissonDiskSampling from 'poisson-disk-sampling';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
let { colors, background, stroke } = tome.get();
stroke ??= Random.pick(colors);

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

  // const res = [16, 9];
  const res = [4 * 3, 3 * 3];
  const gap = Math.min(width, height) * 0.02;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  let pointCount = 0;

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    function fillPoints(shape: Point, offset: Point, color: string) {
      const p = new PoissonDiskSampling({
        shape,
        minDistance: 5,
        maxDistance: 20, // gW * 0.1,
        tries: 20,
      });
      const points = p.fill();
      pointCount += points.length;

      context.fillStyle = color;
      points.forEach(([x, y]) => {
        context.fillRect(offset[0] + x, offset[1] + y, 2, 2);
      });
    }

    fillPoints([width, height], [0, 0], Random.pick(colors));

    generateAreas(res[1], res[0]).forEach((r) => {
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = gap / 2 + r.x * w + gap / 2;
      const gY = gap / 2 + r.y * h + gap / 2;

      fillPoints([gW, gH], [gX, gY], stroke);
      fillPoints([gW, gH], [gX, gY], Random.pick(colors));
      // fillPoints([gW, gH], [gX, gY], Random.pick(colors));
      // fillPoints([gW, gH], [gX, gY], Random.pick(colors));
    });

    console.log(
      new Intl.NumberFormat('en-CA', { maximumSignificantDigits: 3 }).format(
        pointCount
      )
    );
  };
};

export const settings: SketchSettings = {
  dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
