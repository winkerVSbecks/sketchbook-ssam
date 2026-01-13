import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerpFrames } from 'canvas-sketch-util/math';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

// Random.setSeed(Random.getRandomSeed());
Random.setSeed('blue');

const l = Random.range(0.5, 1);
const c = Random.range(0.2, 0.4);
let h = Random.range(0, 360);

const palette = () => {
  const basePalette = ColorPaletteGenerator.generate(
    { l, c, h },
    Random.pick(['triadic']),
    {
      style: 'default',
      modifiers: {
        sine: Random.range(-1, 1),
        wave: Random.range(-1, 1),
        zap: Random.range(-1, 1),
        block: Random.range(-1, 1),
      },
    }
  );

  h += 45;

  return extendPalette(basePalette, 4).map((c) =>
    formatCss(oklch({ mode: 'oklch', ...c }))
  );
};
interface PaletteColor {
  l: number;
  c: number;
  h: number;
}

export function extendPalette(
  basePalette: PaletteColor[],
  targetCount: number
): PaletteColor[] {
  const step = basePalette.length / targetCount;
  return Array.from({ length: targetCount }, (_, i) => {
    const index = Math.min(Math.floor(i * step), basePalette.length - 1);
    return basePalette[index];
  });
}

const colorLayers = [palette(), palette(), palette()];

colorLayers.forEach((p) => logColors(p));

// Configuration
const config = {
  res: 5,
  colors: {
    bg: '#fff',
    layers: colorLayers,
  },
  debug: false,
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  flip?: boolean;
  color: string;
  colors: string[];
}

interface Layer {
  left: Rect;
  top: Rect[];
  bottom: Rect[];
}

function makeLayer(
  [x, y]: Point,
  width: number,
  height: number,
  colors: string[],
  flip?: boolean
): Layer {
  const w = width / config.res;
  const h2 = height / 2;

  const y1 = flip ? y + h2 : y;
  const y2 = flip ? y : y + h2;

  const colA = flip ? colors[3] : colors[0];
  const colB = colors[1];
  const colC = colors[2];
  const colD = flip ? colors[0] : colors[3];

  const single = [
    {
      x: x + w,
      y: y1,
      width: w * 4,
      height: h2,
      flip,
      color: colB,
      colors: [colB, colD],
    },
  ];
  const split = [
    {
      x: x + w,
      y: y2,
      width: 2 * w,
      height: h2,
      flip,
      color: colC,
      colors: [colC, colA],
    },
    {
      x: x + 3 * w,
      y: y2,
      width: 2 * w,
      height: h2,
      flip,
      color: colD,
      colors: [colD, colB],
    },
  ];

  return {
    left: {
      x: x,
      y: y,
      width: w,
      height: height,
      flip,
      color: colA,
      colors: [colA, colC],
    },
    top: flip ? split : single,
    bottom: flip ? single : split,
  };
}

function drawRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  [c1, c2]: string[],
  t: number = 0
) {
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();

  const off = lerpFrames([0, rect.height, rect.height * 2], t);
  const dir = rect.flip ? -1 : 1;

  const y0 = rect.y - dir * off;
  const y1 = rect.y + dir * rect.height - dir * off;
  const y2 = rect.y + dir * 2 * rect.height - dir * off;

  context.fillStyle = c1;
  context.fillRect(rect.x, y0, rect.width, rect.height);
  context.fillStyle = c2;
  context.fillRect(rect.x, y1, rect.width, rect.height);
  context.fillStyle = c1;
  context.fillRect(rect.x, y2, rect.width, rect.height);
  context.restore();
}

function drawLayer(layer: Layer, context: CanvasRenderingContext2D, t: number) {
  drawRect(context, layer.left, layer.left.colors, t);

  layer.top.forEach((top) => {
    drawRect(context, top, top.colors, t);
  });

  layer.bottom.forEach((bottom) => {
    drawRect(context, bottom, bottom.colors, t);
  });
}

// Inspired by https://www.hauskonstruktiv.ch/en/collection/quanten-aequivalenz-an-der-horizontalen-ii
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const w = width / config.res;
  const h = height / config.res;

  let layers = [
    makeLayer([0, 0], width, h * 4, config.colors.layers[0]),
    makeLayer([0, h * 4], width, h, config.colors.layers[0], true),
  ];

  let level2 = layers.map((layer) => {
    const rect = layer.bottom.length === 2 ? layer.bottom[0] : layer.top[0];

    return makeLayer(
      [rect.x, rect.y],
      rect.width,
      rect.height,
      config.colors.layers[1],
      rect.flip
    );
  });
  layers.push(...level2);

  let level3 = level2.map((layer) => {
    const rect = layer.bottom.length === 2 ? layer.bottom[0] : layer.top[0];

    return makeLayer(
      [rect.x, rect.y],
      rect.width,
      rect.height,
      config.colors.layers[2],
      rect.flip
    );
  });
  layers.push(...level3);

  wrap.render = ({ playhead }) => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);

    layers.forEach((layer) => {
      drawLayer(layer, context, playhead);
    });
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
