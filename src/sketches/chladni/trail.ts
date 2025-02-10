import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { randomPalette } from '../../colors';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const config = {
  // chladni frequency params
  a: 1,
  b: 1,
  // vibration strength params
  minWalk: 0.002,
  particleCount: 10_000,
  v: 0.1,
  // frequencies
  m: Random.rangeFloor(1, 10), //7,
  n: Random.rangeFloor(1, 10), //2,
  dither: true,
};

const colors = Random.shuffle(randomPalette());
const bg = colors.pop()!;

// const bg = 'rgb(30, 30, 30)';
// const fg = 'white';

// const bg = 'white';
// const fg = 'rgb(30, 30, 30)';

interface Particle {
  x: number;
  y: number;
  xOff: number;
  yOff: number;
  stochasticAmplitude: number;
  trail: Point[];
  state: 'alive' | 'dead';
  steps: number;
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

  wrap.render = ({ width, height, playhead, canvas }: SketchProps) => {
    // context.filter = 'blur(10px)';

    if (playhead < 0.5) {
      // Clear background
      context.fillStyle = bg;
      context.fillRect(0, 0, width, height);

      // Update and draw particles
      systems.forEach((drawSystem) => drawSystem(context, playhead));

      if (config.dither) {
        const ditheredImage = scaleCanvasAndApplyDither(
          width,
          height,
          0.25,
          canvas,
          (data) =>
            dither(data, {
              greyscaleMethod: 'none',
              ditherMethod: 'atkinson',
            })
        );
        context.drawImage(ditheredImage, 0, 0, width, height);
      }
    }
  };
};

function createChladniSystem(
  width: number,
  height: number,
  { color, m, n }: { color: string; m: number; n: number }
): (context: CanvasRenderingContext2D, playhead: number) => void {
  // Initialize particles
  const particles: Particle[] = Array.from(
    { length: config.particleCount },
    () => createParticle(width, height)
  );

  return (context: CanvasRenderingContext2D, playhead: number) => {
    const activeParticles = particles.slice(0, config.particleCount);

    context.strokeStyle = color;
    context.lineWidth = 2;
    activeParticles.forEach((particle) => {
      updateParticle(particle, width, height, m, n, playhead);
      drawPath(context, particle.trail);
      context.stroke();

      // context.beginPath();
      // context.moveTo(particle.xOff, particle.yOff);
      // context.lineTo(particle.xOff + 1, particle.yOff + 1);
      // context.stroke();
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
  const xOff = width * x;
  const yOff = height * y;

  return {
    x,
    y,
    xOff,
    yOff,
    stochasticAmplitude: 0,
    trail: [[xOff, yOff]],
    state: 'alive',
    steps: 0,
  };
}

function updateParticle(
  particle: Particle,
  width: number,
  height: number,
  m: number,
  n: number,
  playhead: number
): void {
  if (particle.state === 'dead') return;

  particle.steps++;

  // Calculate vibration amount
  const eq = chladni(particle.x, particle.y, m, n);

  // Set movement amplitude
  particle.stochasticAmplitude = config.v * Math.abs(eq);
  if (particle.stochasticAmplitude <= config.minWalk) {
    particle.stochasticAmplitude = config.minWalk;
  }

  // // Random walk
  // particle.x += Random.range(
  //   -particle.stochasticAmplitude,
  //   particle.stochasticAmplitude
  // );
  // particle.y += Random.range(
  //   -particle.stochasticAmplitude,
  //   particle.stochasticAmplitude
  // );

  particle.x +=
    Random.noise2D(particle.x / 100, (Random.sign() * playhead) / 100) *
    particle.stochasticAmplitude;
  particle.y +=
    Random.noise2D(particle.y / 100, (Random.sign() * playhead) / 100) *
    particle.stochasticAmplitude;

  // Handle edges
  particle.x = Math.max(0, Math.min(1, particle.x));
  particle.y = Math.max(0, Math.min(1, particle.y));

  // Update screen space coordinates
  particle.xOff = width * particle.x;
  particle.yOff = height * particle.y;

  // Update trail
  particle.trail.push([particle.xOff, particle.yOff]);

  if (particle.trail.length > 10) {
    particle.trail.shift();
  }

  if (particle.steps > 20) {
    particle.state = 'dead';
  }

  particle.trail = smoothTrail(particle.trail);
}

function smoothTrail(trail: Point[]): Point[] {
  return trail.map((_, i, arr) => {
    if (i === 0 || i === arr.length - 1) return arr[i];
    return [
      (arr[i - 1][0] + arr[i][0] + arr[i + 1][0]) / 3,
      (arr[i - 1][1] + arr[i][1] + arr[i + 1][1]) / 3,
    ];
  });
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 5000,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
