import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { state, spawnWalker } from './state-factory';
import { config } from './config-factory';
import { makeAsymmetricGrid } from './domain';
import { step, drawWalker } from './walker';

const colors = [
  '#FFDE73',
  '#EE7744',
  '#F9BC4F',
  '#2C7C79',
  '#4C4D78',
  '#FFF5E0',
  '#101019',
];

const bg = colors.pop()!;

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  state.grid = makeAsymmetricGrid();
  // bunch of random walkers
  new Array(config.walkerCount).fill(null).forEach(() => spawnWalker(colors));

  let initialWalkers = true;

  console.table({
    seed: Random.getSeed(),
    flat: config.flat,
    uniformPathStyle: config.uniformPathStyle,
    globalPathStyle: config.globalPathStyle,
  });

  while (state.mode !== 'complete') {
    state.walkers.forEach((walker) => {
      if (walker.state === 'alive') {
        step(walker);
      }
    });

    // spawn new walkers if there are dead ones
    const activeWalkers = state.walkers.filter(
      (walker) => walker.state === 'alive'
    );

    if (activeWalkers.length === 0 && initialWalkers) {
      initialWalkers = false;
    }

    if (activeWalkers.length === 0 && !initialWalkers) {
      spawnWalker(colors);
    }

    if (state.grid.every((cell) => cell.occupied)) {
      state.mode = 'complete';
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    state.walkers.forEach((walker) => {
      drawWalker(context, walker, width, height, playhead, bg);
    });

    // drawGrid(context, state.grid, width, height, '#FFF5E0');
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
