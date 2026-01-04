import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import pack from 'pack-spheres';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';

const config = {
  style: 'monochrome', //Random.pick(['monochrome', 'colored']),
  text: 'stacked', //Random.pick(['simple', 'stacked']),
};

const bg = '#111';
const fg = '#fefefe';

const palette = ColorPaletteGenerator.generate(
  { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
  Random.pick([
    'analogous',
    'complementary',
    'triadic',
    'tetradic',
    'splitComplementary',
    'tintsShades',
  ]),
  {
    style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
    modifiers: {
      sine: Random.range(-1, 1),
      wave: Random.range(-1, 1),
      zap: Random.range(-1, 1),
      block: Random.range(-1, 1),
    },
  }
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

function drawText(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string
) {
  const size = config.text === 'simple' ? width / 7 : width / 3;
  context.fillStyle = color;
  context.font = `900 ${size}px SF Mono`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (config.text === 'simple') {
    context.fillText('GENUARY', width / 2, height / 2);
  } else {
    context.fillText('GEN*', width / 2, height / 2 - size / 2);
    context.fillText('UARY', width / 2, height / 2 + size / 2);
  }
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  // Create offscreen canvas for pixel lookup
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const offscreenCtx = offscreenCanvas.getContext('2d')!;

  // Draw text to offscreen canvas for collision detection
  offscreenCtx.fillStyle = '#fff';
  offscreenCtx.fillRect(0, 0, width, height);
  drawText(offscreenCtx, width, height, '#000');

  // Get pixel data for collision detection
  const imageData = offscreenCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Function to check if a pixel is part of text (black)
  const isTextPixel = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
    // Check if pixel is dark (text)
    return pixels[idx] < 128;
  };

  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  const margin = width * 0.05;
  const scale = width - margin * 2;

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const shapes = pack({
      dimensions: 2,
      padding: 0.001,
      maxCount: 5000,
      packAttempts: 1000,
      minRadius: 0.005,
      outside: (position: number[], radius: number, padding: number) => {
        // check if circle is outside the margin
        const maxBound = 1;
        for (let i = 0; i < position.length; i++) {
          const component = position[i];
          if (
            Math.abs(component + radius) >= maxBound ||
            Math.abs(component - radius) >= maxBound
          ) {
            return true;
          }
        }

        // Convert normalized position to canvas coordinates
        const x = mapRange(position[0], -1, 1, margin, width - margin);
        const y = mapRange(position[1], -1, 1, margin, height - margin);
        const r = (radius * scale) / 2;
        const totalRadius = r + (padding * scale) / 2;

        // Sample points around the circle to check for text collision
        const samples = Math.max(8, Math.ceil(totalRadius * 0.5));
        for (let i = 0; i < samples; i++) {
          const angle = (i / samples) * Math.PI * 2;
          const checkX = x + Math.cos(angle) * totalRadius;
          const checkY = y + Math.sin(angle) * totalRadius;

          if (isTextPixel(checkX, checkY)) {
            return true; // Circle would overlap with text
          }
        }

        // Also check the center
        if (isTextPixel(x, y)) {
          return true;
        }

        return false;
      },
    });

    const circles = shapes.map((shape: any) => ({
      x: mapRange(shape.position[0], -1, 1, margin, width - margin),
      y: mapRange(shape.position[1], -1, 1, margin, height - margin),
      r: (shape.radius * scale) / 2,
    }));

    circles.forEach((c: any) => {
      context.fillStyle =
        config.style === 'monochrome' ? fg : Random.pick(palette);
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 6,
  exportFps: 6,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
