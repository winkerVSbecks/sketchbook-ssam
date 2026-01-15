import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';

// Boundary - represents a wall
type Boundary = {
  a: Vector;
  b: Vector;
};

const createBoundary = (x1: number, y1: number, x2: number, y2: number): Boundary => {
  return {
    a: new Vector(x1, y1),
    b: new Vector(x2, y2),
  };
};

const showBoundary = (ctx: CanvasRenderingContext2D, boundary: Boundary) => {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boundary.a.x, boundary.a.y);
  ctx.lineTo(boundary.b.x, boundary.b.y);
  ctx.stroke();
};

// Ray - casts rays and checks for intersections
type Ray = {
  pos: Vector;
  dir: Vector;
};

const createRay = (pos: Vector, angle: number): Ray => {
  return {
    pos,
    dir: Vector.fromAngle(angle),
  };
};

const castRay = (ray: Ray, wall: Boundary): Vector | null => {
  const x1 = wall.a.x;
  const y1 = wall.a.y;
  const x2 = wall.b.x;
  const y2 = wall.b.y;

  const x3 = ray.pos.x;
  const y3 = ray.pos.y;
  const x4 = ray.pos.x + ray.dir.x;
  const y4 = ray.pos.y + ray.dir.y;

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

  if (t > 0 && t < 1 && u > 0) {
    return new Vector(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  }

  return null;
};

// Particle - holds multiple rays and checks all walls
type Particle = {
  pos: Vector;
  rays: Ray[];
};

const createParticle = (width: number, height: number): Particle => {
  const pos = new Vector(width / 2, height / 2);
  const rays: Ray[] = [];

  for (let a = 0; a < 360; a += 1) {
    rays.push(createRay(pos, (a * Math.PI) / 180));
  }

  return { pos, rays };
};

const updateParticle = (particle: Particle, x: number, y: number) => {
  particle.pos.set(x, y);
};

const lookParticle = (
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  walls: Boundary[]
) => {
  for (let i = 0; i < particle.rays.length; i++) {
    const ray = particle.rays[i];
    let closest: Vector | null = null;
    let record = Infinity;

    for (let wall of walls) {
      const pt = castRay(ray, wall);
      if (pt) {
        const d = Vector.dist(particle.pos, pt);
        if (d < record) {
          record = d;
          closest = pt;
        }
      }
    }

    if (closest) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(particle.pos.x, particle.pos.y);
      ctx.lineTo(closest.x, closest.y);
      ctx.stroke();
    }
  }
};

const showParticle = (ctx: CanvasRenderingContext2D, particle: Particle) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(particle.pos.x, particle.pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
};

export const sketch = ({ wrap, context, width, height, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Initialize walls
  const walls: Boundary[] = [];

  // Random interior walls
  for (let i = 0; i < 5; i++) {
    const x1 = Random.range(0, width);
    const x2 = Random.range(0, width);
    const y1 = Random.range(0, height);
    const y2 = Random.range(0, height);
    walls.push(createBoundary(x1, y1, x2, y2));
  }

  // Canvas boundary walls
  walls.push(createBoundary(0, 0, width, 0));
  walls.push(createBoundary(width, 0, width, height));
  walls.push(createBoundary(width, height, 0, height));
  walls.push(createBoundary(0, height, 0, 0));

  // Initialize particle
  const particle = createParticle(width, height);

  // Track mouse position
  let mouseX = width / 2;
  let mouseY = height / 2;

  // Add mouse move listener
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (width / rect.width);
    mouseY = (e.clientY - rect.top) * (height / rect.height);
  });

  wrap.render = ({ playhead }) => {
    // Clear background
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    // Show walls
    for (let wall of walls) {
      showBoundary(context, wall);
    }

    // Update particle position to follow mouse
    updateParticle(particle, mouseX, mouseY);

    // Cast rays and show particle
    lookParticle(context, particle, walls);
    showParticle(context, particle);
  };
};

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
