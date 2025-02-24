import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawGridPattern } from './system';

const colors = ['#0066FF', '#003399', '#000066'];
const bg = '#F0F0F0';

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    drawGridPattern(
      {
        width,
        height,
        cellSize: 54,
        stairCount: 3,
        chequerboardCount: 2,
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
