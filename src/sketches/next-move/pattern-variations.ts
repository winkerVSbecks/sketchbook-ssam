import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { wcagContrast } from 'culori';
import { loopNoise } from '../../loop-noise';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';

type PatternType = 'vertical' | 'diagonal' | 'radial' | 'spiral';

const config = {
  resolution: { x: 32, y: 32 },
  scale: 1,
  mode: Random.pick(['solid', 'hachure', 'mixed']),
  pattern: Random.pick([
    'vertical',
    'diagonal',
    'radial',
    'spiral',
  ]) as PatternType,
  // Pattern-specific settings
  diagonalAngle: Random.range(-0.5, 0.5), // For diagonal pattern
  radialScale: Random.range(0.8, 1.2), // For radial pattern
  spiralTightness: Random.range(0.1, 0.3), // For spiral pattern
};
console.log(config);

const [colorA, colorB] = colorPalette();
console.log(colorA, colorB);

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const rc = rough.canvas(canvas);

  // Calculate position based on pattern type
  const getPosition = (
    x: number,
    y: number,
    w: number,
    h: number,
    width: number,
    height: number,
    playhead: number
  ) => {
    const centerX = width / 2;
    const centerY = height / 2;

    switch (config.pattern) {
      case 'diagonal':
        return {
          x: x * w - w * 0.5 + w * 0.5 + y * config.diagonalAngle * w,
          y: y * h,
        };

      case 'radial': {
        const dx = x - config.resolution.x / 2;
        const dy = y - config.resolution.y / 2;
        const angle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy) * config.radialScale;

        return {
          x: centerX + Math.cos(angle) * distance * w,
          y: centerY + Math.sin(angle) * distance * h,
        };
      }

      case 'spiral': {
        const dx = x - config.resolution.x / 2;
        const dy = y - config.resolution.y / 2;
        const baseAngle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const spiral = baseAngle + distance * config.spiralTightness;

        return {
          x: centerX + Math.cos(spiral) * distance * w,
          y: centerY + Math.sin(spiral) * distance * h,
        };
      }

      default: // 'vertical'
        return {
          x: x * w - w * 0.5 + w * 0.5,
          y: y * h,
        };
    }
  };

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

        const t1 = Math.floor(t * 10);
        const offset = x % 2 === 0 ? 1 : 0;
        const color = (t1 + offset) % 2 === 0 ? colorA : colorB;

        // Get position based on pattern type
        const pos = getPosition(x, y, w, h, width, height, playhead);

        if (config.mode === 'mixed') {
          rc.rectangle(pos.x, pos.y, w, h, {
            stroke: color,
            fill: color,
            fillStyle: 'solid',
          });

          rc.rectangle(pos.x, pos.y, w, h, {
            stroke: 'none',
            fill: (t1 + offset) % 2 === 0 ? colorB : colorA,
            fillStyle: 'hachure',
          });
        } else {
          rc.rectangle(pos.x, pos.y, w, h, {
            stroke: config.mode === 'solid' ? color : 'none',
            fill: color,
            fillStyle: config.mode,
          });
        }
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
