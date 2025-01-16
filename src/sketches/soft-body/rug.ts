import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import toxi from 'toxiclibsjs';
import smooth from 'chaikin-smooth';
import pack from 'pack-spheres';
import { drawPath } from '@daeinc/draw';
import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import { quadtree as d3Quadtree, Quadtree } from 'd3-quadtree';
import { clrs } from '../../colors/clrs';
// import { palettes } from '../../colors/auto-albers';
import { palettes } from '../../colors/mindful-palettes';

const { VerletPhysics2D, VerletParticle2D, VerletSpring2D } = toxi.physics2d;
const { GravityBehavior } = toxi.physics2d.behaviors;
const { Vec2D, Rect } = toxi.geom;

type Particle = typeof VerletParticle2D;
type Spring = typeof VerletSpring2D;

interface SoftBody {
  shell: Particle[];
  particles: Particle[];
  springs: Spring[];
  color: string;
}

const colors = Random.pick(clrs);
const bg = colors.shift();
const outline = colors.pop()!;

const config = {
  particleR: 10,
  debug: false,
  mode: 'slender', // 'chunky' | 'slender'
};

const physics = new VerletPhysics2D();

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const margin = 0.1 * width;
  let softBodies: SoftBody[] = [];
  let particles: Particle[] = [];

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    if (frame === 0) {
      physics.clear();
      physics.setDrag(0.05);
      const gravity = new GravityBehavior(new Vec2D(0, 0.06));
      physics.addBehavior(gravity);
      let bounds = new Rect(
        margin / 2,
        margin / 2,
        width - margin,
        height - margin
      );
      physics.setWorldBounds(bounds);

      const circles: { position: Point; r: number }[] = pack({
        dimensions: 2,
        padding: config.mode === 'chunky' ? 0.04 : 0.02,
        minRadius: config.mode === 'chunky' ? 0.2 : 0.1,
        maxRadius: config.mode === 'chunky' ? 0.3 : 0.2,
      }).map((s: any) => ({
        position: [
          mapRange(s.position[0], -1, 1, margin / 2, width - margin / 2),
          mapRange(s.position[1], -1, 1, margin / 2, height - margin / 2),
        ],
        r: (s.radius * width) / 2,
      }));

      softBodies = circles.map(({ position, r }, idx) => {
        return softBody(position, r, 34, idx);
      });

      particles = softBodies.flatMap((sb) => sb.shell);
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = outline;
    context.lineWidth = 10;
    context.strokeRect(0, 0, width, height);

    const doSmooth = playhead > 0.8;

    const quadtree = d3Quadtree<Particle>()
      .extent([
        [margin / 2, margin / 2],
        [width - margin, height - margin],
      ])
      .x((b) => b.x)
      .y((b) => b.y)
      .addAll(particles);

    particles.forEach((p) => {
      const neighbours = findParticlesInRadius(quadtree, p, width * 0.2).filter(
        (t) => t.parentId !== p.parentId
      );

      checkCollision(p, neighbours);
    });

    if (!doSmooth) {
      physics.update();
    }

    softBodies.forEach((sb) => {
      drawSoftBody(context, sb, doSmooth);
    });
  };
};

function findParticlesInRadius(
  quadtree: Quadtree<Particle>,
  p: typeof Vec2D,
  radius: number
): Particle[] {
  const neighbours: Particle[] = [];
  const radiusSquared = radius * radius;
  const x = p.x;
  const y = p.y;

  quadtree.visit((node, x1, y1, x2, y2) => {
    if (!node.length) {
      if (node.data) {
        const particle = node.data;
        const dx = particle.x - x;
        const dy = particle.y - y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
          neighbours.push(particle);
        }
      }
      return;
    }

    const closestX = Math.max(x1, Math.min(x, x2));
    const closestY = Math.max(y1, Math.min(y, y2));
    const dx = x - closestX;
    const dy = y - closestY;

    return dx * dx + dy * dy > radiusSquared;
  });

  return neighbours;
}

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

  const springs: Spring[] = [];

  particles.forEach((p, idx) => {
    const next1 = particles[(idx + 1) % particles.length];
    const s1 = spring(p, next1, 0.01);
    springs.push(s1);

    const next2 = particles[(idx + 2) % particles.length];
    const s2 = spring(p, next2, 0.01);
    springs.push(s2);

    const next3 = particles[(idx + 3) % particles.length];
    const s3 = spring(p, next3, 0.01);
    springs.push(s3);

    const next4 = particles[(idx + 4) % particles.length];
    const s4 = spring(p, next4, 0.01);
    springs.push(s4);
  });

  const innerPts = pointsAroundCircle([x, y], radius * 0.6, count);
  const innerParticles = innerPts.map(([x, y]) => particle(x, y, id));

  innerParticles.forEach((p, idx) => {
    const next1 = innerParticles[(idx + 1) % innerParticles.length];
    const s1 = spring(p, next1, 0.01);
    springs.push(s1);

    const next2 = innerParticles[(idx + 2) % innerParticles.length];
    const s2 = spring(p, next2, 0.01);
    springs.push(s2);

    const next3 = innerParticles[(idx + 3) % innerParticles.length];
    const s3 = spring(p, next3, 0.01);
    springs.push(s3);

    const next4 = innerParticles[(idx + 4) % innerParticles.length];
    const s4 = spring(p, next4, 0.01);
    springs.push(s4);
  });

  particles.forEach((p, idx) => {
    const innerP = innerParticles[idx];
    const s = spring(p, innerP, 0.1);
    springs.push(s);
  });

  return {
    shell: particles,
    particles: particles.concat(innerParticles),
    springs,
    color: Random.pick(colors),
  };
}

function drawSoftBody(
  context: CanvasRenderingContext2D,
  sb: SoftBody,
  doSmooth: boolean
) {
  const pts = sb.shell.map((p) => [p.x, p.y]);
  let output = pts;

  if (doSmooth) {
    // Smooth path
    for (let index = 0; index < 8; index++) {
      output = smooth(output);
    }
  }

  if (config.debug) {
    context.lineWidth = 1;
    const particlePts = sb.particles.map((p) => [p.x, p.y]);

    context.fillStyle = '#000';
    particlePts.forEach((pt) => {
      context.beginPath();
      context.arc(pt[0], pt[1], config.particleR, 0, Math.PI * 2);
      context.fill();
    });

    sb.springs.forEach((s) => {
      context.beginPath();
      context.moveTo(s.a.x, s.a.y);
      context.lineTo(s.b.x, s.b.y);
      context.stroke();
    });
  } else {
    context.fillStyle = sb.color;
    context.beginPath();
    drawPath(context, output, true);
    context.fill();
  }
}

function particle(x: number, y: number, parentId: number) {
  const p = new VerletParticle2D(new Vec2D(x, y));
  physics.addParticle(p);
  p.parentId = parentId;
  return p;
}

function checkCollision(p: Particle, siblings: Particle[]) {
  for (let t of siblings) {
    if (p != t) {
      let dist = p.distanceTo(t);
      let minDist = config.particleR * 2;

      if (dist <= minDist) {
        let l = t.sub(p).normalize();
        let o = t.getVelocity().sub(p.getVelocity());
        let r = l.scale((2 * o.dot(l)) / 2);
        let h = l.scale(minDist - dist);

        p.addForce(r.scale(0.5));
        t.addForce(r.scale(-0.5));
        p.addForce(h.scale(-0.5));
        t.addForce(h.scale(0.5));
      }
    }
  }
}

function spring(a: Particle, b: Particle, strength: number) {
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
