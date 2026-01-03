import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';

// Random.setSeed(Random.getRandomSeed());
Random.setSeed('red-and-black');
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
  const velocities = {
    x: [0, 0],
    y: [0, 0, 0, 0],
  };

  // Spring parameters
  const stiffness = 0.15;
  const damping = 0.25;
  const anticipationStrength = 0.9; // Negative to pull back before moving forward

  let lastTargetIndex = 0;
  let transitionProgress = 1; // 0 = just changed, 1 = settled

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
      velocities.x.fill(0);
      velocities.y.fill(0);
      lastTargetIndex = 0;
      transitionProgress = 1;
    }

    // Orange background
    context.fillStyle = fg;
    // context.fillStyle = '#d84d3c';
    context.fillRect(0, 0, width, height);

    // Choose one of the N targets based on loop time
    const targetIndex = Math.floor(playhead * targets.length);
    const target = targets[targetIndex];

    // Detect target change and reset transition
    if (targetIndex !== lastTargetIndex) {
      transitionProgress = 0;
      lastTargetIndex = targetIndex;
    }

    // Gradually increase transition progress
    transitionProgress = Math.min(1, transitionProgress + 0.05);

    // Spring physics with anticipation
    const applySpring = (
      current: number,
      target: number,
      velocity: number
    ): [number, number] => {
      // Apply anticipation only at the start (pulls back before moving forward)
      const anticipationPhase = Math.max(0, 1 - transitionProgress * 1); // Quick anticipation phase
      const anticipationOffset = anticipationPhase * anticipationStrength * 100;

      const effectiveTarget = target + anticipationOffset;
      const distance = effectiveTarget - current;
      const spring = distance * stiffness;
      const dampingForce = velocity * damping;
      const acceleration = spring - dampingForce;
      const newVelocity = velocity + acceleration;
      const newPosition = current + newVelocity;
      return [newPosition, newVelocity];
    };

    // Apply spring physics to all points
    [steps.y[0], velocities.y[0]] = applySpring(
      steps.y[0],
      target.y[0],
      velocities.y[0]
    );
    [steps.y[1], velocities.y[1]] = applySpring(
      steps.y[1],
      target.y[1],
      velocities.y[1]
    );
    [steps.y[2], velocities.y[2]] = applySpring(
      steps.y[2],
      target.y[2],
      velocities.y[2]
    );
    [steps.y[3], velocities.y[3]] = applySpring(
      steps.y[3],
      target.y[3],
      velocities.y[3]
    );

    [steps.x[0], velocities.x[0]] = applySpring(
      steps.x[0],
      target.x[0],
      velocities.x[0]
    );
    [steps.x[1], velocities.x[1]] = applySpring(
      steps.x[1],
      target.x[1],
      velocities.x[1]
    );

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
  // dimensions: [600, 800],
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
