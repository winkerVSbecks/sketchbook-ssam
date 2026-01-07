import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wrap } from 'canvas-sketch-util/math';
import { invert } from '../../colors/rybitten';
import { getRect, makeGrid } from '../../grid';

const config = {
  cols: 128,
  rows: 128,
  gap: [0, 0],
};

const bg = '#fff';

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  // Random.setSeed(seed);
  Random.setSeed('#ffff');
  console.log('Seed:', seed);

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  const pixels = grid.map((cell) => ({
    ...cell,
    color: '#fff',
  }));

  console.log(grid);

  function drawLine([x1, y1]: Point, [x2, y2]: Point) {}

  // function drawXORLine(
  //   context: CanvasRenderingContext2D,
  //   x1: number,
  //   y1: number,
  //   x2: number,
  //   y2: number,
  //   thickness: number
  // ) {
  //   const dx = x2 - x1;
  //   const dy = y2 - y1;
  //   const length = Math.sqrt(dx * dx + dy * dy);
  //   const angle = Math.atan2(dy, dx);

  //   context.save();
  //   context.translate(x1, y1);
  //   context.rotate(angle);
  //   context.fillRect(0, -thickness / 2, length, thickness);
  //   context.restore();
  // }

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
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
