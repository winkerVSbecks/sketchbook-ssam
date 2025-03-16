import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { drawPath } from '@daeinc/draw';
import { generateDomainSystem, isIsland } from './domain-polygon-system';
import { PolygonPart } from './types';
import {
  color,
  keys,
  ColorType,
  black,
  white,
  ColorMode,
} from '../../colors/radix';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('550276');

const config = {
  gap: 0.02,
  debug: false,
  res: Random.pick([
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
  r: 4,
  window: {
    toolbar: 20,
    button: 4,
    buttonSpacing: 15,
  },
  inset: 10,
  colorMode: 'light' as ColorMode,
};

const colors = {
  parts: Random.shuffle(keys)
    .slice(0, 3)
    .map((key: ColorType) => ({
      base: [
        color(key, 3, config.colorMode),
        color(key, 4, config.colorMode),
        color(key, 5, config.colorMode),
      ],
      border: color(key, 6, config.colorMode),
      accent: color(key, 1, config.colorMode),
    })),
  shadow: 'rgba(0, 0, 0, 0.1)',
  bg: config.colorMode === 'light' ? white.whiteA12 : black.blackA12,
  window: {
    background: [
      color('slate', 3, config.colorMode),
      color('slate', 5, config.colorMode),
    ],
    outline: color('slate', 6, config.colorMode),
    buttons: [
      color('tomato', 9, config.colorMode),
      color('amber', 9, config.colorMode),
      color('grass', 9, config.colorMode),
    ],
  },
  vector: {
    fg: color('blue', 8, config.colorMode),
    connector: color('slate', 7, config.colorMode),
  },
};

console.log(config, colors);

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains, polygon, polygonParts } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [
        config.window.toolbar + config.inset,
        config.inset,
        config.inset,
        config.inset,
      ],
    }
  );

  const windows = domains.filter((d) => !isIsland(d));
  const solidParts = polygonParts.filter(
    (part) => part.area.length > 2 && !part.island
  );
  const islands = polygonParts.filter(
    (part) => part.area.length > 2 && part.island
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    context.lineJoin = 'round';

    // Render macos style windows with top bar,
    // three circular buttons and shadow
    windows.forEach((d) => {
      context.fillStyle = colors.bg;
      applyShadow(context, () => {
        context.beginPath();
        context.roundRect(d.x, d.y, d.width, d.height, [
          config.r,
          config.r,
          0,
          0,
        ]);
        context.fill();
        context.restore();
      });
      drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
    });

    // render solid parts with button style aesthetic
    solidParts.forEach((part, idx) => {
      drawPart(context, part.area, colors.parts[idx % colors.parts.length]);
    });

    // render islands with vector network aesthetic
    islands.forEach((part) => {
      drawVectorNetwork(context, part);
    });

    if (config.debug) {
      context.fillStyle = 'red';
      drawPath(context, polygon, true);
      context.fill();

      context.fillStyle = 'red';
      polygon.forEach((point) => {
        context.beginPath();
        context.arc(point[0], point[1], 3, 0, Math.PI * 2);
        context.fill();
      });
    }
  };
};

function applyShadow(context: CanvasRenderingContext2D, callback: () => void) {
  context.save();
  context.shadowColor = colors.shadow;
  context.shadowBlur = 20;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 5;

  callback();
  context.restore();
}

function drawWindow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  debug?: boolean
) {
  context.lineWidth = 1;

  const gradient = context.createLinearGradient(
    x,
    y,
    x,
    y + config.window.toolbar
  );
  gradient.addColorStop(0, colors.window.background[0]);
  gradient.addColorStop(1, colors.window.background[1]);

  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(x, y, width, config.window.toolbar, [
    config.r,
    config.r,
    0,
    0,
  ]);
  context.fill();

  context.strokeStyle = colors.window.outline;
  context.beginPath();
  context.moveTo(x, y + config.window.toolbar);
  context.lineTo(x + width, y + config.window.toolbar);
  context.stroke();

  colors.window.buttons.forEach((color, idx) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(
      x +
        config.window.buttonSpacing * 0.75 +
        idx * config.window.buttonSpacing,
      y + 10,
      config.window.button,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  context.strokeStyle = debug ? '#f00' : colors.window.outline;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.stroke();
}

function drawPart(
  context: CanvasRenderingContext2D,
  area: Point[],
  color: {
    base: [string, string, string];
    border: string;
    accent: string;
  }
) {
  const ys = area.map((p) => p[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  const fillGradient = context.createLinearGradient(0, y0, 0, y1);
  fillGradient.addColorStop(0, color.base[0]);
  fillGradient.addColorStop(0.75, color.base[1]);
  fillGradient.addColorStop(1, color.base[2]);

  const strokeGradient = context.createLinearGradient(0, y0, 0, y1);
  strokeGradient.addColorStop(0, color.accent);
  strokeGradient.addColorStop(1, color.base[1]);

  context.fillStyle = fillGradient;

  applyShadow(context, () => {
    drawPath(context, area, true);

    context.strokeStyle = color.border;
    context.lineWidth = 6;
    context.stroke();

    context.strokeStyle = strokeGradient;
    context.lineWidth = 3;
    context.stroke();

    context.fill();
  });
}

function drawVectorNetwork(
  context: CanvasRenderingContext2D,
  part: PolygonPart,
  fg = colors.vector.fg,
  bg = colors.bg
) {
  context.fillStyle = bg;
  context.strokeStyle = colors.vector.connector;
  context.beginPath();
  drawPath(context, part.area, true);
  context.fill();
  context.stroke();

  // render vertices
  context.fillStyle = bg;
  context.strokeStyle = fg;
  part.area.forEach((point) => {
    context.beginPath();
    context.arc(point[0], point[1], 3, 0, Math.PI * 2);
    // context.rect(point[0] - 2, point[1] - 2, 4, 4);
    context.fill();
    context.stroke();
  });
}

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 1_000,
};

ssam(sketch as Sketch<'2d'>, settings);
