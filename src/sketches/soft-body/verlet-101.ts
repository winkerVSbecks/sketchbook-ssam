import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import pack from 'pack-spheres';
import toxi from 'toxiclibsjs';
import { clrs } from '../../colors/clrs';
import { drawPath } from '@daeinc/draw';

const { VerletPhysics2D, VerletParticle2D, VerletSpring2D } = toxi.physics2d;
const { GravityBehavior, AttractionBehavior } = toxi.physics2d.behaviors;
const { Vec2D, Rect } = toxi.geom;

interface SoftBody {
  particles: (typeof VerletParticle2D)[];
  springs: (typeof VerletSpring2D)[];
}

const physics = new VerletPhysics2D();
physics.setDrag(0.05);
const gravity = new GravityBehavior(new Vec2D(0, 0.05));
physics.addBehavior(gravity);

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let bounds = new Rect(0, 0, width, height);
  physics.setWorldBounds(bounds);

  const circles = pack({
    dimensions: 2,
    padding: 0,
    minRadius: 0.0625,
    maxRadius: 0.125,
  })
    .filter(({ radius }) => radius > 0.12)
    .map((s: any) => ({
      position: [
        mapRange(s.position[0], -1, 1, 0, width),
        mapRange(s.position[1], -1, 1, 0, height),
      ],
      r: (s.radius * width) / 2,
    }));

  const softBodies: SoftBody[] = circles.map(({ position, r }) => {
    return softBody(position, r, 24);
  });
  // const softBodies = Array.from({ length: 10 }, () => {
  //   return softBody(
  //     [Random.range(0, width), Random.range(0, height)],
  //     Random.range(width * 0.0625, width * 0.125),
  //     24
  //   );
  // });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    physics.update();

    softBodies.forEach((sb) => {
      drawSoftBody(context, sb);
    });
  };
};

function pointsAroundCircle([x, y]: Point, radius: number, count: number) {
  return Array.from({ length: count }, (_, idx) => {
    const angle = idx * ((Math.PI * 2) / count);
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
}

function softBody([x, y]: Point, radius: number, count: number): SoftBody {
  const pts = pointsAroundCircle([x, y], radius, count);
  const particles = pts.map(([x, y]) => particle(x, y));

  const springs = particles.map((p, idx) => {
    const next = particles[(idx + 1) % particles.length];
    return spring(p, next, 0.01);
  });

  particles.forEach((p, idx) => {
    const next = particles[(idx + 2) % particles.length];
    const s = spring(p, next, 0.01);
    springs.push(s);
  });

  particles.forEach((p, idx) => {
    const next = particles[(idx + 3) % particles.length];
    const s = spring(p, next, 0.01);
    springs.push(s);
  });

  particles.forEach((p, idx) => {
    const next = particles[(idx + 4) % particles.length];
    const s = spring(p, next, 0.01);
    springs.push(s);
  });

  const nucleus = particle(x, y);
  particles.push(nucleus);

  particles.forEach((p) => {
    const s = spring(p, nucleus, 0.01);
    springs.push(s);
  });

  return { particles, springs };
}

function drawSoftBody(context: CanvasRenderingContext2D, sb: SoftBody) {
  const pts = sb.particles.map((p) => [p.x, p.y]);
  pts.pop();

  context.fillStyle = 'black';
  pts.forEach((pt) => {
    context.beginPath();
    context.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
    context.fill();
  });

  context.beginPath();
  drawPath(context, pts, true);
  context.stroke();

  sb.springs.forEach((s) => {
    context.beginPath();
    context.moveTo(s.a.x, s.a.y);
    context.lineTo(s.b.x, s.b.y);
    context.stroke();
  });
}

function particle(x: number, y: number) {
  const p = new VerletParticle2D(new Vec2D(x, y));
  physics.addParticle(p);

  physics.addBehavior(new AttractionBehavior(p, 40, -5, 0.01));

  return p;
}

function spring(
  a: typeof VerletParticle2D,
  b: typeof VerletParticle2D,
  strength: number
) {
  const length = Math.hypot(a.x - b.x, a.y - b.y);
  const s = new VerletSpring2D(a, b, length, strength);
  physics.addSpring(s);
  return s;
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
