import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Vector } from 'p5';
import * as tome from 'chromotome';
import { formatCss, interpolate } from 'culori';
import { randomPalette } from '../../colors';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const config = {
  // Particles
  particleCount: 40,
  colorMode: Random.pick(['tome', 'random']),
  length: 120,
  // Crumble
  resolution: 25,
  margin: 0.2,
  numWarps: 5,
  warpSize: 1.2,
  falloff: 0.5, // Should be between 0 and 1
  scale: 1,
  frequency: 0.1,
  amplitude: 1,
};

const tomeColors = tome.get();
const colors =
  config.colorMode === 'tome' ? tomeColors.colors : randomPalette();
const bg =
  config.colorMode === 'tome'
    ? tomeColors.background || '#fff'
    : colors.shift()!;
const colorSale = interpolate(colors);

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

  const gradient = context.createLinearGradient(0, 0, 0, height);
  colors.forEach((color: string, idx: number) => {
    gradient.addColorStop(
      idx / colors.length,
      `rgb(from ${color} r g b / 0.9)`
    );
  });

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

    context.fillStyle = gradient;
    context.fillRect(
      padding * 2,
      padding * 2,
      width - padding * 4,
      height - padding * 4
    );

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
