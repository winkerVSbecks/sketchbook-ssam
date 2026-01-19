import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerp } from 'canvas-sketch-util/math';
import eases from 'eases';
import { generateDomainSystem } from './domain-polygon-system';
import { randomPalette } from '../../colors';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
// Random.setSeed('257104');

const colors = Random.shuffle(randomPalette()).slice(0, 3);
const bg = colors[0]; //colors.pop();

const config = {
  gap: 0,
  debug: false,
  cycles: 12,
  gradientMode: Random.pick(['uchu', 'random']),
  res: [16, 16] as [number, number],
};

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
    },
  );

  const distort = () => {
    const xs = [0];
    for (let i = 1; i < config.res[0]; i++) {
      const next = Math.min(
        xs[i - 1] + Random.range(0.2, 1.8),
        config.res[0] - 1,
      );
      xs.push(next);
    }
    xs.push(config.res[0]);

    const ys = [0];
    for (let i = 1; i < config.res[1]; i++) {
      const next = Math.min(
        ys[i - 1] + Random.range(0.2, 1.8),
        config.res[1] - 1,
      );
      ys.push(next);
    }
    ys.push(config.res[1]);

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
    t: number,
  ) => {
    const idx = lerp(currG[0][x], nextG[0][x], t);
    return mapRange(idx, 0, config.res[0], 1, width - 1);
  };

  const distortY = (
    currG: number[][],
    nextG: number[][],
    y: number,
    t: number,
  ) => {
    const idx = lerp(currG[1][y], nextG[1][y], t);
    return mapRange(idx, 0, config.res[1], 1, height - 1);
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#00';
    context.lineWidth = 4;
    context.strokeRect(2, 2, width - 4, height - 4);

    const gridIndex = Math.floor(playhead * config.cycles);

    const currentGrid = grids[gridIndex];
    const nextGrid = grids[gridIndex + 1];

    const t = eases.cubicInOut((playhead * config.cycles) % 1);

    // // Un-distorted grid
    // context.strokeStyle = 'rgba(255, 0, 0, 0.1)';
    // context.lineWidth = 2;

    // for (let i = 0; i <= config.res[0]; i++) {
    //   const xPos = mapRange(i, 0, config.res[0], 0, width);
    //   context.beginPath();
    //   context.moveTo(xPos, 0);
    //   context.lineTo(xPos, height);
    //   context.stroke();
    // }

    // for (let i = 0; i <= config.res[1]; i++) {
    //   const yPos = mapRange(i, 0, config.res[1], 0, height);
    //   context.beginPath();
    //   context.moveTo(0, yPos);
    //   context.lineTo(width, yPos);
    //   context.stroke();
    // }

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

    // Draw grid cells, fill every other cell black
    for (let i = 0; i < config.res[0]; i++) {
      for (let j = 0; j < config.res[1]; j++) {
        if ((i + j) % 2 === 0) {
          const x0 = distortX(currentGrid, nextGrid, i, t);
          const y0 = distortY(currentGrid, nextGrid, j, t);
          const x1 = distortX(currentGrid, nextGrid, i + 1, t);
          const y1 = distortY(currentGrid, nextGrid, j + 1, t);

          context.fillStyle = 'black';
          context.beginPath();
          context.rect(x0, y0, x1 - x0, y1 - y0);
          context.fill();
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  // dimensions: [540, 540],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: config.cycles * 2000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
