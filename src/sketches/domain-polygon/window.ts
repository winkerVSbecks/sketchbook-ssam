import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { drawPath } from '@daeinc/draw';
import { generateDomainSystem, isIsland } from './domain-polygon-system';
import { PolygonPart } from './types';
import { color, keys, ColorType } from '../../colors/radix';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('550276');

const colors = {
  fills: Random.shuffle(keys)
    .slice(0, 3)
    .map((key: ColorType) => color(key, 9)),
  shadow: 'rgba(0, 0, 0, 0.1)',
  bg: '#fff',
  window: {
    background: color('slate', 3),
    outline: color('slate', 6),
    buttons: [color('tomato', 9), color('amber', 9), color('grass', 9)],
  },
  vector: {
    fg: color('blue', 8),
    connector: color('slate', 7),
  },
};
console.log(color('blue', 12));

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
  inset: 6,
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

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    context.lineJoin = 'round';

    context.fillStyle = colors.bg;
    domains.forEach((d) => {
      if (!isIsland(d)) {
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
      }
    });

    polygonParts.forEach((part, idx) => {
      if (part.area.length < 3 || part.island) return;
      drawPart(context, part.area, colors.fills[idx % colors.fills.length]);
    });

    // render islands
    polygonParts.forEach((part) => {
      if (part.area.length < 3 || !part.island) return;
      drawVectorNetwork(context, part);
    });

    domains.forEach((d) => {
      if (!isIsland(d)) {
        // render macos style window with top bar and three circular buttons
        drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
      }
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

  context.fillStyle = colors.window.background;
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
  color = colors.window.background
) {
  const ys = area.map((p) => p[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  const gradient = context.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, `oklch(from ${color} calc(l * 1.25) c h)`);
  gradient.addColorStop(1, `oklch(from ${color} calc(l * .9) c h)`);

  const gradient2 = context.createLinearGradient(0, y0, 0, y1);
  gradient2.addColorStop(0, `oklch(from ${color} calc(l * 1.25) c h)`);
  gradient2.addColorStop(1, `oklch(from ${color} calc(l * .9) c h)`);

  context.fillStyle = gradient;

  applyShadow(context, () => {
    drawPath(context, area, true);

    context.strokeStyle = 'red';
    context.lineWidth = 3;
    context.stroke();

    context.strokeStyle = gradient2;
    context.lineWidth = 2;
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
