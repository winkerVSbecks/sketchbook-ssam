import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { formatCss, oklch } from 'culori';
import { logColors } from '../../colors';

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
  },
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

logColors(palette);

const config = {
  scaleFactor: Number(Random.range(1, 5).toFixed(1)), // 1,
  mode: 'dots', // Random.pick(['dots', 'split']) as 'dots' | 'split',
  shiftScale: true, //Random.boolean(),
  num: 16,
  margin: 0,
  res: 4,
};

function drawSnowflake(
  context: CanvasRenderingContext2D,
  [tX, tY]: Point,
  [width, height]: Point,
  scaleFactor: number = config.scaleFactor,
  colors: string[],
) {
  const size = (width - config.margin * 2) / config.num;
  const [cx, cy] = [tX + width / 2, tY + height / 2];

  // context.strokeStyle = '#fff';
  // context.strokeRect(tX, tY, width, height);

  for (let i = 0; i < config.num; i++) {
    for (let j = 0; j < config.num; j++) {
      const x = tX + config.margin + size / 2 + i * size;
      const y = tY + config.margin + size / 2 + j * size;

      const dist = Math.hypot(x - cx, y - cy);
      // change style based on distance from center for each concentric square
      const style = Math.floor(dist) % 2 === 0;

      const distFromCenter = Math.hypot(x - cx, y - cy);
      const scaledDist = Math.pow(distFromCenter, scaleFactor);
      const colorIndex = Math.floor(scaledDist) % colors.length;

      const s = size * 0.25;

      if (config.mode === 'split') {
        if (style) {
          // draw X's
          context.strokeStyle = colors[colorIndex];
          context.lineWidth = 4;
          context.beginPath();
          context.moveTo(x - s, y - s);
          context.lineTo(x + s, y + s);
          context.moveTo(x + s, y - s);
          context.lineTo(x - s, y + s);
          context.stroke();
        } else {
          context.fillStyle = colors[colorIndex];
          context.beginPath();
          context.arc(x, y, s / 2, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        context.fillStyle = colors[colorIndex];
        context.strokeStyle = '#000';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(x, y, size / 2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
  }
}

function shiftHue(color: string, shift: number): string {
  return `hsl(from ${color} calc(h + ${shift}) s l)`;
}

const sketch = ({ context, wrap }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const w = width / config.res;

    const colors = palette.map((color) => shiftHue(color, playhead * 360));

    let scaleFactor = 1;
    for (let i = 0; i < config.res; i++) {
      for (let j = 0; j < config.res; j++) {
        drawSnowflake(
          context,
          [i * w, j * w],
          [w, w],
          scaleFactor /* 1 + i + j */,
          colors,
        );
        scaleFactor++;
      }
    }

    // context.lineWidth = 1;
    // context.strokeStyle = 'rgba(255,255,255,.5)';
    // for (let i = 0; i < config.res; i++) {
    //   for (let j = 0; j < config.res; j++) {
    //     context.strokeRect(i * w, j * w, w, w);
    //   }
    // }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1024, 1024],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
