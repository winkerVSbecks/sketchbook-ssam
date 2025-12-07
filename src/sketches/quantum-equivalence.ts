import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../colors';

Random.setSeed(Random.getRandomSeed());

const l = Random.range(0.5, 1);
const c = Random.range(0.2, 0.4);
const h = Random.range(0, 360);

const palette = () => {
  const basePalette = ColorPaletteGenerator.generate(
    { l, c, h: Random.range(0, 360) },
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
  debug: false,
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  flip?: boolean;
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
  flip?: boolean,
  collapse?: boolean
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
      color: config.debug ? 'red' : colB,
    },
  ];
  const split = collapse
    ? [
        {
          x: x + w,
          y: y2,
          width: 4 * w,
          height: h2,
          flip,
          color: config.debug ? 'blue' : colD,
        },
      ]
    : [
        {
          x: x + w,
          y: y2,
          width: 2 * w,
          height: h2,
          flip,
          color: config.debug ? 'green' : colC,
        },
        {
          x: x + 3 * w,
          y: y2,
          width: 2 * w,
          height: h2,
          flip,
          color: config.debug ? 'blue' : colD,
        },
      ];

  return {
    left: {
      x: x,
      y: y,
      width: w,
      height: height,
      flip,
      color: config.debug ? 'yellow' : colA,
    },
    top: flip ? split : single,
    bottom: flip ? single : split,
  };
}

function drawLayer(layer: Layer, context: CanvasRenderingContext2D) {
  context.fillStyle = layer.left.color;
  context.fillRect(
    layer.left.x,
    layer.left.y,
    layer.left.width,
    layer.left.height
  );

  layer.top.forEach((top) => {
    context.fillStyle = top.color;
    context.fillRect(top.x, top.y, top.width, top.height);
  });

  layer.bottom.forEach((bottom) => {
    context.fillStyle = bottom.color;
    context.fillRect(bottom.x, bottom.y, bottom.width, bottom.height);
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
      rect.flip,
      true
    );
  });
  layers.push(...level3);

  wrap.render = ({ frame }) => {
    context.fillStyle = config.colors.bg;
    context.fillRect(0, 0, width, height);

    layers.forEach((layer) => {
      drawLayer(layer, context);
    });

    if (frame > 0 && frame % 30 === 0) {
      console.log('update ');

      config.colors.layers = [palette(), palette(), palette()];
      layers = [
        makeLayer([0, 0], width, h * 4, config.colors.layers[0]),
        makeLayer([0, h * 4], width, h, config.colors.layers[0], true),
      ];

      level2 = layers.map((layer) => {
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

      level3 = level2.map((layer) => {
        const rect = layer.bottom.length === 2 ? layer.bottom[0] : layer.top[0];

        return makeLayer(
          [rect.x, rect.y],
          rect.width,
          rect.height,
          config.colors.layers[2],
          rect.flip,
          true
        );
      });
      layers.push(...level3);
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
