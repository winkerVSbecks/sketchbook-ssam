import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const config = {
  gridSize: 20,
  colors: ['#0066FF', '#003399', '#000066'],
  chars: [
    '⬚',
    '▨',
    '▧',
    '▦',
    '▥',
    '▤',
    '▣',
    '▪',
    '▫',
    '◾',
    '◽',
    '⬒',
    '⬓',
    '⬔',
    '⬕',
    '◢',
    '◣',
    '◤',
    '◥',
    '▲',
    '▼',
  ],
  fontSize: 20,
  clusterCount: 4,
  clusterSize: 6,
};

type Pattern = 'diagonal' | 'checker' | 'spiral' | 'dots';
type GridCell = {
  colored: boolean;
  char?: string;
  charColor?: string;
  pattern?: Pattern;
  noise?: boolean;
};

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cellSize = width / config.gridSize;

  const applyPattern = (x: number, y: number, type: Pattern): boolean => {
    switch (type) {
      case 'diagonal':
        return (x + y) % 3 === 0;
      case 'checker':
        return (x + y) % 2 === 0;
      case 'spiral':
        return Math.sqrt(x * x + y * y) % 4 < 2;
      case 'dots':
        return x % 3 === 0 && y % 3 === 0;
      default:
        return false;
    }
  };

  const createGrid = (): GridCell[][] => {
    return Array.from({ length: config.gridSize }, (_, y) =>
      Array.from({ length: config.gridSize }, (_, x) => {
        const pattern = Random.pick([
          'diagonal',
          'checker',
          'spiral',
          'dots',
        ] as Pattern[]);
        return {
          colored: applyPattern(x, y, pattern),
          pattern,
          noise: Random.value() > 0.9,
        };
      })
    );
  };

  const drawNoise = (x: number, y: number) => {
    const offset = Random.range(-2, 2);
    context.save();
    context.globalAlpha = Random.range(0.3, 0.7);
    context.translate(offset, offset);
    context.fillText(
      Random.pick(config.chars),
      x * cellSize + cellSize / 2,
      y * cellSize + cellSize / 2
    );
    context.restore();
  };

  const drawCell = (x: number, y: number, cell: GridCell) => {
    if (cell.colored) {
      context.fillStyle = Random.pick(config.colors);
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }

    if (cell.char) {
      context.font = `${config.fontSize}px monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = cell.charColor || '#000';
      context.fillText(
        cell.char,
        x * cellSize + cellSize / 2,
        y * cellSize + cellSize / 2
      );

      if (cell.noise) {
        drawNoise(x, y);
      }
    }
  };

  const createCluster = (
    grid: GridCell[][],
    startX: number,
    startY: number
  ) => {
    const char = Random.pick(config.chars);
    const density = Random.range(0.3, 0.7);
    const pattern = Random.pick([
      'diagonal',
      'checker',
      'spiral',
      'dots',
    ] as Pattern[]);

    for (let y = 0; y < config.clusterSize; y++) {
      for (let x = 0; x < config.clusterSize; x++) {
        if (startX + x >= config.gridSize || startY + y >= config.gridSize)
          continue;

        if (applyPattern(x, y, pattern) && Random.value() < density) {
          grid[startY + y][startX + x] = {
            ...grid[startY + y][startX + x],
            char,
            charColor: Random.value() > 0.5 ? '#fff' : '#000',
            noise: Random.value() > 0.8,
          };
        }
      }
    }
  };

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    const grid = createGrid();

    for (let i = 0; i < config.clusterCount; i++) {
      const startX = Math.floor(
        Random.value() * (config.gridSize - config.clusterSize)
      );
      const startY = Math.floor(
        Random.value() * (config.gridSize - config.clusterSize)
      );
      createCluster(grid, startX, startY);
    }

    for (let y = 0; y < config.gridSize; y++) {
      for (let x = 0; x < config.gridSize; x++) {
        drawCell(x, y, grid[y][x]);
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

// import { ssam } from 'ssam';
// import type { Sketch, SketchProps, SketchSettings } from 'ssam';
// import Random from 'canvas-sketch-util/random';

// const config = {
//   gridSize: 20,
//   colors: ['#0066FF', '#003399', '#000066'],
//   chars: [
//     '⬚',
//     '▨',
//     '▧',
//     '▦',
//     '▥',
//     '▤',
//     '▣',
//     '▪',
//     '▫',
//     '◾',
//     '◽',
//     '⬒',
//     '⬓',
//     '⬔',
//     '⬕',
//     '◢',
//     '◣',
//     '◤',
//     '◥',
//     '▲',
//     '▼',
//   ],
//   fontSize: 20,
//   clusterCount: 4,
//   clusterSize: 6,
// };

// type Pattern = 'diagonal' | 'checker' | 'spiral' | 'dots';
// type GridCell = {
//   colored: boolean;
//   char?: string;
//   charColor?: string;
//   pattern?: Pattern;
// };

// const sketch = ({ wrap, context, width, height }: SketchProps) => {
//   if (import.meta.hot) {
//     import.meta.hot.dispose(() => wrap.dispose());
//     import.meta.hot.accept(() => wrap.hotReload());
//   }

//   const cellSize = width / config.gridSize;

//   const applyPattern = (x: number, y: number, type: Pattern): boolean => {
//     switch (type) {
//       case 'diagonal':
//         return (x + y) % 3 === 0;
//       case 'checker':
//         return (x + y) % 2 === 0;
//       case 'spiral':
//         return Math.sqrt(x * x + y * y) % 4 < 2;
//       case 'dots':
//         return x % 3 === 0 && y % 3 === 0;
//       default:
//         return false;
//     }
//   };

//   const createGrid = (): GridCell[][] => {
//     return Array.from({ length: config.gridSize }, (_, y) =>
//       Array.from({ length: config.gridSize }, (_, x) => {
//         const pattern = Random.pick([
//           'diagonal',
//           'checker',
//           'spiral',
//           'dots',
//         ] as Pattern[]);
//         return {
//           colored: applyPattern(x, y, pattern),
//           pattern,
//         };
//       })
//     );
//   };

//   const drawCell = (x: number, y: number, cell: GridCell) => {
//     if (cell.colored) {
//       context.fillStyle = Random.pick(config.colors);
//       context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
//     }

//     if (cell.char) {
//       context.font = `${config.fontSize}px monospace`;
//       context.textAlign = 'center';
//       context.textBaseline = 'middle';
//       context.fillStyle = cell.charColor || '#000';
//       context.fillText(
//         cell.char,
//         x * cellSize + cellSize / 2,
//         y * cellSize + cellSize / 2
//       );
//     }
//   };

//   const createCluster = (
//     grid: GridCell[][],
//     startX: number,
//     startY: number
//   ) => {
//     const char = Random.pick(config.chars);
//     const density = Random.range(0.3, 0.7);
//     const pattern = Random.pick([
//       'diagonal',
//       'checker',
//       'spiral',
//       'dots',
//     ] as Pattern[]);

//     for (let y = 0; y < config.clusterSize; y++) {
//       for (let x = 0; x < config.clusterSize; x++) {
//         if (startX + x >= config.gridSize || startY + y >= config.gridSize)
//           continue;

//         if (applyPattern(x, y, pattern) && Random.value() < density) {
//           grid[startY + y][startX + x].char = char;
//           grid[startY + y][startX + x].charColor =
//             Random.value() > 0.5 ? '#fff' : '#000';
//         }
//       }
//     }
//   };

//   wrap.render = () => {
//     context.fillStyle = '#F0F0F0';
//     context.fillRect(0, 0, width, height);

//     const grid = createGrid();

//     for (let i = 0; i < config.clusterCount; i++) {
//       const startX = Math.floor(
//         Random.value() * (config.gridSize - config.clusterSize)
//       );
//       const startY = Math.floor(
//         Random.value() * (config.gridSize - config.clusterSize)
//       );
//       createCluster(grid, startX, startY);
//     }

//     for (let y = 0; y < config.gridSize; y++) {
//       for (let x = 0; x < config.gridSize; x++) {
//         drawCell(x, y, grid[y][x]);
//       }
//     }
//   };
// };

// export const settings: SketchSettings = {
//   mode: '2d',
//   dimensions: [400, 400],
//   pixelRatio: window.devicePixelRatio,
//   animate: true,
//   duration: 3000,
//   playFps: 0.3333333333,
//   exportFps: 0.3333333333,
// };

// ssam(sketch as Sketch<'2d'>, settings);
