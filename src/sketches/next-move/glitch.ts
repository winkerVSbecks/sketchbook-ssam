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
  mode: Random.pick(['solid', 'hachure', 'mixed']),
  glitch: {
    enabled: true,
    probability: 0.1, // Probability of glitch occurring
    intensity: 0.1, // How strong the glitch effect is
    sliceCount: 3, // Number of glitch slices to create
    offsetRange: 0.1, // How far glitches can move
    sizeVariation: 0.5, // How much glitch size can vary
  },
};

const [colorA, colorB] = colorPalette();
console.log(colorA, colorB);

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const rc = rough.canvas(canvas);

  // Generate glitch data for the frame
  const generateGlitchData = (width: number, height: number) => {
    const glitches = [];
    const sliceHeight = height / config.glitch.sliceCount;

    for (let i = 0; i < config.glitch.sliceCount; i++) {
      if (Random.chance(config.glitch.probability)) {
        glitches.push({
          y: i * sliceHeight,
          height:
            sliceHeight * Random.range(0.5, 1 + config.glitch.sizeVariation),
          offset:
            width *
            Random.range(-config.glitch.offsetRange, config.glitch.offsetRange),
          color: Random.chance(0.5) ? colorA : colorB,
          mode: Random.pick(['solid', 'hachure', 'xor']),
        });
      }
    }
    return glitches;
  };

  // Apply glitch effect to a rectangle
  const applyGlitchEffect = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    glitchIntensity: number
  ) => {
    // Random displacement
    const glitchX = x + Random.range(-w * glitchIntensity, w * glitchIntensity);
    const glitchY = y + Random.range(-h * glitchIntensity, h * glitchIntensity);

    // Random size variation
    const glitchW = w * Random.range(1 - glitchIntensity, 1 + glitchIntensity);
    const glitchH = h * Random.range(1 - glitchIntensity, 1 + glitchIntensity);

    // Chance to change color or style
    const glitchColor = Random.chance(0.3)
      ? color === colorA
        ? colorB
        : colorA
      : color;
    const glitchStyle = Random.pick(['solid', 'hachure']);

    rc.rectangle(glitchX, glitchY, glitchW, glitchH, {
      stroke: config.mode === 'solid' ? glitchColor : 'none',
      fill: glitchColor,
      fillStyle: glitchStyle,
    });
  };

  // Draw glitch slices
  const drawGlitches = (glitches: any[], width: number) => {
    glitches.forEach((glitch) => {
      if (glitch.mode === 'xor') {
        context.globalCompositeOperation = 'xor';
      }

      rc.rectangle(glitch.offset, glitch.y, width, glitch.height, {
        stroke: 'none',
        fill: glitch.color,
        fillStyle: Random.pick(['solid', 'hachure']),
      });

      context.globalCompositeOperation = 'source-over';
    });
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = config.mode === 'hachure' ? colorA : '#000';
    context.fillRect(0, 0, width, height);

    const w = width / config.resolution.x;
    const h = height / config.resolution.y;

    // Generate glitch data for this frame
    const glitches = config.glitch.enabled
      ? generateGlitchData(width, height)
      : [];

    // Draw base pattern
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

        // Regular drawing
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
            fillStyle: config.mode,
          });
        }

        // Random individual glitch effects
        if (config.glitch.enabled && Random.chance(0.01)) {
          applyGlitchEffect(
            x * w - w * 0.5 + w * 0.5,
            y * h,
            w,
            h,
            color,
            config.glitch.intensity
          );
        }
      }
    }

    // Apply glitch slices
    if (config.glitch.enabled) {
      drawGlitches(glitches, width);
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
