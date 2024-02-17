import { ssam } from 'ssam';
import Random from 'canvas-sketch-util/random';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { samples, interpolate, formatHex } from 'culori';
import { generateColors } from '../subtractive-color';

const colors = generateColors();

const direction = Random.pick(['horizontal', 'vertical']);
const a = Random.rangeFloor(0, 4);
const b = 6 - a;

function wobbly(x: number, t: number) {
  return Math.sin(a * x + b * t + 5) + Math.sin(b * x + a * t + 4);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const bg = colors.shift()!;
  const TAU = Math.PI * 2;

  const colorSale = interpolate(colors);
  const colorSamples = samples(width).map(colorSale).map(formatHex);
  const r = height * 0.24;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    for (let x = 0; x < width; x++) {
      const y =
        height * (0.5 + 0.125 * wobbly((x / width) * TAU, playhead * TAU));

      context.beginPath();
      if (direction === 'vertical') {
        context.fillStyle = colorSamples[Math.floor(y)]!;
        context.arc(y, x, r, 0, 2 * Math.PI);
      } else {
        context.fillStyle = colorSamples[Math.floor(x)]!;
        context.arc(x, y, r, 0, 2 * Math.PI);
      }
      context.fill();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
