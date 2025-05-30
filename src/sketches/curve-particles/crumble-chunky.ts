import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Vector } from 'p5';
import * as tome from 'chromotome';
import { formatCss, interpolate } from 'culori';
import { randomPalette } from '../../colors';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';
import { wcagContrast } from 'culori';

const config = {
  // Particles
  particleCount: 40,
  colorMode: Random.pick(['tome', 'random']),
  length: 120,
  // Crumble
  resolution: Random.rangeFloor(5, 50),
  margin: 0.2,
  numWarps: 5,
  warpSize: 1.2,
  falloff: 0.5, // Should be between 0 and 1
  scale: 1,
  frequency: Random.range(0.05, 0.1),
  amplitude: 1,
};

const tomeColors = tome.get();
const colors =
  config.colorMode === 'tome' ? tomeColors.colors : randomPalette();
const bg =
  config.colorMode === 'tome'
    ? tomeColors.background || '#fff'
    : colors.shift()!;
// highest contrast color to bg
const [textColor1, textColor2] = colors
  .reduce((acc: { color: string; contrast: number }[], color: string) => {
    const contrast = wcagContrast(color, bg);
    if (contrast > 1) {
      acc.push({ color, contrast });
    }
    return acc;
  }, [])
  .sort(
    (a: { contrast: number }, b: { contrast: number }) =>
      b.contrast - a.contrast
  )
  .map((color: { color: string }) => color.color);

// colors;
// .map((color: string) => wcagContrast(color, bg))
// .filter((contrast: number) => contrast > 1)
// .sort((a: number, b: number) => b - a)[0];

const colorSale = interpolate(colors);
const colormap = (t: number) => formatCss(colorSale(t));

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

const onomatopoeia = [
  'Bam',
  'Bark',
  'Beep',
  'Ahem',
  'Hiss',
  'Meow',
  'Quack',
  'Baa',
  'Bang',
  'Bash',
  'Bawl',
  'Belch',
  'Blab',
  'Blare',
  'Chirp',
  'Fizz',
  'Gobble',
  'Hiccup',
  'Hum',
  'Moo',
  'Oink',
  'Pop',
  'Roar',
];

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

function drawParticle(
  context: CanvasRenderingContext2D,
  bounds: number[][],
  particle: Particle,
  t: number
) {
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

function getColorAtPosition(x: number, y: number) {
  // (1 + value)/2 maps from [-1, 1] to [0, 1]
  const value = mapRange(
    Random.noise2D(x, y, config.frequency, config.amplitude),
    -1,
    1,
    0,
    1
  );
  const color = colormap(value);
  return color;
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

  const gradient = context.createLinearGradient(0, 0, 0, height);
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
  for (let i = 0; i < config.resolution; i++) {
    for (let j = 0; j < config.resolution; j++) {
      const point = points[i][j];
      context.strokeStyle = getColorAtPosition(i, j);

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

  const gradient = context.createLinearGradient(0, 0, 0, height);
  colors.forEach((color: string, idx: number) => {
    gradient.addColorStop(
      idx / colors.length,
      `rgb(from ${color} r g b / 0.9)`
    );
  });

  const word = Random.pick(onomatopoeia).toUpperCase();

  wrap.render = ({ frame, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = frame / 60;

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    particlesLayer1.forEach((particle) =>
      drawParticle(context, bounds, particle, t)
    );

    // context.fillStyle = gradient;
    // context.fillRect(
    //   padding * 2,
    //   padding * 2,
    //   width - padding * 4,
    //   height - padding * 4
    // );

    drawCrumble(context, width, height);

    // Draw the word
    context.fillStyle = textColor1;
    context.strokeStyle = textColor2;
    context.lineWidth = 8;
    // context.font = '900 200px Futura, sans-serif';
    context.font = 'bold 200px "Operator Mono", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(word, width / 2, height / 2);
    context.fillText(word, width / 2, height / 2);

    particlesLayer2.forEach((particle) =>
      drawParticle(context, bounds, particle, t)
    );

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
