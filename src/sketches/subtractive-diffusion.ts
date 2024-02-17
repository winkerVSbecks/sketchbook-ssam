import Random from 'canvas-sketch-util/random';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColors } from '../subtractive-color';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed(764817);
console.log(Random.getSeed());

const colors = generateColors();
// const bg = colors.shift()!;

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const gridSize = 100; // Adjust for pattern detail
  const gridA: number[][] = [];
  const gridB: number[][] = [];

  // Initialize grids with some pattern in the center
  for (let i = 0; i < gridSize; i++) {
    gridA[i] = [];
    gridB[i] = [];
    for (let j = 0; j < gridSize; j++) {
      gridA[i][j] = 1;
      gridB[i][j] = 0;
    }
  }

  function reset() {
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        gridA[i][j] = 1;
        gridB[i][j] = 0;
      }
    }

    for (let i = 0; i < 5; i++) {
      const x = Random.rangeFloor(0, gridSize);
      const y = Random.rangeFloor(0, gridSize);
      gridB[x][y] = 1;
    }

    // const midX = gridSize / 2;
    // const midY = gridSize / 2;
    // for (let i = -5; i <= 5; i++) {
    //   for (let j = -5; j <= 5; j++) {
    //     gridB[midX + i][midY + j] = 1;
    //   }
    // }
  }

  // Gray-Scott parameters
  const Da = 0.16; // Diffusion rate of chemical A
  const Db = 0.08; // Diffusion rate of chemical B
  const f = 0.035; // 'Feed' rate
  const k = 0.06; // 'Kill' rate

  wrap.render = ({ width, height, frame }: SketchProps) => {
    if (frame === 0) {
      reset();
    }

    // Reaction-Diffusion Update
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 1; i < gridSize - 1; i++) {
        for (let j = 1; j < gridSize - 1; j++) {
          const a = gridA[i][j];
          const b = gridB[i][j];

          const laplaceA =
            gridA[i - 1][j] +
            gridA[i + 1][j] +
            gridA[i][j - 1] +
            gridA[i][j + 1] -
            4 * gridA[i][j];
          const laplaceB =
            gridB[i - 1][j] +
            gridB[i + 1][j] +
            gridB[i][j - 1] +
            gridB[i][j + 1] -
            4 * gridB[i][j];

          gridA[i][j] = a + Da * laplaceA - a * b * b + f * (1 - a);
          gridB[i][j] = b + Db * laplaceB + a * b * b - (k + f) * b;
        }
      }
    }

    // Draw
    const cellW = width / gridSize;
    const cellH = height / gridSize;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const val = gridA[i][j];
        context.fillStyle = colors[Math.floor(val * colors.length)]; // `rgb(${val * 255}, ${val * 255}, ${val * 255})`;
        context.fillRect(i * cellW, j * cellH, cellW, cellH);
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
