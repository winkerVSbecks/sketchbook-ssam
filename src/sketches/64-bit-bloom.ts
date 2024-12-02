import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawGridPattern } from './grid-stairs/system';
import * as tome from 'chromotome';
import { ClusterConfig } from './cluster-growth/system';

const { colors, background: bg } = tome.get();

const config = {
  gridSize: 20,
  stairCount: 3,
  chequerboardCount: 2,
};

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const clusterConfig: ClusterConfig = {
    cellSize: 10,
    gap: 0,
    growthProbabilityMin: 0.05,
    growthProbabilityMax: 0.2,
    initialClusterSize: 8,
    chars: '░▒▓'.split(''),
    width,
    height,
  };

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    drawGridPattern(
      {
        width,
        height,
        ...config,
      },
      function drawPixel(
        x: number,
        y: number,
        cellSize: number,
        filled?: boolean
      ) {
        if (filled) {
          context.fillStyle = Random.pick(colors);
          context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    );
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
