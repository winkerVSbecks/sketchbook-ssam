import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';

const config = {
  // chladni frequency params
  a: 1,
  b: 1,
  // vibration strength params
  minWalk: 0.002,
  particleCount: 10_000,
  v: 0.1, //0.1,
  drawHeatmap: false,
};

const colors = Random.shuffle(randomPalette());
const bg = colors.pop()!;

interface Particle {
  x: number;
  y: number;
  xOff: number;
  yOff: number;
  stochasticAmplitude: number;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const systems = Array.from({ length: 4 }, (_, idx) =>
    createChladniSystem(width, height, {
      color: colors[idx],
      m: Random.rangeFloor(1, 10),
      n: Random.rangeFloor(1, 10),
    })
  );

  wrap.render = ({ width, height }: SketchProps) => {
    // Clear background
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Update and draw particles
    systems.forEach((drawSystem) => drawSystem(context));
  };
};

function createChladniSystem(
  width: number,
  height: number,
  { color, m, n }: { color: string; m: number; n: number }
): (context: CanvasRenderingContext2D) => void {
  // Initialize particles
  const particles: Particle[] = Array.from(
    { length: config.particleCount },
    () => createParticle(width, height)
  );

  return (context: CanvasRenderingContext2D) => {
    const activeParticles = particles.slice(0, config.particleCount);

    context.strokeStyle = color;
    activeParticles.forEach((particle) => {
      updateParticle(particle, width, height, m, n);
      context.beginPath();
      context.moveTo(particle.xOff, particle.yOff);
      context.lineTo(particle.xOff + 1, particle.yOff + 1);
      context.stroke();
    });
  };
}

// chladni 2D closed-form solution - returns between -1 and 1
function chladni(x: number, y: number, m: number, n: number): number {
  return (
    config.a * Math.sin(Math.PI * n * x) * Math.sin(Math.PI * m * y) +
    config.b * Math.sin(Math.PI * m * x) * Math.sin(Math.PI * n * y)
  );
}

function createParticle(width: number, height: number): Particle {
  const x = Random.range(0, 1);
  const y = Random.range(0, 1);

  return {
    x,
    y,
    xOff: width * x,
    yOff: height * y,
    stochasticAmplitude: 0,
  };
}

function updateParticle(
  particle: Particle,
  width: number,
  height: number,
  m: number,
  n: number
): void {
  // Calculate vibration amount
  const eq = chladni(particle.x, particle.y, m, n);

  // Set movement amplitude
  particle.stochasticAmplitude = config.v * Math.abs(eq);
  if (particle.stochasticAmplitude <= config.minWalk) {
    particle.stochasticAmplitude = config.minWalk;
  }

  // Random walk
  particle.x += Random.range(
    -particle.stochasticAmplitude,
    particle.stochasticAmplitude
  );
  particle.y += Random.range(
    -particle.stochasticAmplitude,
    particle.stochasticAmplitude
  );

  // Handle edges
  particle.x = Math.max(0, Math.min(1, particle.x));
  particle.y = Math.max(0, Math.min(1, particle.y));

  // Update screen space coordinates
  particle.xOff = width * particle.x;
  particle.yOff = height * particle.y;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
