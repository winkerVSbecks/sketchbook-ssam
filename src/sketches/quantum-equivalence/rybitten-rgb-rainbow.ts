import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { rybHsl2rgb } from 'rybitten';
import { ColorCoords, ColorCube } from 'rybitten/cubes';

Random.setSeed(Random.getRandomSeed());

const u = [255, 225, 200, 175, 150, 125];
const v = [10, 20, 30, 40, 50, 60];
const w = [0, 10, 20, 30, 40, 50];

const makeCube = (type: 'red' | 'green' | 'blue'): ColorCube => {
  const r = type === 'red' ? u : Random.pick([v, w]);
  const g = type === 'green' ? u : Random.pick([v, w]);
  const b = type === 'blue' ? u : Random.pick([v, w]);

  return [
    // White
    [0 / 255, 255 / 255, 237 / 255],
    // Red
    [r[0] / 255, g[0] / 255, b[0] / 255],
    // Yellow
    [r[1] / 255, g[1] / 255, b[1] / 255],
    // Orange
    [r[2] / 255, g[2] / 255, b[2] / 255],
    // Blue
    [r[3] / 255, g[3] / 255, b[3] / 255],
    // Violet
    [r[4] / 255, g[4] / 255, b[4] / 255],
    // Green
    [r[5] / 255, g[5] / 255, b[5] / 255],
    // Black
    [29 / 255, 28 / 255, 28 / 255],
  ];
};

const formatCSS = (rgb: ColorCoords): string => {
  return `rgb(${Math.round(rgb[0] * 255)} ${Math.round(
    rgb[1] * 255
  )} ${Math.round(rgb[2] * 255)})`;
};

const getColorHSLFn =
  (baseH: number, s = 1, l = 0.5, type: 'red' | 'green' | 'blue') =>
  (t: number) => {
    const h = baseH + 360 * t;
    return formatCSS(rybHsl2rgb([h, s, l], { cube: makeCube(type) }));
  };

let h = Random.range(0, 360);
const s = Random.range(0.25, 0.75);
const l = Random.range(0.5, 0.75);

const palette = (type: 'red' | 'green' | 'blue') => {
  const colors = [
    getColorHSLFn(h, s, l, type),
    getColorHSLFn(h + 90, s, l, type),
    getColorHSLFn(h + 180, s, l, type),
    getColorHSLFn(h + 270, s, l, type),
  ];

  h = h + 60;

  return colors;
};

const white = formatCSS(rybHsl2rgb([1, 1, 1], { cube: makeCube('red') }));

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

const colorLayers = [palette('red'), palette('green'), palette('blue')];

// Configuration
const config = {
  res: 5,
  colors: {
    bg: '#fff',
    layers: colorLayers,
  },
  outline: false,
  debug: false,
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  flip?: boolean;
  color: (t: number) => string;
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
  colors: ((t: number) => string)[],
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
      color: config.debug ? () => 'red' : colB,
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
          color: config.debug ? () => 'blue' : colD,
        },
      ]
    : [
        {
          x: x + w,
          y: y2,
          width: 2 * w,
          height: h2,
          flip,
          color: config.debug ? () => 'green' : colC,
        },
        {
          x: x + 3 * w,
          y: y2,
          width: 2 * w,
          height: h2,
          flip,
          color: config.debug ? () => 'blue' : colD,
        },
      ];

  return {
    left: {
      x: x,
      y: y,
      width: w,
      height: height,
      flip,
      color: config.debug ? () => 'yellow' : colA,
    },
    top: flip ? split : single,
    bottom: flip ? single : split,
  };
}

function drawLayer(
  layer: Layer,
  context: CanvasRenderingContext2D,
  playhead: number
) {
  context.strokeStyle = white;
  context.lineWidth = 2;

  context.fillStyle = layer.left.color(playhead);
  context.beginPath();
  context.rect(layer.left.x, layer.left.y, layer.left.width, layer.left.height);
  context.fill();
  if (config.outline) {
    context.stroke();
  }

  layer.top.forEach((top) => {
    context.fillStyle = top.color(playhead);
    context.beginPath();
    context.rect(top.x, top.y, top.width, top.height);
    context.fill();
    if (config.outline) {
      context.stroke();
    }
  });

  layer.bottom.forEach((bottom) => {
    context.fillStyle = bottom.color(playhead);
    context.beginPath();
    context.rect(bottom.x, bottom.y, bottom.width, bottom.height);
    context.fill();
    if (config.outline) {
      context.stroke();
    }
  });
}

// Inspired by https://www.hauskonstruktiv.ch/en/collection/quanten-aequivalenz-an-der-horizontalen-ii
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

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
  animate: false,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
