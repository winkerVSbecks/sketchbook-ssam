import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';
import { drawLine } from '@daeinc/draw';
import { generateFractalGrid, createCells } from './system';
import { applyNoise } from '../../noise-texture';

const config = {
  debug: false,
  origin: [Random.range(0.2, 0.8), Random.range(0.3, 0.7)],
  targets: Random.rangeFloor(3, 6),
};

const randomLCH = (l: number, c: [number, number]) =>
  `lch(${l}% ${Random.range(...c)}% ${Random.range(0, 360)}deg)`;

function colorPalette() {
  const bgL = Random.range(90, 100);
  const bg = randomLCH(bgL, [0, 5]);

  const strokeL = Math.max(0, Random.range(bgL - 10, bgL - 5));
  const stroke = randomLCH(strokeL, [0, 10]);

  const fillL = Math.max(0, 20);
  const fill = randomLCH(fillL, [0, 20]);

  return { bg, stroke, fill };
}

const { bg, stroke, fill } = colorPalette();

export const sketch = ({
  wrap,
  context,
  width,
  height,
  pixelRatio,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const margin = [0.02 * height, 0.02 * height];
  const initOrigin: Point = [
    Math.round(width * config.origin[0]),
    Math.round(height * config.origin[1]),
  ];

  let origin = [...initOrigin];

  const targets = Array.from({ length: config.targets - 1 })
    .map(() => [
      Random.range(0.2, 0.8) * width,
      Random.range(0.2, 0.8) * height,
    ])
    .concat([initOrigin]);

  wrap.render = ({ playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      origin = [...initOrigin];
    }

    // Choose one of the N targets based on loop time
    const targetIndex = Math.floor(playhead * targets.length);
    const target = targets[targetIndex];

    const t = (playhead * targets.length) % 1;

    origin[0] = Math.round(lerp(origin[0], target[0], t));
    origin[1] = Math.round(lerp(origin[1], target[1], t));

    const xLines = generateFractalGrid(
      [margin[0], width - margin[0]],
      origin[0],
      Math.round(width / 100)
    );
    const yLines = generateFractalGrid(
      [margin[1], height - margin[1]],
      origin[1],
      Math.round(height / 100)
    );

    const cells = createCells(xLines, yLines, origin);

    if (config.debug) {
      context.strokeStyle = '#f0f';
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

    const outputData = applyNoise(
      context,
      width * pixelRatio,
      height * pixelRatio,
      10,
      'white'
    );
    context.putImageData(outputData, 0, 0);

    const outputData2 = applyNoise(
      context,
      width * pixelRatio,
      height * pixelRatio,
      1,
      'salt-pepper'
    );
    context.putImageData(outputData2, 0, 0);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000 * config.targets,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
