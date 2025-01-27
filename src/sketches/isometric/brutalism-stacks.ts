import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const colors = ['#333', '#666', '#999', '#ccc', '#fff'];

const darken = (c: string, amount: number = 0.75) =>
  `oklch(from ${c} calc(l * ${amount}) c h)`;

type Cube = {
  x: number;
  y: number;
  z: number;
  color: string;
};
const config = {
  sideLength: 48, //64,
  layers: 4,
};

function generateStack({
  color,
  x: [xMin, xMax],
  y: [yMin, yMax],
}: {
  color: string;
  x: number[];
  y: number[];
}) {
  let cubes = [];

  for (let z = -5; z < config.layers; z++) {
    if (z % 2 === 0) {
      for (let x = xMin; x < xMax; x++) {
        for (let y = yMin; y < yMax; y++) {
          cubes.push({ x, y, z, color });
        }
      }
    }
  }

  return cubes;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const gridTopX = width / 2;
  const gridTopY = height / 2;

  function drawCube(cube: Cube) {
    const x =
      gridTopX + ((cube.x - cube.y) * config.sideLength * Math.sqrt(3)) / 2;
    const y =
      gridTopY +
      ((cube.x + cube.y) * config.sideLength) / 2 -
      config.sideLength * cube.z;

    const points = [];
    for (let angle = Math.PI / 6; angle < Math.PI * 2; angle += Math.PI / 3) {
      points.push({
        x: x + Math.cos(angle) * config.sideLength,
        y: y + Math.sin(angle) * config.sideLength,
      });
    }

    // Left face
    context.fillStyle = cube.color;
    context.strokeStyle = cube.color;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[5].x, points[5].y);
    context.lineTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.closePath();
    context.fill();
    context.stroke();

    // Right face
    context.fillStyle = darken(cube.color, 0.5);
    context.strokeStyle = darken(cube.color, 0.5);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.lineTo(points[3].x, points[3].y);
    context.closePath();
    context.fill();
    context.stroke();

    // Top face
    context.fillStyle = darken(cube.color, 0.75);
    context.strokeStyle = darken(cube.color, 0.75);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[3].x, points[3].y);
    context.lineTo(points[4].x, points[4].y);
    context.lineTo(points[5].x, points[5].y);
    context.closePath();
    context.fill();
    context.stroke();
  }

  wrap.render = () => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const stacks = generateAreas(5, 5)
      .map((r, idx) => {
        const color = colors[idx % colors.length];

        return {
          color,
          x: [r.x, r.x + r.width],
          y: [r.y, r.y + r.height],
        };
      })
      .map(generateStack);

    const cubes = stacks
      .flat()
      .sort((a, b) => a.y - b.y)
      .sort((a, b) => a.x - b.x)
      .forEach(drawCube);
  };
};

type Region = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Grid = (number | null)[][];

function generateAreas(rows: number, cols: number): Region[] {
  const grid: Grid = Array(rows * 2)
    .fill(null)
    .map(() => Array(cols * 2).fill(null));
  const regions: Region[] = [];
  let rowIndex = 0;

  while (rowIndex < rows * 2) {
    const colIndex = grid[rowIndex].findIndex((cell) => cell === null);
    if (colIndex === -1) {
      rowIndex++;
      continue;
    }

    let maxWidth = 0,
      maxHeight = 0;

    while (
      colIndex + maxWidth < cols * 2 &&
      grid[rowIndex][colIndex + maxWidth] === null
    )
      maxWidth++;
    while (
      rowIndex + maxHeight < rows * 2 &&
      grid[rowIndex + maxHeight][colIndex] === null
    )
      maxHeight++;

    const region = {
      id: regions.length,
      x: colIndex,
      y: rowIndex,
      width: Random.rangeFloor(2, maxWidth),
      height: Random.rangeFloor(2, maxHeight),
    };

    for (let row = rowIndex; row < rowIndex + region.height; row++) {
      for (let col = colIndex; col < colIndex + region.width; col++) {
        grid[row][col] = region.id;
      }
    }

    // shift the region to the center
    region.x -= cols;
    region.y -= rows;

    regions.push(region);
  }
  return regions;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 24_000,
  playFps: 1,
  exportFps: 1,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
