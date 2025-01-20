import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

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
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]);
  const gap = 0; //width * 0.01;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];
  const s = width * 0.01;

  function fillStripes(location: Point, size: Point, t: number) {
    const [_w, _h] = size;
    const direction = _w >= _h ? 'vertical' : 'horizontal';

    context.save();
    context.beginPath();
    context.rect(...location, ...size);
    context.clip();

    let i = 0;
    if (direction === 'vertical') {
      for (let x = -s * 2; x < width; x += s) {
        context.fillStyle = i % 2 === 0 ? '#fff' : '#000';
        context.beginPath();
        context.rect(x + s * 2 * t, 0, s, height);
        context.fill();
        i++;
      }
    } else {
      for (let y = -s * 2; y < height; y += s) {
        context.fillStyle = i % 2 === 0 ? '#fff' : '#000';
        context.fillRect(0, y + s * 2 * t, width, s);
        i++;
      }
    }

    context.restore();
  }

  const areas = generateAreas(res[1], res[0]);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#000';
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    areas.forEach((r) => {
      const location: Point = [
        gap / 2 + r.x * w + gap / 2,
        gap / 2 + r.y * h + gap / 2,
      ];
      const size: Point = [r.width * w - gap, r.height * h - gap];
      fillStripes(location, size, playhead);
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
