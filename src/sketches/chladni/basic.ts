import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const config = {
  // chladni frequency params
  a: 1,
  b: 1,
  // vibration strength params
  minWalk: 0.002,
  particleCount: 10_000,
  v: 0.1,
  drawHeatmap: false,
  // frequencies
  m: Random.rangeFloor(1, 10), //7,
  n: Random.rangeFloor(1, 10), //2,
};

const bg = 'rgb(30, 30, 30)';
const fg = 'white';

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

  const drawSystem = createChladniSystem(width, height, fg);

  wrap.render = ({ width, height }: SketchProps) => {
    // Clear background
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw heatmap if enabled
    if (config.drawHeatmap) {
      drawHeatmap(context, width, height);
    }

    // Update and draw particles
    drawSystem(context);
  };
};

function createChladniSystem(
  width: number,
  height: number,
  color: string
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
      updateParticle(particle, width, height);
      context.beginPath();
      context.moveTo(particle.xOff, particle.yOff);
      context.lineTo(particle.xOff + 1, particle.yOff + 1);
      context.stroke();
    });
  };
}

// chladni 2D closed-form solution - returns between -1 and 1
function chladni(x: number, y: number): number {
  return (
    config.a *
      Math.sin(Math.PI * config.n * x) *
      Math.sin(Math.PI * config.m * y) +
    config.b *
      Math.sin(Math.PI * config.m * x) *
      Math.sin(Math.PI * config.n * y)
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
  height: number
): void {
  // Calculate vibration amount
  const eq = chladni(particle.x, particle.y);

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

function drawHeatmap(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const resolution = 3;

  for (let i = 0; i <= width; i += resolution) {
    for (let j = 0; j <= height; j += resolution) {
      const eq = chladni(i / width, j / height);

      context.fillStyle = `rgb(${(eq + 1) * 127.5}, ${(eq + 1) * 127.5}, ${
        (eq + 1) * 127.5
      })`;
      context.fillRect(i, j, resolution, resolution);
    }
  }
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
