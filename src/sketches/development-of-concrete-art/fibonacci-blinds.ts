import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const padding = 2;

const config = {
  colorCount: 6,
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
    color: palette[0],
  },
  {
    x: 0 + padding,
    y: 5 + padding,
    width: 8,
    height: 8,
    color: palette[1],
  },
  {
    x: 8 + padding,
    y: 5 + padding,
    width: 13,
    height: 13,
    color: palette[2],
  },
  {
    x: 21 + padding,
    y: 5 + padding,
    width: 3,
    height: 19,
    color: palette[3],
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

  // Create a ping-pong animation (0 -> 1 -> 0)
  const progress = t < 0.5 ? t * 2 : 2 - t * 2;

  // Determine which color to use as base and which as reveal
  const baseColor = t < 0.5 ? colorA : colorB;
  const revealColor = t < 0.5 ? colorB : colorA;

  // Draw base color
  context.fillStyle = baseColor;
  context.fillRect(x, y, width, height);

  // Draw revealing blind
  context.fillStyle = revealColor;

  if (isHorizontal) {
    // Horizontal blinds - animate in x direction
    const revealWidth = width * progress;
    context.fillRect(x, y, revealWidth, height);
  } else {
    // Vertical blinds - animate in y direction
    const revealHeight = height * progress;
    context.fillRect(x, y, width, revealHeight);
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
      const nextIndex = (i + 1) % palette.length;
      drawBlind(
        context,
        r.x * s,
        r.y * s,
        r.width * s,
        r.height * s,
        [r.color, palette[nextIndex]],
        playhead
      );
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
