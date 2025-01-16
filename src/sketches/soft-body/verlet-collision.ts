import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import toxi from 'toxiclibsjs';
import smooth from 'chaikin-smooth';
import pack from 'pack-spheres';
import { drawPath } from '@daeinc/draw';
import { mapRange } from 'canvas-sketch-util/math';

const { VerletPhysics2D, VerletParticle2D, VerletSpring2D } = toxi.physics2d;
const { GravityBehavior } = toxi.physics2d.behaviors;
const { Vec2D, Rect } = toxi.geom;

interface SoftBody {
  particles: (typeof VerletParticle2D)[];
  springs: (typeof VerletSpring2D)[];
}

const particleR = 10;
const debug = false;

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

  const circles: { position: Point; r: number }[] = pack({
    dimensions: 2,
    padding: 0,
    minRadius: 0.1,
    maxRadius: 0.2,
  }).map((s: any) => ({
    position: [
      mapRange(s.position[0], -1, 1, 0, width),
      mapRange(s.position[1], -1, 1, 0, height),
    ],
    r: (s.radius * width) / 2,
  }));

  const softBodies: SoftBody[] = circles.map(({ position, r }, idx) => {
    return softBody(position, r, 24, idx);
  });

  const particles = softBodies.flatMap((sb) => sb.particles);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    const doSmooth = false; //playhead > 0.8;

    particles.forEach((p) => {
      checkCollision(
        p,
        particles.filter((t) => t.parentId !== p.parentId)
      );
    });

    if (!doSmooth) {
      physics.update();
    }

    softBodies.forEach((sb) => {
      drawSoftBody(context, sb, doSmooth);
    });
  };
};

function pointsAroundCircle([x, y]: Point, radius: number, count: number) {
  return Array.from({ length: count }, (_, idx) => {
    const angle = idx * ((Math.PI * 2) / count);
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
}

function softBody(
  [x, y]: Point,
  radius: number,
  count: number,
  id: number
): SoftBody {
  const pts = pointsAroundCircle([x, y], radius, count);
  const particles = pts.map(([x, y]) => particle(x, y, id));

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

  return { particles, springs };
}

function drawSoftBody(
  context: CanvasRenderingContext2D,
  sb: SoftBody,
  doSmooth: boolean
) {
  const pts = sb.particles.map((p) => [p.x, p.y]);
  let output = pts;

  if (doSmooth) {
    // Smooth path
    for (let index = 0; index < 4; index++) {
      output = smooth(output);
    }
  }

  context.fillStyle = 'black';
  context.beginPath();
  drawPath(context, output, true);
  context.fill();

  if (debug) {
    context.fillStyle = 'black';
    pts.forEach((pt) => {
      context.beginPath();
      context.arc(pt[0], pt[1], particleR, 0, Math.PI * 2);
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
}

function particle(x: number, y: number, parentId: number) {
  const p = new VerletParticle2D(new Vec2D(x, y));
  physics.addParticle(p);
  p.parentId = parentId;
  return p;
}

function checkCollision(
  p: typeof VerletParticle2D,
  siblings: (typeof VerletParticle2D)[]
) {
  for (let t of siblings) {
    if (p != t) {
      let dist = p.distanceTo(t);
      let minDist = particleR * 2;

      if (dist <= minDist) {
        let l = t.sub(p).normalize();
        let o = t.getVelocity().sub(p.getVelocity());
        let r = l.scale((2 * o.dot(l)) / 2);
        let h = l.scale(minDist - dist);

        p.addForce(r.scale(0.5 /* 1 / p.weight */));
        t.addForce(r.scale(-0.5 /* -1 / t.weight */));
        p.addForce(h.scale(-0.5 /* -1 / p.weight */));
        t.addForce(h.scale(0.5 /* 1 / t.weight */));
      }
    }
  }
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
