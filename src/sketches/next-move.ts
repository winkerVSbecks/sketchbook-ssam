import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { wcagContrast } from 'culori';
import { loopNoise } from '../loop-noise';
import { palettes as autoAlbersPalettes } from '../colors/auto-albers';
import { palettes as mindfulPalettes } from '../colors/mindful-palettes';
import { generateColors } from '../subtractive-color';

const config = {
  resolution: { x: 32, y: 32 },
  scale: 1,
  mode: 'hachure', // 'solid' 'hachure' 'mixed'
};

const [colorA, colorB] = colorPalette();
console.log(colorA, colorB);

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const rc = rough.canvas(canvas);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = config.mode === 'hachure' ? colorA : '#000';
    context.fillRect(0, 0, width, height);

    const w = width / config.resolution.x;
    const h = height / config.resolution.y;

    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        const t = Math.abs(
          loopNoise(
            x / (config.resolution.x * config.scale),
            y / (config.resolution.y * config.scale),
            playhead,
            0.25
          )
        );
        // get first decimal place of t
        const t1 = Math.floor(t * 10);

        const offset = x % 2 === 0 ? 1 : 0;
        // context.fillStyle = (t1 + offset) % 2 === 0 ? colorA : colorB;
        // context.fillRect(x * w - w * 0.5 + w * 0.5, y * h, w, h);
        const color = (t1 + offset) % 2 === 0 ? colorA : colorB;

        if (config.mode === 'mixed') {
          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: color,
            fill: color,
            fillStyle: 'solid',
          });

          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: 'none',
            fill: (t1 + offset) % 2 === 0 ? colorB : colorA,
            fillStyle: 'hachure',
          });
        } else {
          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: config.mode === 'solid' ? color : 'none',
            fill: color,
            fillStyle: config.mode, // 'hachure',
          });
        }
        // // scale the width of the rectangle by t
        // context.fillRect(x * w - w * t * 0.5, y * h, w * t, h);
      }
    }
  };
};

function colorPalette() {
  const colors = Random.chance()
    ? generateColors()
    : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

  const colorA = Random.pick(colors);
  const colorB = colors.sort(
    (a: string, b: string) => wcagContrast(colorA, b) - wcagContrast(colorA, a)
  )[0];

  return [colorA, colorB];
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
