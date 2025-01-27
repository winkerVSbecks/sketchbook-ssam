import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';

const colors = ['#333', '#666', '#999', '#ccc', '#fff'];
// const colors = ['#aaa', '#ccc', '#eee', '#fff'];

const darken = (c: string, amount: number = 0.75) =>
  `oklch(from ${c} calc(l * ${amount}) c h)`;

type Stack = {
  color: string;
  x: number[];
  y: number[];
};

type Cube = {
  x: number;
  y: number;
  z: number;
  color: string;
};
const config = {
  sideLength: 48, //64,
  xRange: [-7, -4, -2],
  yRange: [-18, 18],
  zRange: [-18, 11],
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

  for (let z = config.zRange[0]; z < config.zRange[1]; z++) {
    if (z % 2 === 0) {
      for (let x = xMin; x < xMax; x++) {
        for (let y = yMin; y < yMax; y++) {
          cubes.push({
            x,
            y,
            z,
            color: darken(
              color,
              mapRange(z, config.zRange[0], config.zRange[1], 0, 1)
            ),
          });
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

    const stacks: Stack[] = [];
    let y = config.yRange[0];

    while (y < config.yRange[1]) {
      const color = Random.pick(colors);
      const span = Random.rangeFloor(3, 6);

      stacks.push({
        color,
        x: [
          config.xRange[0],
          Random.rangeFloor(config.xRange[1], config.xRange[2]),
        ],
        y: [y, y + span],
      });

      y += span;
    }

    stacks
      .map(generateStack)
      .flat()
      .sort((a, b) => a.y - b.y)
      .sort((a, b) => a.x - b.x)
      .forEach(drawCube);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 24_000,
  playFps: 1,
  exportFps: 1,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
