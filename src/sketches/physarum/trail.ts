import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Vector } from 'p5';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import pack from 'pack-spheres';
import { drawCircle, drawPath } from '@daeinc/draw';
import { createOffscreenCanvas } from '@daeinc/canvas';
import { interpolate, parse, formatRgb, formatHsl, formatCss } from 'culori';
import smooth from 'chaikin-smooth';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

let config = {
  count: 4000 * 2,
  rotationAngle: Math.PI / 4,
  sensorAngle: Math.PI / 4,
  sensorDist: 40,
  particleSize: 1,
  blending: 'none', // 'color-burn', // 'soft-light', // 'overlay',
  dither: false,
  iterations: 4,
  smoothPath: false,
};

const moldColors = {
  bg: 'rgba(0, 0, 0, 0.05)',
  particle: 'rgba(255, 255, 255, 0.1)',
};

let colors = Random.pick([...mindfulPalettes, ...autoAlbersPalettes]).map(
  (c: string) => setAlpha(c, 0.5)
); //generateColors();
const bg = colors.pop()!;
// const colorSale = interpolate([bg, ...colors]);
// const trailColorMap = (t: number) => formatCss(colorSale(t));

interface Circle {
  position: Point;
  r: number;
}

function drawGradientPath(
  context: CanvasRenderingContext2D,
  path: Point[],
  map: (t: number) => string
) {
  for (let i = 1; i < path.length - 1; i++) {
    // context.strokeStyle = trailColorMap(1 - i / (path.length - 1));
    context.strokeStyle = map(1 - i / (path.length - 1));
    context.beginPath();
    context.moveTo(...path[i - 1]);
    context.lineTo(...path[i]);
    context.stroke();
  }
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

    moldParticles.forEach((particle, idx) => {
      if (particle.state !== 'dead') {
        updateMoldParticle(particle, width, height, pixelRatio, pixels);
      }
      drawMoldParticle(offscreenContext, particle);
    });
  }

  if (config.blending !== 'none') {
    context.globalCompositeOperation =
      config.blending as GlobalCompositeOperation;
  }

  wrap.render = (props: SketchProps) => {
    const { width, height, frame } = props;

    // if (frame >= 500 && !config.smoothPath) {
    //   config.smoothPath = true;
    //   console.log('smoothing enabled');
    // } else if (frame < 500) {
    //   console.log(frame / 500);
    // }

    renderOffscreenMold(props);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.lineWidth = config.particleSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    moldParticles.forEach((particle) => {
      drawGradientPath(context, particle.trail, particle.trailColorMap);
      // context.strokeStyle = particle.color;
      // context.save();
      // context.beginPath();
      // drawPath(context, particle.trail);
      // context.stroke();
      // context.restore();
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
  trailColorMap: (t: number) => string;
}

function generateMoldParticle(
  width: number,
  height: number,
  circle: Circle
): MoldParticle {
  const heading = Random.range(0, Math.PI * 2);

  const o = Random.onCircle(circle.r);
  const pos: Point = [circle.position[0] + o[0], circle.position[1] + o[1]];
  // const pos: Point = [Random.range(0, width), Random.range(0, height)];

  const color = Random.pick(colors);
  const colorSale = interpolate([bg, color]);
  const trailColorMap = (t: number) => formatCss(colorSale(t));

  return {
    pos: new Vector(...pos),
    heading,
    velocity: new Vector(Math.cos(heading), Math.sin(heading)),
    state: 'alive',
    rSensorPos: new Vector(0, 0),
    lSensorPos: new Vector(0, 0),
    fSensorPos: new Vector(0, 0),
    trail: [pos],
    // color: setAlpha(Random.pick(colors), 0.5),
    color,
    trailColorMap,
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
    particle.pos.x + particle.velocity.x,
    particle.pos.y + particle.velocity.y,
    // (particle.pos.x + particle.velocity.x + width) % width,
    // (particle.pos.y + particle.velocity.y + height) % height,
  ];

  particle.pos.set(nextPos[0], nextPos[1]);
  particle.trail.push(nextPos);

  if (config.smoothPath && particle.state !== 'dead') {
    // let output = [...particle.trail];
    // for (let index = 0; index < config.iterations; index++) {
    //   particle.trail = smooth(particle.trail);
    // }
    // particle.trail = output;
    particle.state = 'dead';
  }

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
  // duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
