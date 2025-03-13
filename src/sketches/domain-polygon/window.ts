import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
import { drawPath } from '@daeinc/draw';
import { randomPalette } from '../../colors';
import { generateDomainSystem, isIsland } from './domain-polygon-system';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('550276');

// let { colors } = tome.get();
let colors = randomPalette();

colors = Random.shuffle(colors).slice(0, 3);
const outline = '#D9D9D9';
const windowColors = {
  background: '#F1F1F1',
  outline: '#D9D9D9',
  buttons: ['#FC521F', '#FFAE00', '#66BF3C'],
  shadow: 'rgba(0, 0, 0, 0.1)',
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
};

console.log(config, colors);

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains, polygon, polygonParts } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    { clipOffset: [config.window.toolbar + 5, 5, 5, 5] }
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
      context.fillStyle = colors[idx % colors.length]; // Random.pick(colors);
      context.strokeStyle = '#2fbfff';
      context.beginPath();
      drawPath(context, part.area, true);
      context.fill();
      context.stroke();

      context.fillStyle = '#fff';
      context.strokeStyle = '#2fbfff';
      part.area.forEach((point) => {
        context.beginPath();
        context.arc(point[0], point[1], 3, 0, Math.PI * 2);
        // context.rect(point[0] - 2, point[1] - 2, 4, 4);
        context.fill();
        context.stroke();
      });
    });

    // render islands
    polygonParts.forEach((part) => {
      if (part.area.length < 3 || !part.island) return;
      drawIsland(context, part.area);
    });

    domains.forEach((d) => {
      if (!isIsland(d)) {
        // render macos style window with top bar and three circular buttons
        drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
      }
    });

    if (config.debug) {
      context.fillStyle = Random.pick(colors);
      drawPath(context, polygon, true);
      context.fill();

      context.fillStyle = outline;
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
  context.shadowColor = windowColors.shadow;
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

  context.fillStyle = windowColors.background;
  context.beginPath();
  context.roundRect(x, y, width, config.window.toolbar, [
    config.r,
    config.r,
    0,
    0,
  ]);
  context.fill();

  context.strokeStyle = windowColors.outline;
  context.beginPath();
  context.moveTo(x, y + config.window.toolbar);
  context.lineTo(x + width, y + config.window.toolbar);
  context.stroke();

  windowColors.buttons.forEach((color, idx) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(
      x + config.window.buttonSpacing + idx * config.window.buttonSpacing,
      y + 10,
      config.window.button,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  context.strokeStyle = debug ? '#f00' : windowColors.outline;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.stroke();
}

function drawIsland(context: CanvasRenderingContext2D, area: Point[]) {
  const ys = area.map((p) => p[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  const gradient = context.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, '#f0f0f0');
  gradient.addColorStop(1, '#D9D9D9');

  const gradient2 = context.createLinearGradient(0, y0, 0, y1);
  gradient2.addColorStop(0, '#fff');
  gradient2.addColorStop(1, '#D9D9D9');

  context.fillStyle = gradient;

  applyShadow(context, () => {
    drawPath(context, area, true);

    context.strokeStyle = outline;
    context.lineWidth = 3;
    context.stroke();

    context.strokeStyle = gradient2; // '#fff';
    context.lineWidth = 2;
    context.stroke();

    context.fill();
  });
}

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 1_000,
};

ssam(sketch as Sketch<'2d'>, settings);
