import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  const rc = rough.canvas(canvas);

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

  function drawArea([x, y]: Point, [width, height]: Point, [w, h]: Point) {
    context.strokeStyle = '#fff';
    const opts = {
      stroke: '#fff',
      bowing: 0.5,
      roughness: 1,
    };

    const w1 = 1.5 * w;
    const h1 = 1.5 * h;

    rc.line(x + w1, y, x + width - w1, y, opts);
    rc.line(x + width, y + h1, x + width, y + height - h1, opts);
    rc.line(x + width - w1, y + height, x + w1, y + height, opts);
    rc.line(x, y + h1, x, y + height - h1, opts);

    const cornerOpts = {
      stroke: '#fff',
      bowing: 0,
      roughness: 1,
      strokeWidth: 2,
    };

    rc.linearPath(
      [
        [x, y + h],
        [x, y],
        [x + w, y],
      ],
      cornerOpts
    );
    rc.linearPath(
      [
        [x + width - w, y],
        [x + width, y],
        [x + width, y + h],
      ],
      cornerOpts
    );
    rc.linearPath(
      [
        [x + width, y + height - h],
        [x + width, y + height],
        [x + width - w, y + height],
      ],
      cornerOpts
    );
    rc.linearPath(
      [
        [x + w, y + height],
        [x, y + height],
        [x, y + height - h],
      ],
      cornerOpts
    );
  }

  const res = Random.pick([
    [4, 4],
    [3, 3],
    [2, 2],
  ]);
  const gap = width * 0.015;
  const margin = gap * 4;
  const w = (width - margin) / res[0];
  const h = (height - margin) / res[1];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const gridStep = [
      (width - margin) / (gap * 2),
      (height - margin) / (gap * 2),
    ];

    for (let x = margin / 2; x < width - margin / 2; x += gridStep[0]) {
      for (let y = margin / 2; y < height - margin / 2; y += gridStep[1]) {
        rc.rectangle(x - 1, y - 1, 2, 2, {
          fill: '#fff',
          fillStyle: 'solid',
          roughness: 0.25,
          bowing: 0,
        });
      }
    }

    generateAreas(res[1], res[0]).forEach((r, idx) => {
      drawArea(
        [margin / 2 + r.x * w + gap / 2, margin / 2 + r.y * h + gap / 2],
        [r.width * w - gap, r.height * h - gap],
        [gap, gap]
      );
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
