import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const config = {
  gridSize: 20,
  colors: ['#0066FF', '#003399', '#000066'],
  // prettier-ignore
  chars: ['⬚', '▨', '▧', '▦', '▥', '▤', '▣', '▪', '▫', '◾', '◽', '⬒', '⬓', '⬔', '⬕', '◢', '◣', '◤', '◥', '▲', '▼',], // ['░', '▒', '▓'],
  fontSize: 20,
  clusterCount: 4,
  clusterSize: 6,
};

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cellSize = width / config.gridSize;

  const drawPixel = (x: number, y: number, color: string) => {
    context.fillStyle = color;
    context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  };

  const drawChar = (x: number, y: number, char: string) => {
    context.font = `${config.fontSize}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      char,
      x * cellSize + cellSize / 2,
      y * cellSize + cellSize / 2
    );
  };

  const createCluster = (startX: number, startY: number) => {
    const char = Random.pick(config.chars);
    const size = config.clusterSize;
    const density = Random.range(0.3, 0.7);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (startX + x >= config.gridSize || startY + y >= config.gridSize)
          continue;

        const shouldDraw = Random.value() < density;
        if (shouldDraw) {
          context.fillStyle = Random.value() > 0.5 ? '#fff' : '#000';
          drawChar(startX + x, startY + y, char);
        }
      }
    }
  };

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    // Base colored pattern
    for (let y = 0; y < config.gridSize; y++) {
      for (let x = 0; x < config.gridSize; x++) {
        if (Random.value() > 0.5) {
          drawPixel(x, y, Random.pick(config.colors));
        }
      }
    }

    // ASCII clusters
    for (let i = 0; i < config.clusterCount; i++) {
      const startX = Math.floor(
        Random.value() * (config.gridSize - config.clusterSize)
      );
      const startY = Math.floor(
        Random.value() * (config.gridSize - config.clusterSize)
      );
      createCluster(startX, startY);
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
