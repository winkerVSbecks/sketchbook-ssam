import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerp } from 'canvas-sketch-util/math';
import eases from 'eases';
import { generateDomainSystem } from './domain-polygon-system';
import { randomPalette } from '../../colors';
import { uchu, uchuHues, UchuHue } from '../../colors/uchu';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('257104');

const config = {
  gap: 0,
  debug: false,
  cycles: 12,
  gradientMode: Random.pick(['uchu', 'random']),
  res: Random.pick([
    // [32, 32],
    // [24, 24],
    // [16, 16],
    // [12, 12],
    // [8, 8],
    // [6, 6],
    // [4, 4],
    // [2, 2],
    [8, 6],
    [4, 3],
  ]),
};

const colors = Random.shuffle(randomPalette()).slice(0, config.res[0]);
const bg = colors[0];

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const { domains } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [0, 0, 0, 0],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    },
    {
      w: width * 1,
      h: height * 1,
      x: width * 0, //.03125,
      y: height * 0, //.03125,
    }
  );

  const distort = () => {
    const xs = [0];
    for (let i = 1; i < config.res[0]; i++) {
      const next = Math.min(
        xs[i - 1] + Random.range(0.2, 1.8),
        config.res[0] - 1
      );
      xs.push(next);
    }
    xs.push(config.res[0]);

    const ys = [0];
    for (let i = 1; i < config.res[1]; i++) {
      const next = Math.min(
        ys[i - 1] + Random.range(0.2, 1.8),
        config.res[1] - 1
      );
      ys.push(next);
    }
    ys.push(config.res[0]);

    return [xs, ys];
  };

  const baseGrid = [
    Array.from({ length: config.res[0] + 1 }, (_, idx) => idx),
    Array.from({ length: config.res[0] + 1 }, (_, idx) => idx),
  ];
  const grids = Array.from({ length: config.cycles - 1 }, () => distort());
  grids.unshift(baseGrid);
  grids.push(baseGrid);
  console.log(config.res);
  console.log(grids);

  const distortX = (
    currG: number[][],
    nextG: number[][],
    x: number,
    t: number
  ) => {
    const idx = lerp(currG[0][x], nextG[0][x], t);
    return mapRange(idx, 0, config.res[0], 0, width);
  };

  const distortY = (
    currG: number[][],
    nextG: number[][],
    y: number,
    t: number
  ) => {
    const idx = lerp(currG[1][y], nextG[1][y], t);
    return mapRange(idx, 0, config.res[1], 0, height);
  };

  const hue = (x: number) => {
    return uchuHues[Math.floor(mapRange(x, 0, width, 0, uchuHues.length - 1))];
  };

  function gradient(
    idx1: number,
    idx2: number,
    x0: number,
    y0: number,
    x1: number,
    context: CanvasRenderingContext2D
  ): CanvasGradient {
    if (config.gradientMode === 'uchu') {
      const gradient = context.createLinearGradient(x0, y0, x1, y0);
      const h1 = uchuHues[Math.floor(idx1 % uchuHues.length)];
      const h2 = uchuHues[Math.floor(idx2 % uchuHues.length)];
      const c1 = uchu[h1 as UchuHue];
      const c2 = uchu[h2 as UchuHue];
      gradient.addColorStop(0, c1.base);
      gradient.addColorStop(1, c2.base);
      return gradient;
    } else {
      const gradient = context.createLinearGradient(x0, y0, x1, y0);
      const c1 = colors[Math.floor(idx1 % colors.length)];
      const c2 = colors[Math.floor(idx2 % colors.length)];
      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c2);
      return gradient;
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const gridIndex = Math.floor(playhead * config.cycles);

    const currentGrid = grids[gridIndex];
    const nextGrid = grids[gridIndex + 1];

    const t = eases.cubicInOut((playhead * config.cycles) % 1);

    domains.forEach((d) => {
      const x0 = distortX(currentGrid, nextGrid, d.raw.x, t);
      const y0 = distortY(currentGrid, nextGrid, d.raw.y, t);
      const x1 = distortX(currentGrid, nextGrid, d.raw.x + d.raw.width, t);
      const y1 = distortY(currentGrid, nextGrid, d.raw.y + d.raw.height, t);

      context.fillStyle = gradient(
        d.raw.x,
        d.raw.x + d.raw.width,
        x0,
        y0,
        x1,
        context
      );
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y0);
      context.lineTo(x1, y1);
      context.lineTo(x0, y1);
      context.fill();
    });

    if (config.debug) {
      // Un-distorted grid
      context.strokeStyle = 'rgba(255, 0, 0, 0.2)';
      context.lineWidth = 2;

      for (let i = 0; i <= config.res[0]; i++) {
        const xPos = mapRange(i, 0, config.res[0], 0, width);
        context.beginPath();
        context.moveTo(xPos, 0);
        context.lineTo(xPos, height);
        context.stroke();
      }

      for (let i = 0; i <= config.res[1]; i++) {
        const yPos = mapRange(i, 0, config.res[1], 0, height);
        context.beginPath();
        context.moveTo(0, yPos);
        context.lineTo(width, yPos);
        context.stroke();
      }

      // Distorted grid
      context.strokeStyle = 'black';
      context.lineWidth = 2;

      for (let i = 0; i <= config.res[0]; i++) {
        const xPos = distortX(currentGrid, nextGrid, i, t);
        context.beginPath();
        context.moveTo(xPos, 0);
        context.lineTo(xPos, height);
        context.stroke();
      }

      for (let i = 0; i <= config.res[1]; i++) {
        const yPos = distortY(currentGrid, nextGrid, i, t);
        context.beginPath();
        context.moveTo(0, yPos);
        context.lineTo(width, yPos);
        context.stroke();
      }
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [800, 600],
  // dimensions: [540, 540],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: config.cycles * 2000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
