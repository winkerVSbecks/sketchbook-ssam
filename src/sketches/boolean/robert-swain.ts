import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wrap } from 'canvas-sketch-util/math';
import { invert } from '../../colors/rybitten';
import { getRect, makeGrid } from '../../grid';

const config = {
  cols: 4,
  rows: 3,
  gap: [25, 25],
};

const basePalette = [
  '#334E87',
  '#16344A',
  '#C3291D',
  '#8C3774',
  '#377D74',
  '#91B268',
  '#D2C641',
  '#66B8CD',
  '#B5DAD9',
  '#DDE6CE',
  '#B0D5F0',
  '#DCE9F1',
  '#F4F3F5',
  '#E76F51',
  '#F4A261',
];
const inversePalette = basePalette.map(invert);
const bg = '#fff';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    grid.forEach((cell) => {
      context.fillStyle = Random.pick(basePalette);
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
