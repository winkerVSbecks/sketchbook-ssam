import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import PoissonDiskSampling from 'poisson-disk-sampling';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

const config = {
  res: [6, 4],
  gap: 0.02,
  minDistance: 5,
  maxDistance: 20,
  size: 2,
};

let { colors, background, stroke, name } = tome.get(/* 'spatial03' */);
stroke ??= Random.pick(colors);
console.log(name, stroke);

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

  const gap = Math.min(width, height) * config.gap;
  const w = (width - gap) / config.res[0];
  const h = (height - gap) / config.res[1];

  let pointCount = 0;
  let triangleCount = 0;

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    function fillPoints(shape: Point, offset: Point, color: string) {
      const p = new PoissonDiskSampling({
        shape,
        minDistance: config.minDistance,
        maxDistance: config.maxDistance,
        tries: 20,
      });
      const points = p.fill().map(([x, y]) => [offset[0] + x, offset[1] + y]);
      pointCount += points.length;

      context.fillStyle = color;
      const s = config.size * 1.5;
      points.forEach(([x, y]) => {
        context.fillRect(x - s / 2, y - s / 2, s, s);
      });
    }

    // fillPoints([width, height], [0, 0], Random.pick(colors));

    generateAreas(config.res[1], config.res[0]).forEach((r) => {
      const gW = r.width * w - gap;
      const gH = r.height * h - gap;
      const gX = gap / 2 + r.x * w + gap / 2;
      const gY = gap / 2 + r.y * h + gap / 2;

      fillPoints([gW, gH], [gX, gY], stroke);
    });

    console.log(
      new Intl.NumberFormat('en-CA', { maximumSignificantDigits: 3 }).format(
        /* pointCount +  */ triangleCount
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
