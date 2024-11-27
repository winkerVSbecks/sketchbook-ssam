import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const config = {
  gridSize: 20,
  colors: ['#0066FF', '#003399', '#000066'],
  stairCount: 3,
  chequerboardCount: 2,
};

type Grid = boolean[][];

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cellSize = width / config.gridSize;

  const createGrid = (): Grid => {
    return Array.from({ length: config.gridSize }, () =>
      Array.from({ length: config.gridSize }, () => Random.value() > 0.5)
    );
  };

  const drawPixel = (x: number, y: number, filled: boolean) => {
    if (filled) {
      context.fillStyle = Random.pick(config.colors);
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  };

  const createStairs = (startX: number, startY: number, length: number) => {
    for (let i = 0; i < length; i++) {
      drawPixel(startX + i, startY + i, true);
    }
  };

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    const grid = createGrid();

    for (let y = 0; y < config.gridSize; y++) {
      for (let x = 0; x < config.gridSize; x++) {
        drawPixel(x, y, grid[y][x]);
      }
    }

    for (let i = 0; i < config.stairCount; i++) {
      const startX = Math.floor(Random.value() * (config.gridSize - 8));
      const startY = Math.floor(Random.value() * (config.gridSize - 8));
      createStairs(startX, startY, 8);
    }

    for (let i = 0; i < config.chequerboardCount; i++) {
      const startX = Math.floor(Random.value() * (config.gridSize - 5));
      const startY = Math.floor(Random.value() * (config.gridSize - 5));
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          if ((x + y) % 2 === 0) {
            drawPixel(startX + x, startY + y, true);
          }
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [400, 400],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch as Sketch<'2d'>, settings);
