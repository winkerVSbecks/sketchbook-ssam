import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import math from 'canvas-sketch-util/math';
import { generateDomainSystem } from './domain-polygon-system';
import { randomPalette } from '../../colors';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);
Random.setSeed('475132');
// Random.setSeed('792545');

const colors = Random.shuffle(randomPalette());
const bg = colors.pop();

const config = {
  gap: 0.02,
  debug: false,
  res: Random.pick([
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
  ]),
};

interface RectCell {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

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
    { w: width, h: height, x: 0, y: 0 }
  );

  const s = config.gap * width;

  // Render the system once to capture colors
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  context.lineWidth = 2;
  domains.forEach((d, idx) => {
    context.fillStyle = colors[Math.floor(idx % colors.length)];
    context.beginPath();
    context.rect(d.x, d.y, d.width, d.height);
    context.fill();
    // context.stroke();
  });

  // Get the image data from the rendered canvas (accounting for pixel ratio)
  const pixelRatio = window.devicePixelRatio;
  const canvasWidth = Math.floor(width * pixelRatio);
  const canvasHeight = Math.floor(height * pixelRatio);
  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const pixels = imageData.data;

  // Split the screen into rectangles of size s x s
  const cols = Math.ceil(width / s);
  const rows = Math.ceil(height / s);
  const rectCells: RectCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * s;
      const y = row * s;
      const rectWidth = Math.min(s, width - x);
      const rectHeight = Math.min(s, height - y);

      // Get the color at the center of the rectangle (scale by pixel ratio for actual canvas coords)
      const centerX = Math.floor((x + rectWidth / 2) * pixelRatio);
      const centerY = Math.floor((y + rectHeight / 2) * pixelRatio);
      const pixelIndex = (centerY * canvasWidth + centerX) * 4;

      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      const color = `rgb(${r}, ${g}, ${b})`;

      rectCells.push({
        x,
        y,
        width: rectWidth,
        height: rectHeight,
        color,
      });
    }
  }

  const nextCells = Random.shuffle(rectCells);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    rectCells.forEach((cell, idx) => {
      const x = math.lerpFrames(
        [cell.x, cell.x, nextCells[idx].x, nextCells[idx].x, cell.x],
        playhead
      );
      const y = math.lerpFrames(
        [cell.y, cell.y, nextCells[idx].y, nextCells[idx].y, cell.y],
        playhead
      );

      context.fillStyle = cell.color;
      context.beginPath();
      context.rect(x, y, cell.width, cell.height);
      context.fill();
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 5000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
