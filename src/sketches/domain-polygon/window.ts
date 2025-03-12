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
// Random.setSeed('772042');

let { colors } = tome.get();
// let colors = randomPalette()

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
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains, polygon, polygonParts } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    domains.forEach((d) => {
      if (!isIsland(d)) {
        context.save();
        context.shadowColor = windowColors.shadow;
        context.shadowBlur = 20;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 10;

        context.fillStyle = '#fff';
        context.fillRect(d.x, d.y, d.width, d.height);
        context.beginPath();
        context.roundRect(d.x, d.y, d.width, d.height, [
          config.r,
          config.r,
          0,
          0,
        ]);
        context.fill();
        context.restore();
      }
    });

    context.strokeStyle = outline;
    context.lineWidth = 2;
    polygonParts.forEach((part) => {
      if (part.area.length < 3) return;
      context.fillStyle = Random.pick(colors);
      drawPath(context, part.area, true);

      if (part.island) {
        context.stroke();
      } else {
        context.fill();
      }
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

function drawWindow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  debug?: boolean
) {
  context.lineWidth = 2;

  context.fillStyle = windowColors.background;
  context.beginPath();
  context.roundRect(x, y, width, 20, [config.r, config.r, 0, 0]);
  context.fill();

  context.strokeStyle = windowColors.outline;
  context.beginPath();
  context.moveTo(x, y + 20);
  context.lineTo(x + width, y + 20);
  context.stroke();

  windowColors.buttons.forEach((color, idx) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x + 15 + idx * 15, y + 10, 4, 0, Math.PI * 2);
    context.fill();
  });

  context.strokeStyle = debug ? '#f00' : windowColors.outline;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.stroke();
}

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
