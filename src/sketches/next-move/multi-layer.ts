import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { wcagContrast } from 'culori';
import { loopNoise } from '../../loop-noise';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';

const config = {
  resolution: { x: 32, y: 32 },
  scale: 1,
  mode: 'solid', // Random.pick(['solid', 'hachure', 'mixed']),
  layers: 3, // Number of layers to draw
  layerOffset: 0.1, // Offset for each layer
  baseAlpha: 0.8, // Base transparency
};

const [colorA, colorB] = colorPalette();
console.log(colorA, colorB);

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const rc = rough.canvas(canvas);

  // Function to draw a single layer
  const drawLayer = (
    offset: number,
    alpha: number,
    width: number,
    height: number,
    playhead: number
  ) => {
    const w = width / config.resolution.x;
    const h = height / config.resolution.y;

    context.globalAlpha = alpha;
    const timeOffset = Math.sin(playhead * Math.PI * 2) / config.scale;

    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        const t = Math.abs(
          loopNoise(
            (x + offset) / (config.resolution.x * config.scale) + timeOffset,
            (y + offset) / (config.resolution.y * config.scale),
            playhead,
            0.25
          )
        );

        const t1 = Math.floor(t * 10);
        const xOffset = offset * Random.range(-w, w); // Add some randomness to offset
        const yOffset = offset * Random.range(-h, h);

        const offset2 = x % 2 === 0 ? 1 : 0;
        const color = (t1 + offset2) % 2 === 0 ? colorA : colorB;

        if (config.mode === 'mixed') {
          rc.rectangle(
            x * w - w * 0.5 + w * 0.5 + xOffset,
            y * h + yOffset,
            w,
            h,
            {
              stroke: color,
              fill: color,
              fillStyle: 'solid',
            }
          );

          rc.rectangle(
            x * w - w * 0.5 + w * 0.5 + xOffset,
            y * h + yOffset,
            w,
            h,
            {
              stroke: 'none',
              fill: (t1 + offset2) % 2 === 0 ? colorB : colorA,
              fillStyle: 'hachure',
            }
          );
        } else {
          rc.rectangle(
            x * w - w * 0.5 + w * 0.5 + xOffset,
            y * h + yOffset,
            w,
            h,
            {
              stroke: config.mode === 'solid' ? color : 'none',
              fill: color,
              fillStyle: config.mode,
            }
          );
        }
      }
    }
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    // Clear the canvas with base color
    context.fillStyle = config.mode === 'hachure' ? colorA : '#000';
    context.fillRect(0, 0, width, height);

    // Draw multiple layers with decreasing opacity
    for (let i = 0; i < config.layers; i++) {
      const layerAlpha = config.baseAlpha / (i + 1); // Each layer gets progressively more transparent
      const offset = i * config.layerOffset;
      drawLayer(offset, layerAlpha, width, height, playhead);
    }

    // Reset global alpha
    context.globalAlpha = 1;
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
  duration: 18_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
