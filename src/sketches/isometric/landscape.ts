import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';

let { colors, background, stroke } = tome.get();
colors = colors; //.filter((c: string) => c !== background && c !== stroke);
background ??= colors.shift();

const darken = (c: string, amount: number = 0.75) =>
  `oklch(from ${c} calc(l * ${amount}) c h)`;

type Cube = {
  c: number;
  r: number;
  z: number;
  color: string;
};
const config = {
  sideLength: 64, // 48,
  cubeCount: 24, //64,
  outline: 64,
};

const cubeColor = (c: Omit<Cube, 'color'>) =>
  colors[Math.min(c.c, c.r, c.z) % colors.length];
// colors[c.c % colors.length];

function generateCubes(): Cube[] {
  const cubes: Cube[] = [];

  // Start with initial cube
  cubes.push({
    c: 0,
    r: 0,
    z: 0,
    color: cubeColor({ c: 0, r: 0, z: 0 }),
  });

  while (cubes.length < config.cubeCount) {
    let cubeAdded = false;

    while (!cubeAdded) {
      const randomCube = Random.pick(cubes);
      let newCubeC = randomCube.c;
      let newCubeR = randomCube.r;
      let newCubeZ = randomCube.z;

      const r = Random.value();
      if (r < 0.3) {
        newCubeC++;
      } else if (r < 0.6) {
        newCubeR++;
      } else {
        newCubeZ++;
      }

      const spotTaken = cubes.some(
        (cube) =>
          cube.c === newCubeC && cube.r === newCubeR && cube.z === newCubeZ
      );

      if (!spotTaken) {
        cubes.push({
          c: newCubeC,
          r: newCubeR,
          z: newCubeZ,
          color: cubeColor({ c: newCubeC, r: newCubeR, z: newCubeZ }),
        });
        cubeAdded = true;
      }
    }
  }

  return cubes.sort((a, b) => {
    return `${a.z}.${a.r}.${a.c}`.localeCompare(`${b.z}.${b.r}.${b.c}`);
  });
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
      gridTopX + ((cube.c - cube.r) * config.sideLength * Math.sqrt(3)) / 2;
    const y =
      gridTopY +
      ((cube.c + cube.r) * config.sideLength) / 2 -
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
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[5].x, points[5].y);
    context.lineTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.closePath();
    context.fill();

    // Right face
    context.fillStyle = darken(cube.color, 0.5);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.lineTo(points[3].x, points[3].y);
    context.closePath();
    context.fill();

    // Top face
    context.fillStyle = darken(cube.color, 0.75);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(points[3].x, points[3].y);
    context.lineTo(points[4].x, points[4].y);
    context.lineTo(points[5].x, points[5].y);
    context.closePath();
    context.fill();
  }

  wrap.render = () => {
    const cubes = generateCubes();
    context.fillStyle = stroke || background;
    context.fillRect(0, 0, width, height);

    // context.strokeStyle = background;
    // context.lineWidth = config.outline;
    // context.strokeRect(0, 0, width, height);

    context.lineWidth = 2;
    cubes.forEach(drawCube);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 2,
  exportFps: 2,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
