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
// let colors = Random.shuffle(randomPalette()).slice(0, 3);

colors = Random.shuffle(randomPalette()).slice(0, 3);
const outline = '#333';

const config = {
  gap: 0.02,
  debug: false,
  invert: Random.chance(),
  res: Random.pick([
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
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
        context.fillStyle = config.invert ? Random.pick(colors) : '#fff';
        context.fillRect(d.x, d.y, d.width, d.height);
      }
    });

    context.strokeStyle = outline;
    context.lineWidth = 2;
    polygonParts.forEach((part) => {
      if (part.area.length < 3) return;
      context.fillStyle = config.invert ? '#fff' : Random.pick(colors);
      drawPath(context, part.area, true);

      if (part.island) {
        context.stroke();
      } else {
        context.fill();
      }
    });

    context.strokeStyle = outline;
    context.lineWidth = 2;
    domains.forEach((d) => {
      if (!isIsland(d)) {
        context.strokeStyle = d.debug ? '#f00' : outline;
        context.strokeRect(d.x, d.y, d.width, d.height);
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

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
