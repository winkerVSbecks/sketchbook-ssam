import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp, lerpFrames } from 'canvas-sketch-util/math';
import eases from 'eases';
import { randomPalette } from '../../colors';

const colors = randomPalette();
const background = colors.shift()!;
const stroke = colors.shift()!;

const config = {
  gap: 0.01,
  stroke: 4,
  loops: 4,
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

  const layers = Array.from({ length: 3 }).map(() => layer());

  const outlineLayers = Array.from({ length: config.loops }).map(
    () => layer()[1]
  );

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    layers.forEach(([color, areas]) => {
      areas.forEach((r) => {
        context.fillStyle = color;
        context.fillRect(r.x, r.y, r.w, r.h);
      });
    });

    context.strokeStyle = stroke;
    context.lineWidth = config.stroke;

    const loop = Math.floor(playhead * config.loops);

    const pOutlineLayer = outlineLayers[loop];
    const nOutlineLayer = outlineLayers[loop + 1]
      ? outlineLayers[loop + 1]
      : outlineLayers[0];

    const loopProgress = (playhead * config.loops) % 1;
    const t = eases.expoOut(loopProgress);

    pOutlineLayer.forEach((fromA, idx) => {
      const toA = nOutlineLayer[idx];

      if (toA) {
        const { x: fX, y: fY, w: fW, h: fH } = fromA;
        const { x: tX, y: tY, w: tW, h: tH } = toA;
        const x = lerp(fX, tX, t);
        const y = lerp(fY, tY, t);
        const w = lerp(fW, tW, t);
        const h = lerp(fH, tH, t);

        context.strokeRect(
          x + config.stroke / 2,
          y + config.stroke / 2,
          w - config.stroke,
          h - config.stroke
        );
      }
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_500 * (config.loops + 1),
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
