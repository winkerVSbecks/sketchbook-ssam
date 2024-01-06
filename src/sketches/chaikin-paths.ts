import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { clamp, lerp, lerpFrames } from 'canvas-sketch-util/math';
import smooth from 'chaikin-smooth';
import eases from 'eases';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let hStart = Random.rangeFloor(0, 360);
  const colors = false //Random.chance(0.5)
    ? generateColors()
    : generateColors2(hStart);

  const bg = colors.pop()!;
  const margin = 20;

  const paths = Array.from({ length: 50 }).map(() => {
    const yMin = Random.range(0, height);
    const yMax = clamp(Random.range(0, yMin + 0.4 * height), 0, height);

    const points = generatePath([-margin, width + margin], [yMin, yMax], 50);
    return {
      points,
      color: Random.pick(colors),
      length: getLength(points),
      thickness: 40, //Random.pick([20, 40, 60]),
    };
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineCap = 'butt';
    context.lineJoin = 'round';

    const t = eases.quadInOut(playhead);

    paths.forEach(({ points, color, length, thickness }) => {
      const [start, ...rest] = points;
      context.lineWidth = thickness;
      context.setLineDash([length, length]);

      context.beginPath();
      context.moveTo(...start);
      rest.forEach(([x, y]) => {
        context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineDashOffset = (1 - t) * length * 2;
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

function getLength(points: Line) {
  const [start, ...rest] = points;
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = `M${start[0]},${start[1]}L${rest.map(([x, y]) => `${x},${y}`)}`;
  path.setAttribute('d', d);
  return path.getTotalLength();
}

function generatePath(
  [x1, x2]: [number, number],
  [yMin, yMax]: [number, number],
  steps: number,
  iterations = 6
): Line {
  const y1 = Random.range(yMin, yMax);
  const y2 = Random.range(yMin, yMax);

  const delta = (yMax - yMin) / 4;

  // Equally spaced points
  const path: Line = Array.from({ length: steps }, (_, idx) => {
    return [lerp(x1, x2, (idx + 1) / steps), lerp(y1, y2, (idx + 1) / steps)];
  })
    // Add variation to points
    .map(([x, y]) => [x, y + Random.range(-delta, delta)]);

  // Smooth path
  let output = path;
  for (let index = 0; index < iterations; index++) {
    output = smooth(output);
  }

  return output;
}

// Colors
function generateColors2(hStart: number) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: 24,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [0.2, 0.8], // [s, s],
    lRange: [0.2, 0.8], // [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'hsl'));

  return colors;
}
