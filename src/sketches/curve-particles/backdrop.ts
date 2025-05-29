import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Vector } from 'p5';
import * as tome from 'chromotome';
import { formatCss, interpolate } from 'culori';
import { randomPalette } from '../../colors';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const shape = Random.pick([
  'circle',
  'rectangle',
  'triangle',
  'full',
]) as keyof typeof getRandomPosition;

const config = {
  particleCount: shape === 'full' ? 5000 : 2000,
  colorMode: Random.pick(['tome', 'random']),
  shape,
  length: 30,
};

const tomeColors = tome.get();
const colors =
  config.colorMode === 'tome' ? tomeColors.colors : randomPalette();
const bg =
  config.colorMode === 'tome'
    ? tomeColors.background || '#fff'
    : colors.shift()!;

const gradient = (t: number) => formatCss(interpolate(colors)(t));

interface Particle {
  position: Vector;
  velocity: Vector;
  points: Vector[];
  color: string;
  state: 'active' | 'inactive';
  size: number;
  colorMap: (t: number) => string;
  curviness: number;
  style: 'diffused' | 'tapered' | 'solid';
}

function createParticle(x: number, y: number, color: string): Particle {
  const start = new Vector(x, y);
  return {
    position: new Vector(x, y),
    velocity: new Vector(Random.range(-1, 1), Random.range(-1, 1)).normalize(),
    points: [start],
    color,
    state: 'active',
    size: Random.range(0.25, 2),
    colorMap: (t: number) => formatCss(interpolate([bg, color])(t)),
    curviness: Random.range(0.1, 0.5), // 0.2
    style: Random.weightedSet([
      { value: 'diffused', weight: 50 },
      { value: 'tapered', weight: 250 },
      { value: 'solid', weight: 50 },
    ]),
  };
}

function signedNoise(x: number, y: number, t: number) {
  return Random.noise3D(x, y, t) - Random.noise3D(x, y, t + 12345.6789);
}

const getRandomPosition = {
  circle: (width: number, height: number): Point => {
    const x = width * 0.5;
    const y = height * 0.5;
    const radius = width * 0.25;
    const pos = Random.insideCircle(radius);
    return [x + pos[0], y + pos[1]];
  },
  rectangle: (width: number, height: number): Point => {
    const x = Random.range(width * 0.25, width * 0.75);
    const y = Random.range(height * 0.25, height * 0.75);
    return [x, y];
  },
  triangle: (width: number, height: number): Point => {
    const size = width * 0.5;
    const h = (size * Math.sqrt(3)) / 2;
    const [cx, cy] = [width * 0.5, height * 0.5 + h / 6];
    const v1 = { x: cx, y: cy - (h * 2) / 3 }; // top vertex
    const v2 = { x: cx - size / 2, y: cy + (h * 1) / 3 }; // bottom left
    const v3 = { x: cx + size / 2, y: cy + (h * 1) / 3 }; // bottom right

    // Generate random point using barycentric coordinates
    let r1 = Math.random();
    let r2 = Math.random();

    // Ensure point is inside triangle
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }

    const r3 = 1 - r1 - r2;

    return [
      r1 * v1.x + r2 * v2.x + r3 * v3.x,
      r1 * v1.y + r2 * v2.y + r3 * v3.y,
    ];
  },
  full: (width: number, height: number): Point => {
    const x = Random.range(0, width);
    const y = Random.range(0, height);
    return [x, y];
  },
};

const drawShapes = {
  circle: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    const x = width * 0.5;
    const y = height * 0.5;
    const radius = width * 0.25;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fill();
  },
  rectangle: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    context.fillRect(width * 0.25, height * 0.25, width * 0.5, height * 0.5);
  },
  triangle: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    const size = width * 0.5;
    const h = (size * Math.sqrt(3)) / 2;
    const [cx, cy] = [width * 0.5, height * 0.5 + h / 6];
    const v1 = { x: cx, y: cy - (h * 2) / 3 }; // top vertex
    const v2 = { x: cx - size / 2, y: cy + (h * 1) / 3 }; // bottom left
    const v3 = { x: cx + size / 2, y: cy + (h * 1) / 3 }; // bottom right

    context.beginPath();
    context.moveTo(v1.x, v1.y);
    context.lineTo(v2.x, v2.y);
    context.lineTo(v3.x, v3.y);
    context.closePath();
    context.fill();
  },
  full: (context: CanvasRenderingContext2D, width: number, height: number) => {
    context.fillRect(
      width * 0.125,
      height * 0.125,
      width * 0.75,
      height * 0.75
    );
  },
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const particles = Array.from({ length: config.particleCount }, (_, idx) => {
    const pos = getRandomPosition[config.shape](width, height);
    return createParticle(pos[0], pos[1], colors[idx % colors.length]);
  });

  const padding = width * 0.1;
  const bounds = [
    [padding, padding],
    [width - padding, height - padding],
  ];

  wrap.render = ({ frame, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.fillStyle = colors[0];
    drawShapes[config.shape](context, width, height);

    const t = frame / 60;

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    particles.forEach((particle) => {
      for (let i = 1; i < particle.points.length; i++) {
        if (particle.style === 'diffused') {
          context.lineWidth = mapRange(i, 0, particle.points.length, 32, 8);
          context.strokeStyle = `rgb(from ${particle.colorMap(
            i / particle.points.length
          )} r g b / ${Math.min(i / particle.points.length, 0.03125)})`;
        } else if (particle.style === 'tapered') {
          context.lineWidth = mapRange(i, 0, particle.points.length, 1, 8);
          context.strokeStyle = particle.colorMap(i / particle.points.length);
        } else if (particle.style === 'solid') {
          context.lineWidth = 1;
          context.strokeStyle = particle.color;
        }
        const p1 = particle.points[i - 1];
        const p2 = particle.points[i];
        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.stroke();
      }

      if (
        particle.position.x < bounds[0][0] ||
        particle.position.x > bounds[1][0] ||
        particle.position.y < bounds[0][1] ||
        particle.position.y > bounds[1][1]
      ) {
        particle.state = 'inactive';
      }

      if (particle.points.length > config.length) {
        particle.state = 'inactive';
      }

      if (particle.state === 'active') {
        particle.points.push(particle.position.copy());
        particle.position.add(particle.velocity);

        const p = particle.position.copy().normalize();
        const rotation = signedNoise(p.x, p.y, t) * particle.curviness;
        particle.velocity.rotate(rotation);
      }
    });

    const allInactive = particles.every(
      (particle) => particle.state === 'inactive'
    );

    if (allInactive) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.5,
        canvas,
        (data) =>
          dither(data, {
            greyscaleMethod: 'none',
            ditherMethod: 'atkinson',
          })
      );

      context.drawImage(ditheredImage, 0, 0, width, height);
    }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
