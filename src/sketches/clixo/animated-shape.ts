import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../colors/clrs';
import { drawAnimatedClixo, drawClixo } from './draw-clixo';

const colors = Random.pick(clrs);
const bg = colors.pop();
const [fg1, fg2, fg3] = Random.shuffle(colors);

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const r = width / 10;
    const off = (width - 6 * r) / 2;

    const x = off + r;
    const y = off + r;

    // context.translate(off, off);

    drawAnimatedClixo(
      context,
      x,
      y,
      r,
      { base: fg1, ring: fg2, inner: fg3 },
      Math.sin(playhead * Math.PI)
    );
    // drawClixo(context, x, y, r, { base: fg1, ring: fg2, inner: fg3 });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
