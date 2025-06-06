import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Vector } from 'p5';
import * as tome from 'chromotome';
import { formatCss, interpolate } from 'culori';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const config = {
  // Particles
  particleCount: 40,
  length: 120,
  // Crumble
  resolution: Random.rangeFloor(5, 10),
  margin: 0.2,
  numWarps: Random.rangeFloor(2, 10),
  warpSize: Random.range(0.5, 1.5),
  falloff: Random.range(0.3, 0.7), // Should be between 0 and 1
  scale: Random.range(0.5, 1.5),
  frequency: Random.range(0.05, 0.1),
  amplitude: Random.range(0.5, 1.5),
  gradient: Random.pick([
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 1],
    [1, 1, 0, 0],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
  ]),
};

const tomeColors = tome.get();
const colors = tomeColors.colors;
const bg = tomeColors.background || '#fff';
const strokeColor = tomeColors.stroke || bg;

interface Particle {
  position: Vector;
  velocity: Vector;
  points: Vector[];
  color: string;
  state: 'active' | 'inactive';
  size: number;
  colorMap: (t: number) => string;
  curviness: number;
}

function createParticle(x: number, y: number, color: string): Particle {
  const start = new Vector(x, y);
  return {
    position: new Vector(x, y),
    velocity: new Vector(Random.range(-1, 1), Random.range(-1, 1))
      .normalize()
      .mult(Random.rangeFloor(1, 10)),
    points: [start],
    color,
    state: 'active',
    size: Random.rangeFloor(32, 80),
    colorMap: (t: number) => formatCss(interpolate([bg, color])(t)),
    curviness: Random.range(0.1, 0.4), // 0.2
  };
}

function signedNoise(x: number, y: number, t: number) {
  return Random.noise3D(x, y, t) - Random.noise3D(x, y, t + 12345.6789);
}

function getWarpedPosition(x: number, y: number, t: number) {
  let scale = config.scale;

  for (let i = 0; i < config.numWarps; i++) {
    // Scale from [-1, 1] to [-warpSize, warpSize]
    const dx =
      config.warpSize *
      Random.noise3D(x, y, t, config.frequency, config.amplitude);
    const dy =
      config.warpSize *
      Random.noise3D(x, y, t, config.frequency, config.amplitude);
    x += scale * dx;
    y += scale * dy;
    scale *= config.falloff;
  }
  return [x, y];
}

function drawCrumble(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const margin = width * config.margin;
  const w = (width - 2 * margin) / config.resolution;
  const h = (height - 2 * margin) / config.resolution;

  // Store all points in a 2D array
  const points: { x: number; y: number }[][] = [];
  for (let i = 0; i < config.resolution; i++) {
    points[i] = [];
    for (let j = 0; j < config.resolution; j++) {
      const [_x, _y] = getWarpedPosition(i, j, 0);
      const x = margin + _x * w;
      const y = margin + _y * h;
      points[i][j] = { x, y };
    }
  }

  const a = [config.gradient[0] * width, config.gradient[1] * height];
  const b = [config.gradient[2] * width, config.gradient[3] * height];
  const gradient = context.createLinearGradient(a[0], a[1], b[0], b[1]);
  colors.forEach((color: string, idx: number) => {
    gradient.addColorStop(
      idx / colors.length,
      `rgb(from ${color} r g b / 0.9)`
    );
  });

  context.fillStyle = gradient;
  // link points to faces and use getColorAtPosition(i, j); for the fill style
  for (let i = 0; i < config.resolution; i++) {
    for (let j = 0; j < config.resolution; j++) {
      // Draw horizontal line to next point
      if (j < config.resolution - 1 && i < config.resolution - 1) {
        const p1 = points[i][j];
        const p2 = points[i][j + 1];
        const p3 = points[i + 1][j];
        const p4 = points[i + 1][j + 1];

        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p4.x, p4.y);
        context.lineTo(p3.x, p3.y);
        context.lineTo(p1.x, p1.y);
        context.fill();
      }
    }
  }

  // Draw horizontal and vertical lines to create the mesh
  context.lineWidth = 2;
  context.strokeStyle = strokeColor;
  for (let i = 0; i < config.resolution; i++) {
    for (let j = 0; j < config.resolution; j++) {
      const point = points[i][j];

      // Draw horizontal line to next point
      if (j < config.resolution - 1) {
        const nextPoint = points[i][j + 1];
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(nextPoint.x, nextPoint.y);
        context.stroke();
      }

      // Draw vertical line to next point
      if (i < config.resolution - 1) {
        const nextPoint = points[i + 1][j];
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(nextPoint.x, nextPoint.y);
        context.stroke();
      }
    }
  }
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const particles = Array.from({ length: config.particleCount }, (_, idx) => {
    const pos = [Random.range(0, width), Random.range(0, height)];
    return createParticle(pos[0], pos[1], colors[idx % colors.length]);
  });

  const padding = width * 0.1;
  const bounds = [
    [padding, padding],
    [width - padding, height - padding],
  ];

  const particlesLayer1 = particles.slice(0, config.particleCount * 0.5);
  const particlesLayer2 = particles.slice(
    config.particleCount * 0.5,
    config.particleCount
  );

  function drawParticle(particle: Particle, t: number) {
    for (let i = 1; i < particle.points.length; i++) {
      context.lineWidth = mapRange(
        i,
        0,
        particle.points.length,
        1,
        particle.size
      );
      context.strokeStyle = particle.colorMap(i / particle.points.length);

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
  }

  wrap.render = ({ frame, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = frame / 60;

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    particlesLayer1.forEach((particle) => drawParticle(particle, t));

    drawCrumble(context, width, height);

    particlesLayer2.forEach((particle) => drawParticle(particle, t));

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
