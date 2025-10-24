import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';

// Random.setSeed(Random.getRandomSeed());
Random.setSeed('red-and-black');
// console.log(Random.getRandomSeed());

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const m = height * 0.05;

  function generateSteps() {
    const steps = [m];
    steps.push(Random.range(steps[0] + m, height * 0.75));
    steps.push(Random.range(steps[1] + m, height - m));
    steps.push(height - m);
    return steps;
  }

  const start = generateSteps();
  const targets = [
    [...start],
    generateSteps(),
    generateSteps(),
    generateSteps(),
    generateSteps(),
    [...start],
  ];
  const steps = [...start];

  wrap.render = ({
    width,
    height,
    playhead,
    deltaTime,
    frame,
  }: SketchProps) => {
    if (frame === 0) {
      steps[0] = start[0];
      steps[1] = start[1];
      steps[2] = start[2];
      steps[3] = start[3];
    }

    // Orange background
    context.fillStyle = '#d84d3c';
    context.fillRect(0, 0, width, height);

    // Choose one of the N targets based on loop time
    const targetIndex = Math.floor(playhead * targets.length);
    const target = targets[targetIndex];

    const rate = (4 * deltaTime) / 1000;

    // Interpolate toward the target point at this rate
    steps[0] = lerp(steps[0], target[0], rate);
    steps[1] = lerp(steps[1], target[1], rate);
    steps[2] = lerp(steps[2], target[2], rate);
    steps[3] = lerp(steps[3], target[3], rate);

    const [a, b, c, d] = steps;
    // Black shape
    context.fillStyle = '#1a1a1a';

    // Top angular shape
    context.beginPath();
    context.moveTo(width, a);
    context.lineTo(m, a);
    context.lineTo(m, b);
    context.lineTo(width - m, c);
    context.lineTo(width - m, d);
    context.lineTo(0, d);
    context.lineTo(0, height);
    context.lineTo(width, height);
    context.fill();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600 * 2, 800 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
