import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed('red-and-black');
// console.log(Random.getRandomSeed());

const hue = Random.range(0, 360);
const fg = `oklch(0.7 0.5 ${hue})`; // 'color(display-p3 0.9996 0.3617 0.1155)'
const bg = `oklch(0.15 0.1 ${hue})`; //  'color(display-p3 0.005 0.0032 0.0027)'

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const m = height * 0.05;

  function generateSteps(): { x: number[]; y: number[] } {
    const steps: { x: number[]; y: number[] } = { x: [], y: [] };
    steps.y.push(Random.range(m, 4 * m));
    steps.y.push(Random.range(steps.y[0] + m, height * 0.75));
    steps.y.push(Random.range(steps.y[1] + m, height - m));
    steps.y.push(Random.range(steps.y[2] + 2 * m, height - m));

    steps.x.push(Random.range(m, 4 * m));
    steps.x.push(Random.range(width - 4 * m, width - m));
    return steps;
  }

  const start = generateSteps();
  const targets = [
    start,
    generateSteps(),
    generateSteps(),
    generateSteps(),
    generateSteps(),
    start,
  ];
  const steps = { x: [...start.x], y: [...start.y] };

  wrap.render = ({
    width,
    height,
    playhead,
    deltaTime,
    frame,
  }: SketchProps) => {
    if (frame === 0) {
      steps.x = [...start.x];
      steps.y = [...start.y];
    }

    // Orange background
    context.fillStyle = fg;
    // context.fillStyle = '#d84d3c';
    context.fillRect(0, 0, width, height);

    // Choose one of the N targets based on loop time
    const targetIndex = Math.floor(playhead * targets.length);
    const target = targets[targetIndex];

    const rate = (4 * deltaTime) / 1000;

    // Interpolate toward the target point at this rate
    steps.y[0] = lerp(steps.y[0], target.y[0], rate);
    steps.y[1] = lerp(steps.y[1], target.y[1], rate);
    steps.y[2] = lerp(steps.y[2], target.y[2], rate);
    steps.y[3] = lerp(steps.y[3], target.y[3], rate);

    steps.x[0] = lerp(steps.x[0], target.x[0], rate);
    steps.x[1] = lerp(steps.x[1], target.x[1], rate);

    const [a, b, c, d] = steps.y;
    const [x1, x2] = steps.x;
    // Black shape
    context.fillStyle = bg; // '#1a1a1a';
    context.beginPath();
    context.moveTo(width, a);
    context.lineTo(x1, a);
    context.lineTo(x1, b);
    context.lineTo(x2, c);
    context.lineTo(x2, d);
    context.lineTo(0, d);
    context.lineTo(0, height);
    context.lineTo(width, height);
    context.fill();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800],
  // dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
