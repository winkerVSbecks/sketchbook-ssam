import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';
import { randomPalette } from '../colors';

const config = {
  particleCount: 500,
};

const colors = randomPalette();
const bg = colors.shift()!;

interface Particle {
  position: Vector;
  velocity: Vector;
  points: Vector[];
  color: string;
  state: 'active' | 'inactive';
}

function createParticle(x: number, y: number, color: string): Particle {
  const start = new Vector(x, y);
  return {
    position: new Vector(x, y),
    velocity: new Vector(Random.range(-1, 1), Random.range(-1, 1)).normalize(),
    points: [start],
    color,
    state: 'active',
  };
}

function signedNoise(x: number, y: number, t: number) {
  return Random.noise3D(x, y, t) - Random.noise3D(x, y, t + 12345.6789);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const particles = Array.from({ length: config.particleCount }, (_, idx) =>
    createParticle(
      Random.range(0, width),
      Random.range(0, height),
      colors[idx % colors.length]
    )
  );

  const padding = width * 0.1;
  const bounds = [
    [padding, padding],
    [width - padding, height - padding],
  ];

  wrap.render = ({ frame, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = frame / 60;

    context.lineWidth = 1;
    particles.forEach((particle) => {
      context.strokeStyle = particle.color;
      // context.strokeStyle = `rgb(from ${particle.color} r g b / ${playhead})`;

      const [start, ...rest] = particle.points;
      context.beginPath();
      context.moveTo(start.x, start.y);
      for (const p of rest) {
        context.lineTo(p.x, p.y);
      }
      context.stroke();

      if (
        particle.position.x < bounds[0][0] ||
        particle.position.x > bounds[1][0] ||
        particle.position.y < bounds[0][1] ||
        particle.position.y > bounds[1][1]
      ) {
        particle.state = 'inactive';
      }

      if (particle.state === 'active') {
        particle.points.push(particle.position.copy());
        particle.position.add(particle.velocity);

        const p = particle.position.copy().normalize();
        const rotation = signedNoise(p.x, p.y, t) * 0.2;
        particle.velocity.rotate(rotation);
      }
    });

    // context.strokeStyle = stroke;
    // context.lineWidth = 5;
    // context.beginPath();
    // context.moveTo(bounds[0][0], bounds[0][1]);
    // context.lineTo(bounds[1][0], bounds[0][1]);
    // context.lineTo(bounds[1][0], bounds[1][1]);
    // context.lineTo(bounds[0][0], bounds[1][1]);
    // context.closePath();
    // context.stroke();
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
