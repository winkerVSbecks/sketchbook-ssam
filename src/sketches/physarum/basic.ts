import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Vector } from 'p5';
import Random from 'canvas-sketch-util/random';

let config = {
  count: 4000 * 4,
  rotationAngle: Math.PI / 4,
  sensorAngle: Math.PI / 4,
  sensorDist: 40,
};

const colors = {
  bg: 'rgba(0, 0, 0, 0.05)',
  particle: '#fff',
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const moldParticles: MoldParticle[] = [];

  for (let i = 0; i < config.count; i++) {
    moldParticles.push(generateMoldParticle(width, height));
  }

  wrap.render = ({ width, height, pixelRatio, frame }: SketchProps) => {
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    // Get pixel data
    const pixels = context.getImageData(
      0,
      0,
      width * pixelRatio,
      height * pixelRatio
    ).data;

    moldParticles.forEach((particle) => {
      updateMoldParticle(particle, width, height, pixelRatio, pixels);
      drawMoldParticle(context, particle);
    });
  };
};

interface MoldParticle {
  pos: Vector;
  r: number;
  heading: number;
  velocity: Vector;
  state: 'alive' | 'dead';
  rSensorPos: Vector;
  lSensorPos: Vector;
  fSensorPos: Vector;
}

function generateMoldParticle(width: number, height: number): MoldParticle {
  const heading = Random.range(0, Math.PI * 2);

  const p = Random.insideCircle(width * 0.4);

  return {
    // pos: new Vector(Random.range(0, width), Random.range(0, height)),
    pos: new Vector(width / 2 + p[0], height / 2 + p[1]),
    r: 1,
    heading,
    velocity: new Vector(Math.cos(heading), Math.sin(heading)),
    state: 'alive',
    rSensorPos: new Vector(0, 0),
    lSensorPos: new Vector(0, 0),
    fSensorPos: new Vector(0, 0),
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
  particle.pos.set(
    (particle.pos.x + particle.velocity.x + width) % width,
    (particle.pos.y + particle.velocity.y + height) % height
  );

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
  context: CanvasRenderingContext2D,
  particle: MoldParticle
) {
  context.beginPath();
  context.arc(particle.pos.x, particle.pos.y, particle.r, 0, Math.PI * 2);
  context.fillStyle = colors.particle;
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

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
