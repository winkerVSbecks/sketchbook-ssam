import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';

const colors = randomPalette();
const background = colors.shift()!;
const stroke = colors.shift()!;

const config = {
  gap: 0.01,
  stroke: 4,
  allCells: Random.chance(),
};

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Area = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
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
    // [11, 8],
    // [10, 6],
    [6, 6],
    [4, 4],
  ]);
  const gap = Math.min(width, height) * config.gap;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  function layer(): [string, Area[]] {
    const areas = generateAreas(res[1], res[0])
      .map<Area>((r) => {
        const gW = r.width * w - gap;
        const gH = r.height * h - gap;
        const gX = gap / 2 + r.x * w + gap / 2;
        const gY = gap / 2 + r.y * h + gap / 2;

        return {
          x: gX,
          y: gY,
          w: gW,
          h: gH,
          color: Random.pick(colors),
        };
      })
      .reduce<{ [key: string]: Area[] }>((acc, curr) => {
        acc[curr.color] = acc[curr.color] || [];
        acc[curr.color].push(curr);
        return acc;
      }, {});

    // return color with the most areas
    return Object.entries(areas).reduce((acc, curr) => {
      return curr[1].length > acc[1].length ? curr : acc;
    });
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const layers = Array.from({ length: 3 }).map(() => layer());

    layers.forEach(([color, areas]) => {
      areas.forEach((r) => {
        context.fillStyle = color;
        context.fillRect(r.x, r.y, r.w, r.h);
      });
    });

    context.strokeStyle = stroke;
    context.lineWidth = config.stroke;

    if (config.allCells) {
      context.lineWidth = config.stroke / 2;
      context.setLineDash([5, 5]);
      // Draw every cell
      for (let i = 0; i < res[0]; i++) {
        for (let j = 0; j < res[1]; j++) {
          const x = gap / 2 + i * w + gap / 2;
          const y = gap / 2 + j * h + gap / 2;
          context.strokeRect(x, y, w - gap, h - gap);
        }
      }
    } else {
      layer()[1].forEach((r) => {
        context.strokeRect(
          r.x + config.stroke / 2,
          r.y + config.stroke / 2,
          r.w - config.stroke,
          r.h - config.stroke
        );
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
