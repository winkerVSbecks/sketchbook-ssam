import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../colors';

Random.setSeed(Random.getRandomSeed());

const l = Random.range(0, 1),
  c = Random.range(0.2, 0.4),
  h = Random.range(0, 360);

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
};

interface Rect {
  vertices: [number, number][];
  color: string;
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

  const top = [
    {
      vertices: [
        [x + w, y1],
        [x + config.res * w, y1],
        [x + config.res * w, y1 + h2],
        [x + w, y1 + h2],
      ] as Point[],
      color: colB, // 'red'
    },
  ];
  const bottom = [
    {
      vertices: [
        [x + w, y2],
        [x + 3 * w, y2],
        [x + 3 * w, y2 + h2],
        [x + w, y2 + h2],
      ] as Point[],
      color: colC, // 'green'
    },
    {
      vertices: [
        [x + 3 * w, y2],
        [x + config.res * w, y2],
        [x + config.res * w, y2 + h2],
        [x + 3 * w, y2 + h2],
      ] as Point[],
      color: colD, // 'blue'
    },
  ];

  return {
    left: {
      vertices: [
        [x, y],
        [x + w, y],
        [x + w, y + height],
        [x, y + height],
      ],
      color: colA, // 'yellow'
    },
    top: top,
    bottom: bottom,
  };
}

function drawLayer(layer: Layer, context: CanvasRenderingContext2D) {
  drawPath(context, layer.left.vertices);
  context.fillStyle = layer.left.color;
  context.fill();

  layer.top.forEach((top) => {
    drawPath(context, top.vertices);
    context.fillStyle = top.color;
    context.fill();
  });

  layer.bottom.forEach((bottom) => {
    drawPath(context, bottom.vertices);
    context.fillStyle = bottom.color;
    context.fill();
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

  const layers = [
    makeLayer([0, 0], width, h * 4, config.colors.layers[0]),
    makeLayer([0, h * 4], width, h, config.colors.layers[0], true),
  ];

  layers.push(makeLayer([w, h * 2], w * 2, h * 2, config.colors.layers[1]));
  layers.push(makeLayer([w, h * 4], w * 2, h, config.colors.layers[1], true));

  wrap.render = () => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);

    layers.forEach((layer) => {
      drawLayer(layer, context);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
