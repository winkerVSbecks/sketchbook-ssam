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
  mode: 'solid', // Random.pick(['solid', 'hachure', 'mixed']),
  layers: {
    count: 3, // Number of layers
    baseAlpha: 0.8, // Base transparency
    offset: 0.1, // Offset for each layer
  },
  color: {
    useGradients: false, // Random.chance(0.5),
    accentProbability: 0.1,
    gradientSteps: 5,
    colorMixing: true,
    mixingStrength: 0.3,
  },
  frequencies: {
    movement: 0.25, // Frequency for position/movement
    color: 0.0625, // Frequency for color changes
  },
};

function colorPalette(): ColorScheme {
  const colors = Random.chance()
    ? generateColors()
    : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

  const primary = Random.pick(colors);
  const secondary = colors.sort(
    (a: string, b: string) =>
      wcagContrast(primary, b) - wcagContrast(primary, a)
  )[0];
  const accent = colors.sort((a: string, b: string) => {
    const contrastWithPrimary = wcagContrast(primary, a);
    const contrastWithSecondary = wcagContrast(secondary, a);
    return (
      contrastWithPrimary +
      contrastWithSecondary -
      (wcagContrast(primary, b) + wcagContrast(secondary, b))
    );
  })[1];

  const gradient1 = formatHex(rgb(primary));
  const gradient2 = formatHex(rgb(secondary));

  return { primary, secondary, accent, gradient1, gradient2 };
}

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

  const getColorForPosition = (
    x: number,
    y: number,
    t: number,
    layerIndex: number,
    neighborColors: string[] = []
  ) => {
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

    // Layer-specific color adjustments
    baseColor = mixColors(baseColor, colorScheme.accent, layerIndex * 0.2);

    if (Random.chance(config.color.accentProbability)) {
      return colorScheme.accent;
    }

    if (config.color.colorMixing && neighborColors.length > 0) {
      return neighborColors.reduce((mixedColor, neighborColor, i) => {
        const mixRatio = config.color.mixingStrength / neighborColors.length;
        return mixColors(mixedColor, neighborColor, mixRatio);
      }, baseColor);
    }

    return baseColor;
  };

  const drawLayer = (
    layerIndex: number,
    alpha: number,
    width: number,
    height: number,
    playhead: number
  ) => {
    const w = width / config.resolution.x;
    const h = height / config.resolution.y;
    const offset = (layerIndex * config.layers.offset) / config.layers.count;

    context.globalAlpha = alpha;

    // Store colors for color mixing
    const cellColors: string[][] = Array(config.resolution.y)
      .fill(null)
      .map(() => Array(config.resolution.x).fill(''));

    // First pass: calculate base colors
    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        const colorNoise = Math.abs(
          loopNoise(
            (x + offset) / (config.resolution.x * config.scale),
            (y + offset) / (config.resolution.y * config.scale),
            playhead,
            config.frequencies.color
          )
        );

        cellColors[y][x] = getColorForPosition(x, y, colorNoise, layerIndex);
      }
    }

    // Second pass: draw with color mixing
    for (let y = 0; y < config.resolution.y; y++) {
      for (let x = 0; x < config.resolution.x; x++) {
        const neighbors = [];
        if (x > 0) neighbors.push(cellColors[y][x - 1]);
        if (y > 0) neighbors.push(cellColors[y - 1][x]);
        if (x < config.resolution.x - 1) neighbors.push(cellColors[y][x + 1]);
        if (y < config.resolution.y - 1) neighbors.push(cellColors[y + 1][x]);

        const positionNoise = Math.abs(
          loopNoise(
            (x + offset) / (config.resolution.x * config.scale),
            (y + offset) / (config.resolution.y * config.scale),
            playhead,
            config.frequencies.movement
          )
        );

        const xOffset = offset * Random.range(-w, w);
        const yOffset = offset * Random.range(-h, h);
        const color = getColorForPosition(
          x,
          y,
          positionNoise,
          layerIndex,
          neighbors
        );

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
              fill: mixColors(color, colorScheme.accent, 0.3),
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
    context.fillStyle =
      config.mode === 'hachure' ? colorScheme.primary : '#000';
    context.fillRect(0, 0, width, height);

    // Draw multiple layers with decreasing opacity
    for (let i = 0; i < config.layers.count; i++) {
      const layerAlpha = config.layers.baseAlpha / (i + 1);
      drawLayer(i, layerAlpha, width, height, playhead);
    }

    // Reset global alpha
    context.globalAlpha = 1;
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
