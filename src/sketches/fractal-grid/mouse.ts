import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawLine } from '@daeinc/draw';
import { wcagContrast, converter } from 'culori';
import { randomPalette } from '../../colors';
import { generateFractalGrid, createCells } from './system';

const config = {
  debug: false,
  origin: [Random.range(0.2, 0.8), Random.range(0.3, 0.7)],
};

const colors = randomPalette();

const toLch = converter('lch');

const colorsWithLightness = colors.map((color) => ({
  original: color,
  lch: toLch(color),
  lightness: toLch(color)!.l || 0, // L component represents lightness (0-100)
}));

// Find brightest (highest lightness)
const brightest = colorsWithLightness.reduce((prev, current) =>
  current.lightness > prev.lightness ? current : prev
).original;

// Find darkest (lowest lightness)
const darkest = colorsWithLightness.reduce((prev, current) =>
  current.lightness < prev.lightness ? current : prev
).original;

const bg = brightest;
const fill = darkest;
const stroke = colors
  .filter((c) => c !== bg)
  .map((c) => ({ c, contrast: wcagContrast(c, bg) }))
  .sort((a, b) => a.contrast - b.contrast)[0].c;

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const margin = [0.01 * height, 0.01 * height];
  const origin: Point = [
    Math.round(width * config.origin[0]), //640,
    Math.round(height * config.origin[1]), //1080,
  ];

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const xLines = generateFractalGrid(
      [margin[0], width - margin[0]],
      origin[0],
      20 // Math.round(width / 100), //11,
    );
    const yLines = generateFractalGrid(
      [margin[1], height - margin[1]],
      origin[1],
      10 //Math.round(height / 100), //18,
    );

    const cells = createCells(xLines, yLines, origin);

    context.strokeStyle = stroke;
    if (config.debug) {
      drawLine(context, [margin[0], 0], [margin[0], height]);
      context.stroke();
      drawLine(context, [width - margin[0], 0], [width - margin[0], height]);
      context.stroke();
      drawLine(context, [0, margin[1]], [width, margin[1]]);
      context.stroke();
      drawLine(context, [0, height - margin[1]], [width, height - margin[1]]);
      context.stroke();
    }

    cells.forEach((cell) => {
      const { from, to } = cell;

      context.fillStyle = fill;
      context.beginPath();
      context.moveTo(to[0], from[1]);
      context.lineTo(to[0], to[1]);
      context.lineTo(from[0], to[1]);
      context.closePath();
      context.fill();
    });

    context.strokeStyle = stroke;
    // remove the xLine closest to origin[0]
    const closestXLine = xLines.reduce((prev, curr) =>
      Math.abs(curr - origin[0]) < Math.abs(prev - origin[0]) ? curr : prev
    );

    xLines.splice(xLines.indexOf(closestXLine) + 1, 1);

    const closestYLine = yLines.reduce((prev, curr) =>
      Math.abs(curr - origin[1]) < Math.abs(prev - origin[1]) ? curr : prev
    );
    yLines.splice(yLines.indexOf(closestYLine) + 1, 1);

    xLines.forEach((x) => {
      drawLine(context, [x, 0], [x, height]);
      context.stroke();
    });

    yLines.forEach((y) => {
      drawLine(context, [0, y], [width, y]);
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1920],
  dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
