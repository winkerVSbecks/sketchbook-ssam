import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import pack from 'pack-spheres';
import { logColors } from '../../colors';

const config = {};

const bg = '#fff';
const fg = '#000';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  wrap.render = ({ playhead }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.fillStyle = fg;
    // draw text in center
    context.font = `${width / 10}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Grey Goo', width / 2, height / 2);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
