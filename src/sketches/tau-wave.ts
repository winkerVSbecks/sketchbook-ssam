import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes as autoAlbersPalettes } from '../colors/auto-albers';
import { palettes as mindfulPalettes } from '../colors/mindful-palettes';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';

const TAU = Math.PI * 2;

const colors = Random.pick([...autoAlbersPalettes, ...mindfulPalettes]);
const bg = colors.shift()!;

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const xFn = Random.pick([Math.sin, Math.cos]);
  const yFn = Random.pick([Math.sin, Math.cos]);

  wrap.render = ({ width, height, playhead, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const range = TAU * TAU;

    for (let x = -range; x < range; x++) {
      for (let y = -range; y < range; y++) {
        const color = colors[Math.floor(x + y) % colors.length];

        let radius = width / range;
        const cx = x * radius + radius * xFn(x / TAU + TAU * playhead);
        const cy = y * radius + radius * yFn(x / TAU + TAU * playhead);
        radius = radius + Math.sin(x / TAU + TAU * playhead);

        context.fillStyle = color;
        context.fillRect(cx, cy, radius, radius);
      }
    }

    const ditheredImage = scaleCanvasAndApplyDither(
      width,
      height,
      0.5,
      canvas,
      (data) =>
        dither(data, {
          greyscaleMethod: 'none',
          ditherMethod: 'atkinson',
        })
    );
    context.drawImage(ditheredImage, 0, 0, width, height);
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
