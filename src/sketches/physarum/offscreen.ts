import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Vector } from 'p5';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import pack from 'pack-spheres';
import { drawCircle } from '@daeinc/draw';
import { createOffscreenCanvas } from '@daeinc/canvas';
import { parse, formatRgb, formatHsl } from 'culori';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

let config = {
  count: 4000 * 4,
  rotationAngle: Random.range(0, Math.PI), // Math.PI / 4,
  sensorAngle: Random.range(0, Math.PI), // Math.PI / 4,
  sensorDist: Random.range(5, 50), //40,
  particleSize: 1,
  blending: 'none', // 'color-burn', // 'soft-light', // 'overlay',
  dither: false,
};
console.log(config);

const moldColors = {
  bg: 'rgba(0, 0, 0, 0.05)',
  particle: 'rgba(255, 255, 255, 0.1)',
};

let colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);
const bg = setAlpha(colors.pop()!, 0.05);

interface Circle {
  position: Point;
  r: number;
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  pixelRatio,
  canvas,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = Math.min(width, height);
  const scale = 0.5 * size;

  const shapes = pack({
    dimensions: 2,
    padding: 0.0025,
    minRadius: 0.03125,
    maxRadius: 0.25,
  });

  const circles: Circle[] = shapes.map((shape: any) => ({
    position: [
      scale + shape.position[0] * scale,
      scale + shape.position[1] * scale,
    ],
    r: shape.radius * scale,
  }));

  let moldParticles: MoldParticle[] = [];

  for (let i = 0; i < config.count; i++) {
    moldParticles.push(
      generateMoldParticle(width, height, Random.pick(circles))
    );
  }

  const particles = [...moldParticles];

  circles.forEach((circle) => {
    context.strokeStyle = moldColors.particle;
    drawCircle(context, circle.position, circle.r * 2);
    context.stroke();
  });

  const { context: _context } = createOffscreenCanvas({
    context: '2d',
    width,
    height,
    pixelRatio,
  });

  const offscreenContext = _context as OffscreenCanvasRenderingContext2D;

  function renderOffscreenMold({ playhead }: SketchProps) {
    offscreenContext.fillStyle = moldColors.bg;
    offscreenContext.fillRect(0, 0, width, height);

    if (playhead === 0) {
      moldParticles = [...particles];
    }

    // Get pixel data
    const pixels = offscreenContext.getImageData(
      0,
      0,
      width * pixelRatio,
      height * pixelRatio
    ).data;

    moldParticles.forEach((particle) => {
      updateMoldParticle(particle, width, height, pixelRatio, pixels);
      drawMoldParticle(offscreenContext, particle);
    });
  }

  if (config.blending !== 'none') {
    context.globalCompositeOperation =
      config.blending as GlobalCompositeOperation;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'd') {
      config.dither = !config.dither;
    }
  });

  let isMouseDown = false;
  document.addEventListener('mousedown', () => {
    isMouseDown = true;
  });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  document.addEventListener('mouseleave', () => {
    isMouseDown = false;
  });

  document.addEventListener('mousemove', (event) => {
    if (!isMouseDown) return;
    const rect = canvas.getBoundingClientRect();

    const pos = {
      x: mapRange(event.clientX - rect.left, 0, rect.width, 0, width),
      y: mapRange(event.clientY - rect.top, 0, rect.height, 0, height),
    };

    moldParticles.push(generateMoldParticleAt(pos.x, pos.y));
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;

    renderOffscreenMold(props);

    // debug
    // const imageData = offscreenContext.getImageData(
    //   0,
    //   0,
    //   width * pixelRatio,
    //   height * pixelRatio
    // );
    // context.putImageData(imageData, 0, 0);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.lineWidth = config.particleSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    moldParticles.forEach((particle) => {
      context.beginPath();
      context.arc(
        particle.pos.x,
        particle.pos.y,
        config.particleSize,
        0,
        Math.PI * 2
      );
      context.fillStyle = particle.color;
      context.fill();
    });

    if (config.dither) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.75,
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

/**
 * Mold System
 */
interface MoldParticle {
  pos: Vector;
  heading: number;
  velocity: Vector;
  state: 'alive' | 'dead';
  rSensorPos: Vector;
  lSensorPos: Vector;
  fSensorPos: Vector;
  trail: Point[];
  color: string;
}

