import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const TAU = Math.PI * 2;

const config = {
  range: 40,
  offsetFunc: Random.pick([
    (x: number, y: number) => x - y,
    (x: number, y: number) => x + y,
    (x: number, y: number) => x,
    (x: number, y: number) => y,
    (x: number, y: number) => x * y,
    (x: number, y: number) => x / y,
    (x: number, y: number) => y / x,
    (x: number, y: number) => ((y ** 1 / x) * x ** 1) / y,
  ]),
};

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

    let radius = width / config.range;

    for (let x = -config.range; x < config.range; x++) {
      for (let y = -config.range; y < config.range; y++) {
        const color = colors[Math.floor(x + y) % colors.length];

        const cx = x * radius;
        const cy = y * radius;
        const r =
          radius / 2 +
          (radius / 2) *
            Math.sin(config.offsetFunc(x, y) / TAU + TAU * playhead);

        context.fillStyle = color;
        context.fillRect(cx, cy, r, r);
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
