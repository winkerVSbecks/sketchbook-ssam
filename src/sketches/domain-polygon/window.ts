import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
import { drawPath } from '@daeinc/draw';
import { randomPalette } from '../../colors';
import { generateDomainSystem, isIsland } from './domain-polygon-system';
import { PolygonPart } from './types';
import '../../colors/radix';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('550276');

// let { colors } = tome.get();
let baseColors = randomPalette();

const colors = {
  fills: Random.shuffle(baseColors).slice(0, 3),
  outline: '#D9D9D9',
  window: {
    background: '#F1F1F1',
    outline: '#D9D9D9',
    buttons: ['#FC521F', '#FFAE00', '#66BF3C'],
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  vector: {
    fg: '#2fbfff',
    bg: '#fff',
  },
};

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
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    context.lineJoin = 'round';

    context.fillStyle = '#fff';
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
      drawIsland(context, part.area, colors.fills[idx % colors.fills.length]);
    });

    // render islands
    polygonParts.forEach((part, idx) => {
      if (part.area.length < 3 || !part.island) return;
      drawVectorNetwork(context, part);
      // drawIsland(context, part.area, colors.fills[idx % colors.fills.length]);
    });

    domains.forEach((d) => {
      if (!isIsland(d)) {
        // render macos style window with top bar and three circular buttons
        drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
      }
    });

    if (config.debug) {
      context.fillStyle = Random.pick(colors.fills);
      drawPath(context, polygon, true);
      context.fill();

      context.fillStyle = colors.outline;
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
  context.shadowColor = colors.window.shadow;
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

function drawIsland(
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

    context.strokeStyle = colors.outline;
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
  bg = colors.vector.bg
) {
  context.fillStyle = bg;
  context.strokeStyle = colors.outline;
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
