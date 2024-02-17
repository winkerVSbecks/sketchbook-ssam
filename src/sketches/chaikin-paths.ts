import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { clamp, lerp, lerpFrames, mapRange } from 'canvas-sketch-util/math';
import smooth from 'chaikin-smooth';
import eases from 'eases';

const generateConfig = () => {
  const ordered = Random.chance(0.5);
  return {
    cycles: 4,
    pathCount: 50,
    ordered,
    uniform: Random.chance(0.5),
    colorPalette: ordered ? false : Random.chance(0.5),
  };
};

let config = generateConfig();

interface Path {
  points: Line;
  color: string;
  length: number;
  thickness: number;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let colors: string[];

  let bg: string;
  const margin = 150;

  let paths: Path[] = [];

  wrap.render = ({
    width,
    height,
    playhead,
    frame,
    totalFrames,
  }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineCap = 'butt';
    context.lineJoin = 'round';

    if (frame % (totalFrames / config.cycles) === 0) {
      config = generateConfig();

      colors = config.colorPalette
        ? generateColors()
        : generateColorsFromRampensau(config.pathCount + 1);
      bg = colors.pop()!;

      paths = Array.from({ length: config.pathCount }).map((_, idx) => {
        const yMin = config.ordered
          ? mapRange((idx + 1) / config.pathCount, 0, 1, 0, height)
          : Random.range(0, height);
        const yMax = clamp(Random.range(0, yMin + 0.4 * height), 0, height);

        const points = generatePath(
          [-margin, width + margin],
          [yMin, yMax],
          10
        );

        return {
          points,
          color: config.ordered ? colors[idx] : Random.pick(colors),
          length: getLength(points),
          thickness: config.uniform ? 40 : Random.pick([40, 60, 80, 120, 180]),
        };
      });
    }

    const cyclePlayhead = (playhead * config.cycles) % 1;

    const t = lerpFrames(
      [0, 1, 0],
      eases.quadInOut(cyclePlayhead),
      []
    ) as unknown as number;

    paths.forEach(({ points, color, length, thickness }) => {
      const [start, ...rest] = points;
      context.lineWidth = thickness;
      context.setLineDash([length]);

      context.beginPath();
      context.moveTo(...start);
      rest.forEach(([x, y]) => {
        context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineDashOffset =
        cyclePlayhead <= 0.5 ? length * (1 - t) : length + length * t;
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000 * config.cycles,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

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
function generateColorsFromRampensau(count: number) {
  const hStart = Random.rangeFloor(0, 360);

  const colors = generateColorRamp({
    total: count,
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
