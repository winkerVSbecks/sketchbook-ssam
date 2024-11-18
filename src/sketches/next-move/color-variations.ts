import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import rough from 'roughjs';
import { wcagContrast, interpolate, formatHex, rgb } from 'culori';
import { loopNoise } from '../../loop-noise';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  gradient1: string;
  gradient2: string;
}

const config = {
  resolution: { x: 32, y: 32 },
  scale: 1,
  mode: Random.pick(['solid', 'hachure', 'mixed']),
  color: {
    useGradients: Random.chance(0.5),
    accentProbability: 0.1, // Chance of using accent color
    gradientSteps: 5, // Number of colors in gradient
    colorMixing: true, // Enable color mixing between adjacent cells
    mixingStrength: 0.3, // How much colors mix (0-1)
  },
};

function colorPalette(): ColorScheme {
  const colors = Random.chance()
    ? generateColors()
    : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

  const primary = Random.pick(colors);

  // Find most contrasting color for secondary
  const secondary = colors.sort(
    (a: string, b: string) =>
      wcagContrast(primary, b) - wcagContrast(primary, a)
  )[0];

  // Find a color that contrasts well with both primary and secondary for accent
  const accent = colors.sort((a: string, b: string) => {
    const contrastWithPrimary = wcagContrast(primary, a);
    const contrastWithSecondary = wcagContrast(secondary, a);
    return (
      contrastWithPrimary +
      contrastWithSecondary -
      (wcagContrast(primary, b) + wcagContrast(secondary, b))
    );
  })[1];

  // Generate gradient colors
  const gradient1 = formatHex(rgb(primary))!;
  const gradient2 = formatHex(rgb(secondary))!;

  return {
    primary,
    secondary,
    accent,
    gradient1,
    gradient2,
  };
}

// Generate gradient colors
function generateGradientColors(
  colorScheme: ColorScheme,
  steps: number
): string[] {
  const interpolator = interpolate([
    colorScheme.gradient1,
    colorScheme.gradient2,
  ]);
  return Array.from({ length: steps }, (_, i) =>
    formatHex(interpolator(i / (steps - 1)))
  );
}

// Mix two colors based on ratio
function mixColors(color1: string, color2: string, ratio: number): string {
  const rgb1 = rgb(color1);
  const rgb2 = rgb(color2);

  if (!rgb1 || !rgb2) return color1;

  const mixed = {
    r: rgb1.r * (1 - ratio) + rgb2.r * ratio,
    g: rgb1.g * (1 - ratio) + rgb2.g * ratio,
    b: rgb1.b * (1 - ratio) + rgb2.b * ratio,
    mode: 'rgb',
  };

  return formatHex(mixed);
}

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const rc = rough.canvas(canvas);
  const colorScheme = colorPalette();
  const gradientColors = generateGradientColors(
    colorScheme,
    config.color.gradientSteps
  );

  // Get color for a specific position
  const getColorForPosition = (
    x: number,
    y: number,
    t: number,
    neighborColors: string[] = []
  ) => {
    // Base color selection
    let baseColor;
    if (config.color.useGradients) {
      const gradientIndex = Math.floor(t * (gradientColors.length - 1));
      baseColor = gradientColors[gradientIndex];
    } else {
      baseColor =
        (Math.floor(t * 10) + (x % 2)) % 2 === 0
          ? colorScheme.primary
          : colorScheme.secondary;
    }

    // Chance to use accent color
    if (Random.chance(config.color.accentProbability)) {
      return colorScheme.accent;
    }

    // Color mixing with neighbors
    if (config.color.colorMixing && neighborColors.length > 0) {
      return neighborColors.reduce((mixedColor, neighborColor, i) => {
        const mixRatio = config.color.mixingStrength / neighborColors.length;
        return mixColors(mixedColor, neighborColor, mixRatio);
      }, baseColor);
    }

    return baseColor;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle =
      config.mode === 'hachure' ? colorScheme.primary : '#000';
    context.fillRect(0, 0, width, height);

    const w = width / config.resolution.x;
    const h = height / config.resolution.y;

    // Store colors for color mixing
    const cellColors: string[][] = Array(config.resolution.y)
      .fill(null)
      .map(() => Array(config.resolution.x).fill(''));

    // First pass: calculate base colors
    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        const t = Math.abs(
          loopNoise(
            x / (config.resolution.x * config.scale),
            y / (config.resolution.y * config.scale),
            playhead,
            0.125
          )
        );

        cellColors[y][x] = getColorForPosition(x, y, t);
      }
    }

    // Second pass: draw with color mixing
    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        // Get neighboring colors for mixing
        const neighbors = [];
        if (x > 0) neighbors.push(cellColors[y][x - 1]);
        if (y > 0) neighbors.push(cellColors[y - 1][x]);
        if (x < config.resolution.x - 1) neighbors.push(cellColors[y][x + 1]);
        if (y < config.resolution.y - 1) neighbors.push(cellColors[y + 1][x]);

        const t = Math.abs(
          loopNoise(
            x / (config.resolution.x * config.scale),
            y / (config.resolution.y * config.scale),
            playhead,
            0.25
          )
        );

        const color = getColorForPosition(x, y, t, neighbors);

        if (config.mode === 'mixed') {
          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: color,
            fill: color,
            fillStyle: 'solid',
          });

          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: 'none',
            fill: mixColors(color, colorScheme.accent, 0.3),
            fillStyle: 'hachure',
          });
        } else {
          rc.rectangle(x * w - w * 0.5 + w * 0.5, y * h, w, h, {
            stroke: config.mode === 'solid' ? color : 'none',
            fill: color,
            fillStyle: config.mode,
          });
        }
      }
    }
  };
};

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