function generateMoldParticle(
  width: number,
  height: number,
  circle: Circle
): MoldParticle {
  const heading = Random.range(0, Math.PI * 2);

  const o = Random.onCircle(circle.r);
  const pos: Point = [circle.position[0] + o[0], circle.position[1] + o[1]];

  return {
    pos: new Vector(...pos),
    heading,
    velocity: new Vector(Math.cos(heading), Math.sin(heading)),
    state: 'alive',
    rSensorPos: new Vector(0, 0),
    lSensorPos: new Vector(0, 0),
    fSensorPos: new Vector(0, 0),
    trail: [pos],
    color: setAlpha(Random.pick(colors), 0.5),
  };
}

function generateMoldParticleAt(x: number, y: number): MoldParticle {
  const heading = Random.range(0, Math.PI * 2);
  return {
    pos: new Vector(x, y),
    heading,
    velocity: new Vector(Math.cos(heading), Math.sin(heading)),
    state: 'alive',
    rSensorPos: new Vector(0, 0),
    lSensorPos: new Vector(0, 0),
    fSensorPos: new Vector(0, 0),
    trail: [[x, y]],
    color: setAlpha(Random.pick(colors), 0.5),
  };
}

function getSensorPos(
  pos: Vector,
  angle: number,
  width: number,
  height: number
): [x: number, y: number] {
  return [
    (pos.x + config.sensorDist * Math.cos(angle) + width) % width,
    (pos.y + config.sensorDist * Math.sin(angle) + height) % height,
  ];
}

function updateMoldParticle(
  particle: MoldParticle,
  width: number,
  height: number,
  pixelRatio: number,
  pixels: Uint8ClampedArray
) {
  if (particle.state === 'dead') {
    particle.velocity.set(0, 0);
  } else {
    particle.velocity.set(
      Math.cos(particle.heading),
      Math.sin(particle.heading)
    );
  }

  // Wrap particle around the canvas
  const nextPos: Point = [
    // particle.pos.x + particle.velocity.x,
    // particle.pos.y + particle.velocity.y,
    (particle.pos.x + particle.velocity.x + width) % width,
    (particle.pos.y + particle.velocity.y + height) % height,
  ];

  particle.pos.set(nextPos[0], nextPos[1]);
  particle.trail.push(nextPos);

  particle.rSensorPos.set(
    ...getSensorPos(
      particle.pos,
      particle.heading + config.sensorAngle,
      width,
      height
    )
  );
  particle.lSensorPos.set(
    ...getSensorPos(
      particle.pos,
      particle.heading - config.sensorAngle,
      width,
      height
    )
  );
  particle.fSensorPos.set(
    ...getSensorPos(particle.pos, particle.heading, width, height)
  );

  const r = getPixelValue(particle.rSensorPos, pixelRatio, width, pixels);
  const l = getPixelValue(particle.lSensorPos, pixelRatio, width, pixels);
  const f = getPixelValue(particle.fSensorPos, pixelRatio, width, pixels);

  if (f > l && f > r) {
    particle.heading += 0;
  } else if (f < l && f < r) {
    particle.heading += Random.chance()
      ? config.rotationAngle
      : -config.rotationAngle;
  } else if (l > r) {
    particle.heading -= config.rotationAngle;
  } else if (r > l) {
    particle.heading += config.rotationAngle;
  }
}

function drawMoldParticle(
  context: OffscreenCanvasRenderingContext2D,
  particle: MoldParticle
) {
  context.beginPath();
  context.arc(
    particle.pos.x,
    particle.pos.y,
    config.particleSize,
    0,
    Math.PI * 2
  );
  context.fillStyle = moldColors.particle;
  context.fill();
}

// Get pixel values at sensor positions
function getPixelValue(
  pos: Vector,
  pixelRatio: number,
  width: number,
  pixels: Uint8ClampedArray
) {
  const index =
    4 * (pixelRatio * Math.floor(pos.y)) * (pixelRatio * width) +
    4 * (pixelRatio * Math.floor(pos.x));
  return pixels[index];
}

function setAlpha(color: string, alpha: number): string {
  try {
    // Parse the color
    const parsed = parse(color);
    if (!parsed) {
      throw new Error(`Invalid color: ${color}`);
    }

    // Set the alpha
    parsed.alpha = alpha;

    // Return in the same format if possible, otherwise RGB
    switch (parsed.mode) {
      case 'rgb':
        return formatRgb(parsed);
      case 'hsl':
        return formatHsl(parsed);
      case 'lch':
      case 'lab':
      case 'oklch':
      case 'oklab':
        // These formats aren't commonly used in CSS, convert to RGB
        return formatRgb(parsed);
      default:
        return formatRgb(parsed);
    }
  } catch (e) {
    console.error('Error setting alpha:', e);
    return color; // Return original color on error
  }
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
