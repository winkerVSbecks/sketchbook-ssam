import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const padding = 2;

const config = {
  res: 24 + padding * 2,
  grid: true,
  padding,
};

const bg = '#fff';

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

logColors(palette);

const rects = [
  {
    x: 8 + padding,
    y: 0 + padding,
    width: 13,
    height: 5,
    colors: [palette[0], palette[4]],
    type: 'blind',
  },
  {
    x: 0 + padding,
    y: 5 + padding,
    width: 8,
    height: 8,
    colors: [palette[1], palette[5]],
    type: 'blind',
  },
  {
    x: 21 + padding,
    y: 5 + padding,
    width: 3,
    height: 19,
    colors: [palette[2], palette[0]],
    type: 'blind',
  },
  {
    x: 8 + padding,
    y: 5 + padding,
    width: 13,
    height: 13,
    colors: [palette[3], palette[3]],
    type: 'static',
  },
];

function drawBlind(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  [colorA, colorB]: string[],
  t: number
) {
  // Determine animation direction based on aspect ratio
  const isHorizontal = height > width;

  // Save context and clip to the rectangle bounds
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  if (isHorizontal) {
    // Horizontal sliding - 3 rectangles moving in x direction
    // Total animated space is 3x the width (colorA, colorB, colorA)
    const offset = t * width * 2;

    // First rectangle: colorA (starts visible, slides out left)
    context.fillStyle = colorA;
    context.fillRect(x - offset, y, width, height);

    // Second rectangle: colorB (slides in from right)
    context.fillStyle = colorB;
    context.fillRect(x + width - offset, y, width, height);

    // Third rectangle: colorA (slides in last from right)
    context.fillStyle = colorA;
    context.fillRect(x + width * 2 - offset, y, width, height);
  } else {
    // Vertical sliding - 3 rectangles moving in y direction
    // Total animated space is 3x the height (colorA, colorB, colorA)
    const offset = t * height * 2;

    // First rectangle: colorA (starts visible, slides out top)
    context.fillStyle = colorA;
    context.fillRect(x, y - offset, width, height);

    // Second rectangle: colorB (slides in from bottom)
    context.fillStyle = colorB;
    context.fillRect(x, y + height - offset, width, height);

    // Third rectangle: colorA (slides in last from bottom)
    context.fillStyle = colorA;
    context.fillRect(x, y + height * 2 - offset, width, height);
  }

  // Restore context
  context.restore();
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

  wrap.render = ({ playhead }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const s = width / config.res;

    context.fillStyle = `rgba(0 0 0 / 0.01)`;
    context.fillRect(s, s, width - 2 * s, height - 2 * s);

    if (config.grid) {
      // draw grid
      context.strokeStyle = `oklch(from ${
        palette[palette.length - 1]
      } l c h / 0.01)`;

      context.lineWidth = 1;
      for (let y = s; y < height - s; y += s) {
        for (let x = s; x < width - s; x += s) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width - 0, y);
          context.stroke();

          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height - 0);
          context.stroke();
        }
      }
    }

    rects.forEach((r, i) => {
      if (r.type === 'static') {
        context.fillStyle = r.colors[0];
        context.fillRect(r.x * s, r.y * s, r.width * s, r.height * s);
        return;
      } else {
        const nextIndex = (i + 1) % palette.length;
        drawBlind(
          context,
          r.x * s,
          r.y * s,
          r.width * s,
          r.height * s,
          r.colors,
          playhead
        );
      }
    });
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
